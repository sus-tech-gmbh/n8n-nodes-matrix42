import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
} from 'n8n-workflow';

import {
	escapeAsqlString,
	matrix42ApiRequest,
	normalizeServerUrl,
} from '../nodes/Matrix42/GenericFunctions';

interface MockContext {
	mockThis: IExecuteFunctions;
	httpRequestWithAuthentication: ReturnType<typeof vi.fn>;
	getNodeParameter: ReturnType<typeof vi.fn>;
	getCredentials: ReturnType<typeof vi.fn>;
}

function createMockThis(
	overrides: {
		authentication?: string;
		serverUrl?: string;
		allowUnauthorizedCerts?: boolean;
		explicitLanguage?: string;
	} = {},
): MockContext {
	const { authentication = 'basic', serverUrl = 'https://m42.example.com' } = overrides;
	const allowUnauthorizedCerts = overrides.allowUnauthorizedCerts;
	const explicitLanguage = overrides.explicitLanguage;

	const httpRequestWithAuthentication = vi.fn().mockResolvedValue({ ok: true });
	const getNodeParameter = vi.fn((name: string, _index?: number) =>
		name === 'authentication' ? authentication : undefined,
	);
	const getCredentials = vi.fn(async (_type: string) => ({
		serverUrl,
		allowUnauthorizedCerts,
		explicitLanguage,
	}));

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

describe('normalizeServerUrl', () => {
	it('returns the URL unchanged when there is no trailing slash', () => {
		expect(normalizeServerUrl('https://m42.example.com')).toBe('https://m42.example.com');
	});

	it('strips a single trailing slash', () => {
		expect(normalizeServerUrl('https://m42.example.com/')).toBe('https://m42.example.com');
	});

	it('strips multiple trailing slashes', () => {
		expect(normalizeServerUrl('https://m42.example.com///')).toBe('https://m42.example.com');
	});

	it('preserves a path but strips its trailing slash', () => {
		expect(normalizeServerUrl('https://m42.example.com/base/')).toBe(
			'https://m42.example.com/base',
		);
	});

	it('only touches trailing slashes, not internal ones', () => {
		expect(normalizeServerUrl('https://m42.example.com/a/b/c')).toBe(
			'https://m42.example.com/a/b/c',
		);
	});

	it('returns an empty string unchanged', () => {
		expect(normalizeServerUrl('')).toBe('');
	});
});

describe('escapeAsqlString', () => {
	it('leaves a string without single quotes unchanged', () => {
		expect(escapeAsqlString('no quotes here')).toBe('no quotes here');
	});

	it('doubles a single quote', () => {
		expect(escapeAsqlString("O'Brien")).toBe("O''Brien");
	});

	it('doubles every single quote independently', () => {
		expect(escapeAsqlString("a'b'c")).toBe("a''b''c");
	});

	it('doubles a run of consecutive single quotes', () => {
		expect(escapeAsqlString("''")).toBe("''''");
	});

	it('returns an empty string unchanged', () => {
		expect(escapeAsqlString('')).toBe('');
	});
});

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

			expect(capturedOptions(ctx).url).toBe('https://itsm.example.org/m42Services/api/tickets/123');
		});

		it('strips a trailing slash from the serverUrl before building the URL', async () => {
			const ctx = createMockThis({ serverUrl: 'https://itsm.example.org/' });

			await matrix42ApiRequest.call(ctx.mockThis, 'GET', '/tickets', {});

			expect(capturedOptions(ctx).url).toBe('https://itsm.example.org/m42Services/api/tickets');
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
		it.each<IHttpRequestMethods>(['GET', 'HEAD'])(
			'omits the body property entirely for %s requests even with a non-empty body',
			async (method) => {
				const ctx = createMockThis();

				await matrix42ApiRequest.call(ctx.mockThis, method, '/tickets', { ignored: true });

				const options = capturedOptions(ctx);
				expect(options).not.toHaveProperty('body');
				expect(options.method).toBe(method);
			},
		);

		it('omits the body property for DELETE when the body is empty', async () => {
			const ctx = createMockThis();

			await matrix42ApiRequest.call(ctx.mockThis, 'DELETE', '/tickets/123', {});

			const options = capturedOptions(ctx);
			expect(options).not.toHaveProperty('body');
			expect(options.method).toBe('DELETE');
		});

		it('sends the body for DELETE when the body is non-empty', async () => {
			const ctx = createMockThis();
			const body = { Reason: 'cleanup' };

			await matrix42ApiRequest.call(ctx.mockThis, 'DELETE', '/tickets/123', body);

			const options = capturedOptions(ctx);
			expect(options.body).toBe(body);
			expect(options.method).toBe('DELETE');
		});

		it.each<IHttpRequestMethods>(['POST', 'PUT'])(
			'passes a non-empty body through unchanged for %s requests',
			async (method) => {
				const ctx = createMockThis();
				const body = { Subject: 'Printer broken', Priority: 2 };

				await matrix42ApiRequest.call(ctx.mockThis, method, '/tickets', body);

				const options = capturedOptions(ctx);
				expect(options.body).toBe(body);
				expect(options.method).toBe(method);
			},
		);

		it.each<IHttpRequestMethods>(['POST', 'PUT'])(
			'omits the body property for %s requests when the body is empty',
			async (method) => {
				const ctx = createMockThis();

				await matrix42ApiRequest.call(ctx.mockThis, method, '/tickets', {});

				const options = capturedOptions(ctx);
				expect(options).not.toHaveProperty('body');
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

	describe('SSL certificate validation', () => {
		it('sets skipSslCertificateValidation to false when allowUnauthorizedCerts is undefined', async () => {
			const ctx = createMockThis();

			await matrix42ApiRequest.call(ctx.mockThis, 'GET', '/tickets', {});

			expect(capturedOptions(ctx).skipSslCertificateValidation).toBe(false);
		});

		it('sets skipSslCertificateValidation to true when allowUnauthorizedCerts is true', async () => {
			const ctx = createMockThis({ allowUnauthorizedCerts: true });

			await matrix42ApiRequest.call(ctx.mockThis, 'GET', '/tickets', {});

			expect(capturedOptions(ctx).skipSslCertificateValidation).toBe(true);
		});

		it('sets skipSslCertificateValidation to false when allowUnauthorizedCerts is false', async () => {
			const ctx = createMockThis({ allowUnauthorizedCerts: false });

			await matrix42ApiRequest.call(ctx.mockThis, 'GET', '/tickets', {});

			expect(capturedOptions(ctx).skipSslCertificateValidation).toBe(false);
		});
	});

	describe('Explicit-Language header', () => {
		it('adds the Explicit-Language header when the credential sets explicitLanguage', async () => {
			const ctx = createMockThis({ explicitLanguage: 'de-DE' });

			await matrix42ApiRequest.call(ctx.mockThis, 'GET', '/tickets', {});

			expect(capturedOptions(ctx).headers).toEqual({
				'Content-Type': 'application/json',
				'Explicit-Language': 'de-DE',
			});
		});

		it('omits the Explicit-Language header when explicitLanguage is empty', async () => {
			const ctx = createMockThis({ explicitLanguage: '' });

			await matrix42ApiRequest.call(ctx.mockThis, 'GET', '/tickets', {});

			expect(capturedOptions(ctx).headers).toEqual({ 'Content-Type': 'application/json' });
		});

		it('omits the Explicit-Language header when explicitLanguage is undefined', async () => {
			const ctx = createMockThis({});

			await matrix42ApiRequest.call(ctx.mockThis, 'GET', '/tickets', {});

			expect(capturedOptions(ctx).headers).not.toHaveProperty('Explicit-Language');
		});
	});

	describe('request options and result propagation', () => {
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

			await expect(matrix42ApiRequest.call(ctx.mockThis, 'GET', '/tickets', {})).rejects.toBe(
				error,
			);
		});
	});
});
