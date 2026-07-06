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
} from '../nodes/Matrix42/Matrix42AsqlFunctions';

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
 * the (name, itemIndex, fallback?) signature used by the source: a name that
 * is absent from the map resolves to the provided fallback (used by
 * getFragments' `additionalFields` parameter).
 */
function createMockThis(params: Record<string, unknown>, response: unknown = {}): MockContext {
	const mockThis = mock<IExecuteFunctions>();
	const httpRequest = vi.fn().mockResolvedValue(response);
	const getNodeParameter = vi.fn(
		(name: string, _itemIndex: number, fallback?: unknown): unknown =>
			Object.prototype.hasOwnProperty.call(params, name) ? params[name] : fallback,
	);
	const getCredentials = vi.fn().mockResolvedValue({ serverUrl: SERVER_URL });

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

	it('sends a GET to /data/fragments/{ddname} with where and columns in the query string and no body', async () => {
		const { mockThis, httpRequest, getNodeParameter, getCredentials } = createMockThis(
			baseParams,
			[],
		);

		await getFragments.call(mockThis, 0);

		expect(httpRequest).toHaveBeenCalledTimes(1);
		const [credentialType, options] = httpRequest.mock.calls[0] as [string, object];
		expect(credentialType).toBe('matrix42BasicApi');
		expect(options).toStrictEqual({
			headers: { 'Content-Type': 'application/json' },
			method: 'GET',
			qs: {
				where: "Subject LIKE '%printer%'",
				columns: 'ID,Subject,State',
			},
			url: `${API_BASE}/data/fragments/SPSActivityClassBase`,
			json: true,
			skipSslCertificateValidation: false,
		});
		// body is removed entirely for GET requests, not just set to undefined
		expect(Object.prototype.hasOwnProperty.call(options, 'body')).toBe(false);
		expect(getCredentials).toHaveBeenCalledWith('matrix42BasicApi');
		// additionalFields is read with an empty-object fallback
		expect(getNodeParameter).toHaveBeenCalledWith('additionalFields', 0, {});
	});

	it('adds pagesize, pagenumber and sort to the query string when additionalFields provides them', async () => {
		const { mockThis, httpRequest } = createMockThis(
			{
				...baseParams,
				additionalFields: { pageSize: 50, pageNumber: 2, sort: 'Subject ASC' },
			},
			[],
		);

		await getFragments.call(mockThis, 0);

		const [, options] = httpRequest.mock.calls[0] as [string, { qs: object }];
		expect(options.qs).toStrictEqual({
			where: "Subject LIKE '%printer%'",
			columns: 'ID,Subject,State',
			pagesize: 50,
			pagenumber: 2,
			sort: 'Subject ASC',
		});
	});

	it('keeps pageSize/pageNumber of 0 (defined check) but drops an empty-string sort (truthiness check)', async () => {
		const { mockThis, httpRequest } = createMockThis(
			{
				...baseParams,
				additionalFields: { pageSize: 0, pageNumber: 0, sort: '' },
			},
			[],
		);

		await getFragments.call(mockThis, 0);

		const [, options] = httpRequest.mock.calls[0] as [string, { qs: object }];
		expect(options.qs).toStrictEqual({
			where: "Subject LIKE '%printer%'",
			columns: 'ID,Subject,State',
			pagesize: 0,
			pagenumber: 0,
		});
	});

	it('spreads an array response into the returned array', async () => {
		const fragments = [{ ID: 'frag-1' }, { ID: 'frag-2' }];
		const { mockThis } = createMockThis(baseParams, fragments);

		const result = await getFragments.call(mockThis, 0);

		expect(result).toStrictEqual([{ ID: 'frag-1' }, { ID: 'frag-2' }]);
	});

	it('wraps a non-array response into a one-element array', async () => {
		const { mockThis } = createMockThis(baseParams, { ID: 'only-one' });

		const result = await getFragments.call(mockThis, 0);

		expect(result).toStrictEqual([{ ID: 'only-one' }]);
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

	it('reads item-scoped parameters at the given item index but authentication always at index 0', async () => {
		const { mockThis, getNodeParameter } = createMockThis(baseParams, []);

		await getFragments.call(mockThis, 3);

		expect(getNodeParameter).toHaveBeenCalledWith('dataDefinition', 3);
		expect(getNodeParameter).toHaveBeenCalledWith('where', 3);
		expect(getNodeParameter).toHaveBeenCalledWith('columns', 3);
		expect(getNodeParameter).toHaveBeenCalledWith('additionalFields', 3, {});
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
			{ body: object } & object,
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
		// the parameter object is passed through by reference, unmodified
		expect(options.body).toBe(fragmentData);
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
		const [credentialType, options] = httpRequest.mock.calls[0] as [string, object];
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
		fragmentId: 'frag-to-delete-123',
	};

	it('sends a DELETE to /data/fragments/{ddname}/{fragmentId} with no body and an empty query string', async () => {
		const { mockThis, httpRequest } = createMockThis(params, undefined);

		await deleteFragment.call(mockThis, 0);

		expect(httpRequest).toHaveBeenCalledTimes(1);
		const [credentialType, options] = httpRequest.mock.calls[0] as [string, object];
		expect(credentialType).toBe('matrix42BasicApi');
		expect(options).toStrictEqual({
			headers: { 'Content-Type': 'application/json' },
			method: 'DELETE',
			qs: {},
			url: `${API_BASE}/data/fragments/SPSCommentClassBase/frag-to-delete-123`,
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
	const objectData = { Name: 'New Computer', 'Ud_Custom': 42 };
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
			{ body: object } & object,
		];
		expect(credentialType).toBe('matrix42BasicApi');
		expect(options).toStrictEqual({
			headers: { 'Content-Type': 'application/json' },
			method: 'POST',
			body: { Name: 'New Computer', 'Ud_Custom': 42 },
			qs: {},
			url: `${API_BASE}/data/objects/SPSComputerType`,
			json: true,
			skipSslCertificateValidation: false,
		});
		expect(options.body).toBe(objectData);
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
		objectId: 'obj-123',
		full: true,
	};

	it('sends a GET to /data/objects/{ciname}/{objectId} with full in the query string and no body', async () => {
		const { mockThis, httpRequest } = createMockThis(params, { ID: 'obj-123' });

		await getObject.call(mockThis, 0);

		expect(httpRequest).toHaveBeenCalledTimes(1);
		const [credentialType, options] = httpRequest.mock.calls[0] as [string, object];
		expect(credentialType).toBe('matrix42BasicApi');
		expect(options).toStrictEqual({
			headers: { 'Content-Type': 'application/json' },
			method: 'GET',
			qs: { full: true },
			url: `${API_BASE}/data/objects/SPSComputerType/obj-123`,
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
		const [credentialType, options] = httpRequest.mock.calls[0] as [string, object];
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
		const [credentialType, options] = httpRequest.mock.calls[0] as [string, object];
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
