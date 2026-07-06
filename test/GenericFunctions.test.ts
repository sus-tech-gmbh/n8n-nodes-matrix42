import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
} from 'n8n-workflow';

import { matrix42ApiRequest, uuidv4 } from '../nodes/Matrix42/GenericFunctions';

interface MockContext {
	mockThis: IExecuteFunctions;
	httpRequestWithAuthentication: ReturnType<typeof vi.fn>;
	getNodeParameter: ReturnType<typeof vi.fn>;
	getCredentials: ReturnType<typeof vi.fn>;
}

function createMockThis(
	overrides: { authentication?: string; serverUrl?: string } = {},
): MockContext {
	const { authentication = 'basic', serverUrl = 'https://m42.example.com' } = overrides;

	const httpRequestWithAuthentication = vi.fn().mockResolvedValue({ ok: true });
	const getNodeParameter = vi.fn((name: string, _index?: number) =>
		name === 'authentication' ? authentication : undefined,
	);
	const getCredentials = vi.fn(async (_type: string) => ({ serverUrl }));

	const mockThis = mock<IExecuteFunctions>();
	const writableThis = mockThis as unknown as Record<string, unknown>;
	writableThis.getNodeParameter = getNodeParameter;
	writableThis.getCredentials = getCredentials;
	writableThis.helpers = { httpRequestWithAuthentication };

	return { mockThis, httpRequestWithAuthentication, getNodeParameter, getCredentials };
}

function capturedOptions(ctx: MockContext): IHttpRequestOptions {
	expect(ctx.httpRequestWithAuthentication).toHaveBeenCalledTimes(1);
	return ctx.httpRequestWithAuthentication.mock.calls[0][1] as IHttpRequestOptions;
}

