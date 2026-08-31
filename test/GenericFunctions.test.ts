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

const WEBSERVICE_TOKEN = 'api-token-secret';
const EXCHANGE_PATH = '/m42Services/api/ApiToken/GenerateAccessTokenFromApiToken';

/** Builds a structurally valid JWT whose payload carries the given `exp` (epoch seconds). */
function makeJwt(expEpochSeconds: number): string {
	const payload = Buffer.from(JSON.stringify({ exp: expEpochSeconds })).toString('base64url');
	return `header.${payload}.signature`;
}

/** A JWT that expires comfortably in the future (16 h, like a real Matrix42 access token). */
function freshJwt(): string {
	return makeJwt(Math.floor(Date.now() / 1000) + 16 * 3600);
}

interface MockContext {
	mockThis: IExecuteFunctions;
	httpRequestWithAuthentication: ReturnType<typeof vi.fn>;
	httpRequest: ReturnType<typeof vi.fn>;
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
	// Default token-path behavior: the exchange mints a fresh JWT, every other
	// request succeeds. Individual tests override with mockImplementation.
	const httpRequest = vi.fn(async (options: IHttpRequestOptions) => {
		if (String(options.url).endsWith(EXCHANGE_PATH)) {
			return { statusCode: 200, body: { RawToken: freshJwt() } };
		}
		return { statusCode: 200, body: { ok: true } };
	});
	const getNodeParameter = vi.fn((name: string, _index?: number) =>
		name === 'authentication' ? authentication : undefined,
	);
	const getCredentials = vi.fn(async (_type: string) => ({
		serverUrl,
		webserviceToken: WEBSERVICE_TOKEN,
		allowUnauthorizedCerts,
		explicitLanguage,
	}));

	const mockThis = mock<IExecuteFunctions>();
	const writableThis = mockThis as unknown as Record<string, unknown>;
	writableThis.getNodeParameter = getNodeParameter;
	writableThis.getCredentials = getCredentials;
	writableThis.getNode = vi.fn(() => ({
		id: 'test-node-id',
		name: 'Matrix42 Test',
		type: 'n8n-nodes-matrix42.matrix42',
		typeVersion: 2,
		position: [0, 0],
		parameters: {},
	}));
	writableThis.helpers = { httpRequestWithAuthentication, httpRequest };

	return { mockThis, httpRequestWithAuthentication, httpRequest, getNodeParameter, getCredentials };
}

