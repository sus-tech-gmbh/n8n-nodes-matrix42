import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { IExecuteFunctions } from 'n8n-workflow';

import {
	getFragments,
	addFragment,
	updateFragment,
	deleteFragment,
	addObject,
	getObject,
	updateObject,
	deleteObject,
} from '../nodes/Matrix42/Matrix42DataFunctions';

const SERVER_URL = 'https://m42.example.com';
const API_BASE = `${SERVER_URL}/m42Services/api`;

interface MockContext {
	mockThis: IExecuteFunctions;
	httpRequest: ReturnType<typeof vi.fn>;
	getNodeParameter: ReturnType<typeof vi.fn>;
	getCredentials: ReturnType<typeof vi.fn>;
}

/**
 * Builds an IExecuteFunctions mock. `params` is a per-name value map honoring
 * the (name, itemIndex, fallback?) signature used by the source: a name absent
 * from the map resolves to the provided fallback (this is how the source's
 * `returnAll` -> false, `limit` -> 50 and `additionalFields` -> {} defaults are
 * exercised). `creds` is what getCredentials resolves to.
 */
function createMockThis(
	params: Record<string, unknown>,
	response: unknown = {},
	creds: Record<string, unknown> = { serverUrl: SERVER_URL },
): MockContext {
	const mockThis = mock<IExecuteFunctions>();
	const httpRequest = vi.fn().mockResolvedValue(response);
	const getNodeParameter = vi.fn(
		(name: string, _itemIndex: number, fallback?: unknown): unknown =>
			Object.prototype.hasOwnProperty.call(params, name) ? params[name] : fallback,
	);
	const getCredentials = vi.fn().mockResolvedValue(creds);

	Object.assign(mockThis, {
		getNodeParameter,
		getCredentials,
		helpers: { httpRequestWithAuthentication: httpRequest },
	});

	return { mockThis, httpRequest, getNodeParameter, getCredentials };
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe('getFragments', () => {
	const baseParams = {
		authentication: 'basic',
		dataDefinition: 'SPSActivityClassBase',
		where: "Subject LIKE '%printer%'",
		columns: 'ID,Subject,State',
	};

	it('sends a GET to /data/fragments/{ddname} with where, columns and the default pagesize (limit fallback 50) and no body', async () => {
		const { mockThis, httpRequest, getNodeParameter, getCredentials } = createMockThis(
			baseParams,
			[],
		);

		await getFragments.call(mockThis, 0);

		expect(httpRequest).toHaveBeenCalledTimes(1);
		const [credentialType, options] = httpRequest.mock.calls[0] as [string, Record<string, unknown>];
		expect(credentialType).toBe('matrix42BasicApi');
		expect(options).toStrictEqual({
			headers: { 'Content-Type': 'application/json' },
			method: 'GET',
			qs: {
				where: "Subject LIKE '%printer%'",
				columns: 'ID,Subject,State',
				pagesize: 50,
			},
			url: `${API_BASE}/data/fragments/SPSActivityClassBase`,
			json: true,
			skipSslCertificateValidation: false,
		});
		// body is removed entirely for GET requests, not just set to undefined
		expect(Object.prototype.hasOwnProperty.call(options, 'body')).toBe(false);
		expect(getCredentials).toHaveBeenCalledWith('matrix42BasicApi');
		// returnAll defaults to false, limit defaults to 50, additionalFields defaults to {}
		expect(getNodeParameter).toHaveBeenCalledWith('returnAll', 0, false);
		expect(getNodeParameter).toHaveBeenCalledWith('limit', 0, 50);
		expect(getNodeParameter).toHaveBeenCalledWith('additionalFields', 0, {});
	});

	it('uses the explicit limit as pagesize and only reads additionalFields.sort', async () => {
		const { mockThis, httpRequest } = createMockThis(
			{
				...baseParams,
				limit: 10,
				// pageSize/pageNumber here must be IGNORED by the current source
				additionalFields: { sort: 'Subject ASC', pageSize: 999, pageNumber: 7 },
			},
			[],
		);

		await getFragments.call(mockThis, 0);

		const [, options] = httpRequest.mock.calls[0] as [string, { qs: object }];
		expect(options.qs).toStrictEqual({
			where: "Subject LIKE '%printer%'",
			columns: 'ID,Subject,State',
			sort: 'Subject ASC',
			pagesize: 10,
		});
	});

	it('drops an empty-string sort (truthiness check) but still sets pagesize from limit', async () => {
		const { mockThis, httpRequest } = createMockThis(
			{ ...baseParams, limit: 25, additionalFields: { sort: '' } },
			[],
		);

		await getFragments.call(mockThis, 0);

		const [, options] = httpRequest.mock.calls[0] as [string, { qs: object }];
		expect(options.qs).toStrictEqual({
			where: "Subject LIKE '%printer%'",
			columns: 'ID,Subject,State',
			pagesize: 25,
		});
	});

	it('encodeURIComponent-encodes the data definition name in the path', async () => {
		const { mockThis, httpRequest } = createMockThis(
			{ ...baseParams, dataDefinition: 'SPS Activity/Base' },
			[],
		);

		await getFragments.call(mockThis, 0);

		const [, options] = httpRequest.mock.calls[0] as [string, { url: string }];
		expect(options.url).toBe(`${API_BASE}/data/fragments/SPS%20Activity%2FBase`);
	});

	it('spreads an array response into the returned array (non-returnAll path)', async () => {
		const fragments = [{ ID: 'frag-1' }, { ID: 'frag-2' }];
		const { mockThis } = createMockThis(baseParams, fragments);

		const result = await getFragments.call(mockThis, 0);

		expect(result).toStrictEqual([{ ID: 'frag-1' }, { ID: 'frag-2' }]);
	});

	it('wraps a non-array response into a one-element array (non-returnAll path)', async () => {
		const { mockThis } = createMockThis(baseParams, { ID: 'only-one' });

		const result = await getFragments.call(mockThis, 0);

		expect(result).toStrictEqual([{ ID: 'only-one' }]);
	});

	it('pages with pagesize 500 and an incrementing pagenumber until a short page is returned when returnAll is true', async () => {
		const { mockThis, httpRequest } = createMockThis({ ...baseParams, returnAll: true }, undefined);
		httpRequest.mockReset();
		const fullPage = Array.from({ length: 500 }, (_, k) => ({ ID: `f${k}` }));
		httpRequest.mockResolvedValueOnce(fullPage).mockResolvedValueOnce([{ ID: 'last' }]);

		const result = await getFragments.call(mockThis, 0);

		expect(httpRequest).toHaveBeenCalledTimes(2);

		const [, firstOptions] = httpRequest.mock.calls[0] as [string, { method: string; qs: object }];
		expect(firstOptions.method).toBe('GET');
		expect(firstOptions.qs).toStrictEqual({
			where: "Subject LIKE '%printer%'",
			columns: 'ID,Subject,State',
			pagesize: 500,
			pagenumber: 0,
		});

		const [, secondOptions] = httpRequest.mock.calls[1] as [string, { qs: object }];
		expect(secondOptions.qs).toStrictEqual({
			where: "Subject LIKE '%printer%'",
			columns: 'ID,Subject,State',
			pagesize: 500,
			pagenumber: 1,
		});

		// 500 from the full page + 1 from the short page
		expect(result).toHaveLength(501);
		expect(result[0]).toStrictEqual({ ID: 'f0' });
		expect(result[500]).toStrictEqual({ ID: 'last' });
	});

	it('stops after a single request and wraps a non-array page when returnAll is true', async () => {
		const { mockThis, httpRequest } = createMockThis(
			{ ...baseParams, returnAll: true },
			{ ID: 'single' },
		);

		const result = await getFragments.call(mockThis, 0);

		expect(httpRequest).toHaveBeenCalledTimes(1);
		expect(result).toStrictEqual([{ ID: 'single' }]);
	});

	it('does not read the limit parameter on the returnAll path', async () => {
		const { mockThis, getNodeParameter } = createMockThis(
			{ ...baseParams, returnAll: true },
			[],
		);

		await getFragments.call(mockThis, 0);

		expect(getNodeParameter).not.toHaveBeenCalledWith('limit', expect.anything(), expect.anything());
	});

	it('uses the matrix42TokenApi credential type when authentication is not "basic"', async () => {
		const { mockThis, httpRequest, getCredentials } = createMockThis(
			{ ...baseParams, authentication: 'webserviceToken' },
			[],
		);

		await getFragments.call(mockThis, 0);

		expect(getCredentials).toHaveBeenCalledWith('matrix42TokenApi');
		expect(httpRequest.mock.calls[0][0]).toBe('matrix42TokenApi');
	});

	it('sets skipSslCertificateValidation to true when the credential allows unauthorized certs', async () => {
		const { mockThis, httpRequest } = createMockThis(baseParams, [], {
			serverUrl: SERVER_URL,
			allowUnauthorizedCerts: true,
		});

		await getFragments.call(mockThis, 0);

		const [, options] = httpRequest.mock.calls[0] as [string, { skipSslCertificateValidation: boolean }];
		expect(options.skipSslCertificateValidation).toBe(true);
	});

	it('reads item-scoped parameters at the given item index but authentication always at index 0', async () => {
		const { mockThis, getNodeParameter } = createMockThis(baseParams, []);

		await getFragments.call(mockThis, 3);

		expect(getNodeParameter).toHaveBeenCalledWith('dataDefinition', 3);
		expect(getNodeParameter).toHaveBeenCalledWith('where', 3);
		expect(getNodeParameter).toHaveBeenCalledWith('columns', 3);
		expect(getNodeParameter).toHaveBeenCalledWith('returnAll', 3, false);
		expect(getNodeParameter).toHaveBeenCalledWith('additionalFields', 3, {});
		expect(getNodeParameter).toHaveBeenCalledWith('limit', 3, 50);
		expect(getNodeParameter).toHaveBeenCalledWith('authentication', 0);
	});
});

describe('addFragment', () => {
	const fragmentData = { Subject: 'New fragment', State: 1 };
	const params = {
		authentication: 'basic',
		dataDefinition: 'SPSActivityClassBase',
		fragmentData,
	};

	it('sends a POST to /data/fragments/{ddname} with fragmentData as JSON body and an empty query string', async () => {
		const { mockThis, httpRequest } = createMockThis(params, 'new-fragment-id');

		await addFragment.call(mockThis, 0);

		expect(httpRequest).toHaveBeenCalledTimes(1);
		const [credentialType, options] = httpRequest.mock.calls[0] as [
			string,
			{ body: object } & Record<string, unknown>,
		];
		expect(credentialType).toBe('matrix42BasicApi');
		expect(options).toStrictEqual({
			headers: { 'Content-Type': 'application/json' },
			method: 'POST',
			body: { Subject: 'New fragment', State: 1 },
			qs: {},
			url: `${API_BASE}/data/fragments/SPSActivityClassBase`,
			json: true,
			skipSslCertificateValidation: false,
		});
		// an already-resolved object parameter is passed through by reference, unmodified
		expect(options.body).toBe(fragmentData);
	});

	it('parses a JSON string fragmentData parameter into an object body', async () => {
		const { mockThis, httpRequest } = createMockThis(
			{ ...params, fragmentData: '{"Subject":"From string","State":2}' },
			'id',
		);

		await addFragment.call(mockThis, 0);

		const [, options] = httpRequest.mock.calls[0] as [string, { body: object }];
		expect(options.body).toStrictEqual({ Subject: 'From string', State: 2 });
	});

	it('encodeURIComponent-encodes the data definition name in the path', async () => {
		const { mockThis, httpRequest } = createMockThis(
			{ ...params, dataDefinition: 'Weird Name/X' },
			'id',
		);

		await addFragment.call(mockThis, 0);

		const [, options] = httpRequest.mock.calls[0] as [string, { url: string }];
		expect(options.url).toBe(`${API_BASE}/data/fragments/Weird%20Name%2FX`);
	});

	it('returns the API response wrapped as [{ fragmentId: response }]', async () => {
		const { mockThis } = createMockThis(params, 'aaaa-bbbb-cccc');

		const result = await addFragment.call(mockThis, 0);

		expect(result).toStrictEqual([{ fragmentId: 'aaaa-bbbb-cccc' }]);
	});
});

describe('updateFragment', () => {
	const fragmentData = { ID: 'frag-9', Subject: 'Updated' };
	const params = {
		authentication: 'basic',
		dataDefinition: 'SPSCommentClassBase',
		fragmentData,
	};

	it('sends a PUT to /data/fragments/{ddname} with fragmentData as body and an empty query string', async () => {
		const { mockThis, httpRequest } = createMockThis(params, undefined);

		await updateFragment.call(mockThis, 0);

		expect(httpRequest).toHaveBeenCalledTimes(1);
		const [credentialType, options] = httpRequest.mock.calls[0] as [string, Record<string, unknown>];
		expect(credentialType).toBe('matrix42BasicApi');
		expect(options).toStrictEqual({
			headers: { 'Content-Type': 'application/json' },
			method: 'PUT',
			body: { ID: 'frag-9', Subject: 'Updated' },
			qs: {},
			url: `${API_BASE}/data/fragments/SPSCommentClassBase`,
			json: true,
			skipSslCertificateValidation: false,
		});
	});

	it('returns [{ Message: "Success" }] regardless of the API response', async () => {
		const { mockThis } = createMockThis(params, { anything: 'ignored' });

		const result = await updateFragment.call(mockThis, 0);

		expect(result).toStrictEqual([{ Message: 'Success' }]);
	});
});

describe('deleteFragment', () => {
	const params = {
		authentication: 'basic',
		dataDefinition: 'SPSCommentClassBase',
		fragmentId: 'frag/to delete-123',
	};

	it('sends a DELETE to /data/fragments/{ddname}/{fragmentId} with both path segments encoded, no body and an empty query string', async () => {
		const { mockThis, httpRequest } = createMockThis(params, undefined);

		await deleteFragment.call(mockThis, 0);

		expect(httpRequest).toHaveBeenCalledTimes(1);
		const [credentialType, options] = httpRequest.mock.calls[0] as [string, Record<string, unknown>];
		expect(credentialType).toBe('matrix42BasicApi');
		expect(options).toStrictEqual({
			headers: { 'Content-Type': 'application/json' },
			method: 'DELETE',
			qs: {},
			url: `${API_BASE}/data/fragments/SPSCommentClassBase/frag%2Fto%20delete-123`,
			json: true,
			skipSslCertificateValidation: false,
		});
		// body is removed entirely for DELETE requests
		expect(Object.prototype.hasOwnProperty.call(options, 'body')).toBe(false);
	});

	it('returns [{ Message: "Success" }]', async () => {
		const { mockThis } = createMockThis(params, undefined);

		const result = await deleteFragment.call(mockThis, 0);

		expect(result).toStrictEqual([{ Message: 'Success' }]);
	});
});

describe('addObject', () => {
	const objectData = { Name: 'New Computer', Ud_Custom: 42 };
	const params = {
		authentication: 'basic',
		configurationItem: 'SPSComputerType',
		objectData,
	};

	it('sends a POST to /data/objects/{ciname} with objectData as body and an empty query string', async () => {
		const { mockThis, httpRequest } = createMockThis(params, 'new-object-id');

		await addObject.call(mockThis, 0);

		expect(httpRequest).toHaveBeenCalledTimes(1);
		const [credentialType, options] = httpRequest.mock.calls[0] as [
			string,
			{ body: object } & Record<string, unknown>,
		];
		expect(credentialType).toBe('matrix42BasicApi');
		expect(options).toStrictEqual({
			headers: { 'Content-Type': 'application/json' },
			method: 'POST',
			body: { Name: 'New Computer', Ud_Custom: 42 },
			qs: {},
			url: `${API_BASE}/data/objects/SPSComputerType`,
			json: true,
			skipSslCertificateValidation: false,
		});
		expect(options.body).toBe(objectData);
	});

	it('parses a JSON string objectData parameter into an object body', async () => {
		const { mockThis, httpRequest } = createMockThis(
			{ ...params, objectData: '{"Name":"Str","Value":7}' },
			'id',
		);

		await addObject.call(mockThis, 0);

		const [, options] = httpRequest.mock.calls[0] as [string, { body: object }];
		expect(options.body).toStrictEqual({ Name: 'Str', Value: 7 });
	});

	it('encodeURIComponent-encodes the configuration item name in the path', async () => {
		const { mockThis, httpRequest } = createMockThis(
			{ ...params, configurationItem: 'CI Type/One' },
			'id',
		);

		await addObject.call(mockThis, 0);

		const [, options] = httpRequest.mock.calls[0] as [string, { url: string }];
		expect(options.url).toBe(`${API_BASE}/data/objects/CI%20Type%2FOne`);
	});

	it('returns the API response wrapped as [{ objectId: response }]', async () => {
		const { mockThis } = createMockThis(params, 'dddd-eeee-ffff');

		const result = await addObject.call(mockThis, 0);

		expect(result).toStrictEqual([{ objectId: 'dddd-eeee-ffff' }]);
	});
});

describe('getObject', () => {
	const params = {
		authentication: 'basic',
		configurationItem: 'SPSComputerType',
		objectId: 'obj 123/x',
		full: true,
	};

	it('sends a GET to /data/objects/{ciname}/{objectId} with both path segments encoded, full in the query string and no body', async () => {
		const { mockThis, httpRequest } = createMockThis(params, { ID: 'obj-123' });

		await getObject.call(mockThis, 0);

		expect(httpRequest).toHaveBeenCalledTimes(1);
		const [credentialType, options] = httpRequest.mock.calls[0] as [string, Record<string, unknown>];
		expect(credentialType).toBe('matrix42BasicApi');
		expect(options).toStrictEqual({
			headers: { 'Content-Type': 'application/json' },
			method: 'GET',
			qs: { full: true },
			url: `${API_BASE}/data/objects/SPSComputerType/obj%20123%2Fx`,
			json: true,
			skipSslCertificateValidation: false,
		});
		expect(Object.prototype.hasOwnProperty.call(options, 'body')).toBe(false);
	});

	it('passes full: false through to the query string', async () => {
		const { mockThis, httpRequest } = createMockThis({ ...params, full: false }, {});

		await getObject.call(mockThis, 0);

		const [, options] = httpRequest.mock.calls[0] as [string, { qs: object }];
		expect(options.qs).toStrictEqual({ full: false });
	});

	it('returns the response object wrapped in a one-element array', async () => {
		const response = { ID: 'obj-123', Name: 'PC-01' };
		const { mockThis } = createMockThis(params, response);

		const result = await getObject.call(mockThis, 0);

		expect(result).toStrictEqual([{ ID: 'obj-123', Name: 'PC-01' }]);
	});
});

describe('updateObject', () => {
	const objectData = { ID: 'obj-123', Name: 'PC-01-renamed' };
	const params = {
		authentication: 'basic',
		configurationItem: 'SPSComputerType',
		objectData,
		full: true,
	};

	it('sends a PUT to /data/objects/{ciname} (no object id in the path) with objectData as body and full in the query string', async () => {
		const { mockThis, httpRequest } = createMockThis(params, undefined);

		await updateObject.call(mockThis, 0);

		expect(httpRequest).toHaveBeenCalledTimes(1);
		const [credentialType, options] = httpRequest.mock.calls[0] as [string, Record<string, unknown>];
		expect(credentialType).toBe('matrix42BasicApi');
		expect(options).toStrictEqual({
			headers: { 'Content-Type': 'application/json' },
			method: 'PUT',
			body: { ID: 'obj-123', Name: 'PC-01-renamed' },
			qs: { full: true },
			url: `${API_BASE}/data/objects/SPSComputerType`,
			json: true,
			skipSslCertificateValidation: false,
		});
	});

	it('returns [{ Message: "Success" }] regardless of the API response', async () => {
		const { mockThis } = createMockThis(params, { some: 'payload' });

		const result = await updateObject.call(mockThis, 0);

		expect(result).toStrictEqual([{ Message: 'Success' }]);
	});
});

describe('deleteObject', () => {
	const params = {
		authentication: 'basic',
		configurationItem: 'SPSComputerType',
		objectId: 'obj-to-delete-456',
	};

	it('sends a DELETE to /data/objects/{ciname}/{objectId} with no body and an empty query string', async () => {
		const { mockThis, httpRequest } = createMockThis(params, undefined);

		await deleteObject.call(mockThis, 0);

		expect(httpRequest).toHaveBeenCalledTimes(1);
		const [credentialType, options] = httpRequest.mock.calls[0] as [string, Record<string, unknown>];
		expect(credentialType).toBe('matrix42BasicApi');
		expect(options).toStrictEqual({
			headers: { 'Content-Type': 'application/json' },
			method: 'DELETE',
			qs: {},
			url: `${API_BASE}/data/objects/SPSComputerType/obj-to-delete-456`,
			json: true,
			skipSslCertificateValidation: false,
		});
		expect(Object.prototype.hasOwnProperty.call(options, 'body')).toBe(false);
	});

	it('returns [{ Message: "Success" }]', async () => {
		const { mockThis } = createMockThis(params, undefined);

		const result = await deleteObject.call(mockThis, 0);

		expect(result).toStrictEqual([{ Message: 'Success' }]);
	});
});