describe('matrix42ApiRequest', () => {
	describe('credential type selection', () => {
		it('reads the authentication parameter as ("authentication", 0)', async () => {
			const ctx = createMockThis();

			await matrix42ApiRequest.call(ctx.mockThis, 'GET', '/tickets', {});

			expect(ctx.getNodeParameter).toHaveBeenCalledTimes(1);
			expect(ctx.getNodeParameter).toHaveBeenCalledWith('authentication', 0);
		});

		it('uses matrix42BasicApi when authentication is "basic"', async () => {
			const ctx = createMockThis({ authentication: 'basic' });

			await matrix42ApiRequest.call(ctx.mockThis, 'GET', '/tickets', {});

			expect(ctx.getCredentials).toHaveBeenCalledTimes(1);
			expect(ctx.getCredentials).toHaveBeenCalledWith('matrix42BasicApi');
			expect(ctx.httpRequestWithAuthentication.mock.calls[0][0]).toBe('matrix42BasicApi');
		});

		it('uses matrix42TokenApi when authentication is "token"', async () => {
			const ctx = createMockThis({ authentication: 'token' });

			await matrix42ApiRequest.call(ctx.mockThis, 'GET', '/tickets', {});

			expect(ctx.getCredentials).toHaveBeenCalledWith('matrix42TokenApi');
			expect(ctx.httpRequestWithAuthentication.mock.calls[0][0]).toBe('matrix42TokenApi');
		});

		it('falls back to matrix42TokenApi for any non-"basic" value', async () => {
			const ctx = createMockThis({ authentication: 'somethingElse' });

			await matrix42ApiRequest.call(ctx.mockThis, 'GET', '/tickets', {});

			expect(ctx.getCredentials).toHaveBeenCalledWith('matrix42TokenApi');
			expect(ctx.httpRequestWithAuthentication.mock.calls[0][0]).toBe('matrix42TokenApi');
		});
	});

	describe('URL building', () => {
		it('builds the URL as serverUrl + "/m42Services/api" + endpoint', async () => {
			const ctx = createMockThis({ serverUrl: 'https://itsm.example.org' });

			await matrix42ApiRequest.call(ctx.mockThis, 'GET', '/tickets/123', {});

			expect(capturedOptions(ctx).url).toBe(
				'https://itsm.example.org/m42Services/api/tickets/123',
			);
		});

		it('uses the uri argument verbatim as the URL when provided', async () => {
			const ctx = createMockThis({ serverUrl: 'https://itsm.example.org' });

			await matrix42ApiRequest.call(
				ctx.mockThis,
				'GET',
				'/tickets',
				{},
				undefined,
				'https://elsewhere.example.com/custom/path',
			);

			expect(capturedOptions(ctx).url).toBe('https://elsewhere.example.com/custom/path');
		});
	});

	describe('body handling', () => {
		it.each<IHttpRequestMethods>(['GET', 'HEAD', 'DELETE'])(
			'omits the body property entirely for %s requests',
			async (method) => {
				const ctx = createMockThis();

				await matrix42ApiRequest.call(ctx.mockThis, method, '/tickets', { ignored: true });

				const options = capturedOptions(ctx);
				expect(options).not.toHaveProperty('body');
				expect(options.method).toBe(method);
			},
		);

		it.each<IHttpRequestMethods>(['POST', 'PUT'])(
			'passes the body through unchanged for %s requests',
			async (method) => {
				const ctx = createMockThis();
				const body = { Subject: 'Printer broken', Priority: 2 };

				await matrix42ApiRequest.call(ctx.mockThis, method, '/tickets', body);

				const options = capturedOptions(ctx);
				expect(options.body).toBe(body);
				expect(options.method).toBe(method);
			},
		);
	});

	describe('query string handling', () => {
		it('passes the query object through as qs unchanged', async () => {
			const ctx = createMockThis();
			const query: IDataObject = { pageSize: 50, search: 'printer' };

			await matrix42ApiRequest.call(ctx.mockThis, 'GET', '/tickets', {}, query);

			expect(capturedOptions(ctx).qs).toBe(query);
		});

		it('leaves qs undefined when no query is given', async () => {
			const ctx = createMockThis();

			await matrix42ApiRequest.call(ctx.mockThis, 'GET', '/tickets', {});

			expect(capturedOptions(ctx).qs).toBeUndefined();
		});
	});

	describe('content type handling', () => {
		it('defaults to application/json with json: true', async () => {
			const ctx = createMockThis();

			await matrix42ApiRequest.call(ctx.mockThis, 'POST', '/tickets', {});

			const options = capturedOptions(ctx);
			expect(options.headers).toEqual({ 'Content-Type': 'application/json' });
			expect(options.json).toBe(true);
		});

		it('sets json: false and the given Content-Type header for non-JSON content types', async () => {
			const ctx = createMockThis();

			await matrix42ApiRequest.call(
				ctx.mockThis,
				'POST',
				'/attachments',
				{},
				undefined,
				undefined,
				'text/plain',
			);

			const options = capturedOptions(ctx);
			expect(options.headers).toEqual({ 'Content-Type': 'text/plain' });
			expect(options.json).toBe(false);
		});

		it('detects JSON content types case-insensitively and with parameters', async () => {
			const ctx = createMockThis();

			await matrix42ApiRequest.call(
				ctx.mockThis,
				'POST',
				'/tickets',
				{},
				undefined,
				undefined,
				'Application/JSON; charset=utf-8',
			);

			const options = capturedOptions(ctx);
			expect(options.headers).toEqual({ 'Content-Type': 'Application/JSON; charset=utf-8' });
			expect(options.json).toBe(true);
		});
	});

	describe('request options and result propagation', () => {
		it('always sets skipSslCertificateValidation to false', async () => {
			const ctx = createMockThis();

			await matrix42ApiRequest.call(ctx.mockThis, 'GET', '/tickets', {});

			expect(capturedOptions(ctx).skipSslCertificateValidation).toBe(false);
		});

		it('builds the exact options object for a POST request', async () => {
			const ctx = createMockThis({ serverUrl: 'https://m42.example.com' });
			const body = { Name: 'New Asset' };
			const query: IDataObject = { fragment: 'SPSAssetClassBase' };

			await matrix42ApiRequest.call(ctx.mockThis, 'POST', '/assets', body, query);

			expect(capturedOptions(ctx)).toStrictEqual({
				headers: { 'Content-Type': 'application/json' },
				method: 'POST',
				body,
				qs: query,
				url: 'https://m42.example.com/m42Services/api/assets',
				json: true,
				skipSslCertificateValidation: false,
			});
		});

		it('invokes the helper bound to the execution context (this)', async () => {
			const ctx = createMockThis();

			await matrix42ApiRequest.call(ctx.mockThis, 'GET', '/tickets', {});

			expect(ctx.httpRequestWithAuthentication.mock.contexts[0]).toBe(ctx.mockThis);
		});

		it('resolves with the value returned by httpRequestWithAuthentication', async () => {
			const ctx = createMockThis();
			const response = { Id: 'abc-123', State: 1 };
			ctx.httpRequestWithAuthentication.mockResolvedValue(response);

			const result = await matrix42ApiRequest.call(ctx.mockThis, 'GET', '/tickets', {});

			expect(result).toBe(response);
		});

		it('propagates rejections from httpRequestWithAuthentication', async () => {
			const ctx = createMockThis();
			const error = new Error('401 - Unauthorized');
			ctx.httpRequestWithAuthentication.mockRejectedValue(error);

			await expect(
				matrix42ApiRequest.call(ctx.mockThis, 'GET', '/tickets', {}),
			).rejects.toBe(error);
		});
	});
});

describe('uuidv4', () => {
	const UUID_V4_REGEX =
		/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

	it('produces a valid UUID v4 (version nibble 4, variant [89ab]) across many samples', () => {
		for (let i = 0; i < 200; i++) {
			expect(uuidv4()).toMatch(UUID_V4_REGEX);
		}
	});

	it('returns different values on consecutive calls', () => {
		const first = uuidv4();
		const second = uuidv4();

		expect(first).not.toBe(second);
	});
});