/** Splits the recorded httpRequest calls into the exchange calls and the data calls. */
function tokenCalls(ctx: MockContext): {
	exchanges: IHttpRequestOptions[];
	dataCalls: IHttpRequestOptions[];
} {
	const all = ctx.httpRequest.mock.calls.map((call) => call[0] as IHttpRequestOptions);
	return {
		exchanges: all.filter((options) => String(options.url).endsWith(EXCHANGE_PATH)),
		dataCalls: all.filter((options) => !String(options.url).endsWith(EXCHANGE_PATH)),
	};
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

		it('uses matrix42TokenApi and the node-managed token flow when authentication is "webserviceToken"', async () => {
			const ctx = createMockThis({ authentication: 'webserviceToken' });

			await matrix42ApiRequest.call(ctx.mockThis, 'GET', '/tickets', {});

			expect(ctx.getCredentials).toHaveBeenCalledWith('matrix42TokenApi');
			// The token path never goes through httpRequestWithAuthentication —
			// exchange and data request both use the plain httpRequest helper.
			expect(ctx.httpRequestWithAuthentication).not.toHaveBeenCalled();
			const { exchanges, dataCalls } = tokenCalls(ctx);
			expect(exchanges).toHaveLength(1);
			expect(dataCalls).toHaveLength(1);
		});

		it('falls back to matrix42TokenApi for any non-"basic" value', async () => {
			const ctx = createMockThis({ authentication: 'somethingElse' });

			await matrix42ApiRequest.call(ctx.mockThis, 'GET', '/tickets', {});

			expect(ctx.getCredentials).toHaveBeenCalledWith('matrix42TokenApi');
			expect(ctx.httpRequestWithAuthentication).not.toHaveBeenCalled();
			expect(tokenCalls(ctx).exchanges).toHaveLength(1);
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

	describe('token authentication flow', () => {
		const tokenCtx = (overrides: Parameters<typeof createMockThis>[0] = {}) =>
			createMockThis({ authentication: 'webserviceToken', ...overrides });

		it('exchanges the webservice token with an empty JSON POST before the first data request', async () => {
			const ctx = tokenCtx({ allowUnauthorizedCerts: true });

			await matrix42ApiRequest.call(ctx.mockThis, 'GET', '/tickets', {});

			const { exchanges } = tokenCalls(ctx);
			expect(exchanges).toHaveLength(1);
			expect(exchanges[0]).toMatchObject({
				method: 'POST',
				url: `https://m42.example.com${EXCHANGE_PATH}`,
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${WEBSERVICE_TOKEN}`,
				},
				body: {},
				json: true,
				skipSslCertificateValidation: true,
				// non-2xx statuses must come back as data, not as throws
				returnFullResponse: true,
				ignoreHttpStatusErrors: true,
			});
		});

		it('sends the data request with the minted Bearer token and returns the response body', async () => {
			const ctx = tokenCtx({ explicitLanguage: 'de-DE' });
			const jwt = freshJwt();
			ctx.httpRequest.mockImplementation(async (options: IHttpRequestOptions) => {
				if (String(options.url).endsWith(EXCHANGE_PATH)) {
					return { statusCode: 200, body: { RawToken: jwt } };
				}
				return { statusCode: 200, body: [{ ID: 'row-1' }] };
			});

			const result = await matrix42ApiRequest.call(ctx.mockThis, 'GET', '/tickets', {}, { a: 1 });

			const { dataCalls } = tokenCalls(ctx);
			expect(dataCalls).toHaveLength(1);
			expect(dataCalls[0]).toMatchObject({
				method: 'GET',
				url: 'https://m42.example.com/m42Services/api/tickets',
				qs: { a: 1 },
				headers: {
					'Content-Type': 'application/json',
					'Explicit-Language': 'de-DE',
					Authorization: `Bearer ${jwt}`,
				},
			});
			expect(result).toEqual([{ ID: 'row-1' }]);
		});

		it('reuses the cached access token for subsequent requests on the same execution context', async () => {
			const ctx = tokenCtx();

			await matrix42ApiRequest.call(ctx.mockThis, 'GET', '/tickets', {});
			await matrix42ApiRequest.call(ctx.mockThis, 'GET', '/assets', {});
			await matrix42ApiRequest.call(ctx.mockThis, 'POST', '/tickets', { Subject: 's' });

			const { exchanges, dataCalls } = tokenCalls(ctx);
			expect(exchanges).toHaveLength(1);
			expect(dataCalls).toHaveLength(3);
		});

		it('mints a separate token per execution context (no cross-execution reuse)', async () => {
			const first = tokenCtx();
			const second = tokenCtx();

			await matrix42ApiRequest.call(first.mockThis, 'GET', '/tickets', {});
			await matrix42ApiRequest.call(second.mockThis, 'GET', '/tickets', {});

			expect(tokenCalls(first).exchanges).toHaveLength(1);
			expect(tokenCalls(second).exchanges).toHaveLength(1);
		});

		it('re-exchanges when the cached token is about to expire', async () => {
			const ctx = tokenCtx();
			// Expires in 30 s — inside the 60 s refresh buffer, so the second call must re-mint.
			ctx.httpRequest.mockImplementation(async (options: IHttpRequestOptions) => {
				if (String(options.url).endsWith(EXCHANGE_PATH)) {
					return {
						statusCode: 200,
						body: { RawToken: makeJwt(Math.floor(Date.now() / 1000) + 30) },
					};
				}
				return { statusCode: 200, body: {} };
			});

			await matrix42ApiRequest.call(ctx.mockThis, 'GET', '/tickets', {});
			await matrix42ApiRequest.call(ctx.mockThis, 'GET', '/tickets', {});

			expect(tokenCalls(ctx).exchanges).toHaveLength(2);
		});

		it('still works when the minted token is not a parseable JWT (fallback lifetime)', async () => {
			const ctx = tokenCtx();
			ctx.httpRequest.mockImplementation(async (options: IHttpRequestOptions) => {
				if (String(options.url).endsWith(EXCHANGE_PATH)) {
					return { statusCode: 200, body: { RawToken: 'opaque-token' } };
				}
				return { statusCode: 200, body: { ok: true } };
			});

			await matrix42ApiRequest.call(ctx.mockThis, 'GET', '/tickets', {});
			await matrix42ApiRequest.call(ctx.mockThis, 'GET', '/tickets', {});

			const { exchanges, dataCalls } = tokenCalls(ctx);
			// fallback lifetime is minutes long, so the second call still uses the cache
			expect(exchanges).toHaveLength(1);
			expect(dataCalls[0].headers?.Authorization).toBe('Bearer opaque-token');
		});

		it.each([406, 401])(
			'retries exactly once with a freshly minted token when the server answers %i',
			async (statusCode) => {
				const ctx = tokenCtx();
				let mintCount = 0;
				ctx.httpRequest.mockImplementation(async (options: IHttpRequestOptions) => {
					if (String(options.url).endsWith(EXCHANGE_PATH)) {
						mintCount += 1;
						return { statusCode: 200, body: { RawToken: `token-${mintCount}` } };
					}
					const usedToken = String(options.headers?.Authorization);
					if (usedToken === 'Bearer token-1') {
						return { statusCode, body: undefined };
					}
					return { statusCode: 200, body: { recovered: true } };
				});

				const result = await matrix42ApiRequest.call(ctx.mockThis, 'GET', '/tickets', {});

				const { exchanges, dataCalls } = tokenCalls(ctx);
				expect(exchanges).toHaveLength(2);
				expect(dataCalls).toHaveLength(2);
				expect(dataCalls[1].headers?.Authorization).toBe('Bearer token-2');
				expect(result).toEqual({ recovered: true });
			},
		);

		it('does not retry non-auth failures (a 500 is thrown without a second request)', async () => {
			const ctx = tokenCtx();
			ctx.httpRequest.mockImplementation(async (options: IHttpRequestOptions) => {
				if (String(options.url).endsWith(EXCHANGE_PATH)) {
					return { statusCode: 200, body: { RawToken: freshJwt() } };
				}
				return { statusCode: 500, body: { Message: 'boom' } };
			});

			await expect(
				matrix42ApiRequest.call(ctx.mockThis, 'POST', '/ticket/create', { Subject: 's' }),
			).rejects.toMatchObject({ httpCode: '500' });

			const { exchanges, dataCalls } = tokenCalls(ctx);
			expect(exchanges).toHaveLength(1);
			expect(dataCalls).toHaveLength(1);
		});

		it('throws a descriptive auth error when the retry is rejected again', async () => {
			const ctx = tokenCtx();
			ctx.httpRequest.mockImplementation(async (options: IHttpRequestOptions) => {
				if (String(options.url).endsWith(EXCHANGE_PATH)) {
					return { statusCode: 200, body: { RawToken: freshJwt() } };
				}
				return { statusCode: 406, body: undefined };
			});

			await expect(matrix42ApiRequest.call(ctx.mockThis, 'GET', '/tickets', {})).rejects.toMatchObject(
				{
					httpCode: '406',
					description: expect.stringContaining('Webservice Token'),
				},
			);

			const { exchanges, dataCalls } = tokenCalls(ctx);
			expect(exchanges).toHaveLength(2);
			expect(dataCalls).toHaveLength(2);
		});

		it('throws a descriptive error when the token exchange itself is rejected', async () => {
			const ctx = tokenCtx();
			ctx.httpRequest.mockResolvedValue({ statusCode: 406, body: undefined });

			await expect(matrix42ApiRequest.call(ctx.mockThis, 'GET', '/tickets', {})).rejects.toThrow(
				/access-token exchange/,
			);
			expect(tokenCalls(ctx).dataCalls).toHaveLength(0);
		});

		it('throws when the exchange returns 200 without a RawToken', async () => {
			const ctx = tokenCtx();
			ctx.httpRequest.mockResolvedValue({ statusCode: 200, body: { Unexpected: true } });

			await expect(matrix42ApiRequest.call(ctx.mockThis, 'GET', '/tickets', {})).rejects.toThrow(
				/access-token exchange/,
			);
		});

		it('handles runtimes that throw on non-2xx instead of honoring ignoreHttpStatusErrors', async () => {
			const ctx = tokenCtx();
			let mintCount = 0;
			ctx.httpRequest.mockImplementation(async (options: IHttpRequestOptions) => {
				if (String(options.url).endsWith(EXCHANGE_PATH)) {
					mintCount += 1;
					return { statusCode: 200, body: { RawToken: `token-${mintCount}` } };
				}
				if (String(options.headers?.Authorization) === 'Bearer token-1') {
					// axios-style throw of an older n8n runtime
					throw Object.assign(new Error('Request failed with status code 406'), {
						response: { status: 406, data: 'rejected' },
					});
				}
				return { statusCode: 200, body: { recovered: true } };
			});

			const result = await matrix42ApiRequest.call(ctx.mockThis, 'GET', '/tickets', {});

			expect(result).toEqual({ recovered: true });
			expect(tokenCalls(ctx).exchanges).toHaveLength(2);
		});

		it('rethrows errors without an HTTP status (network failure) unchanged', async () => {
			const ctx = tokenCtx();
			const networkError = new Error('ECONNREFUSED');
			ctx.httpRequest.mockImplementation(async (options: IHttpRequestOptions) => {
				if (String(options.url).endsWith(EXCHANGE_PATH)) {
					return { statusCode: 200, body: { RawToken: freshJwt() } };
				}
				throw networkError;
			});

			await expect(matrix42ApiRequest.call(ctx.mockThis, 'GET', '/tickets', {})).rejects.toBe(
				networkError,
			);
		});
	});
});
