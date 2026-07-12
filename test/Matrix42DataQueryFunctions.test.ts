import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { IExecuteFunctions, IHttpRequestOptions } from 'n8n-workflow';

import { getData } from '../nodes/Matrix42/Matrix42DataQueryFunctions';

const SERVER_URL = 'https://m42.example.com';
const API_BASE = `${SERVER_URL}/m42Services/api`;

type ParamMap = Record<string, unknown>;

function buildMockThis(params: ParamMap) {
	const httpRequestWithAuthentication = vi.fn();
	const getNodeParameter = vi.fn((name: string, _index?: number, fallback?: unknown): unknown => {
		if (Object.prototype.hasOwnProperty.call(params, name)) {
			return params[name];
		}
		return fallback;
	});
	const getCredentials = vi.fn(async () => ({ serverUrl: SERVER_URL, allowUnauthorizedCerts: false }));

	const mockThis = mock<IExecuteFunctions>();
	const writable = mockThis as unknown as Record<string, unknown>;
	writable.getNodeParameter = getNodeParameter;
	writable.getCredentials = getCredentials;
	writable.helpers = { httpRequestWithAuthentication };

	return { mockThis, httpRequestWithAuthentication };
}

function callOptions(http: ReturnType<typeof vi.fn>, index = 0): IHttpRequestOptions {
	return http.mock.calls[index][1] as IHttpRequestOptions;
}

describe('getData', () => {
	beforeEach(() => vi.clearAllMocks());

	it('fetches a single page: POST /DataQuery/{id} with pageSize and page, wrapping the array', async () => {
		const { mockThis, httpRequestWithAuthentication } = buildMockThis({
			authentication: 'token',
			dataQueryId: 'dq-1',
			returnAll: false,
			pageSize: 50,
			page: 2,
			additionalFields: {},
		});
		httpRequestWithAuthentication.mockResolvedValue([{ Id: 'a' }, { Id: 'b' }]);

		const result = await getData.call(mockThis, 0);

		expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(1);
		const options = callOptions(httpRequestWithAuthentication);
		expect(options.method).toBe('POST');
		expect(options.url).toBe(`${API_BASE}/DataQuery/dq-1`);
		expect(options.qs).toEqual({ pageSize: 50, page: 2 });
		expect(result).toEqual([{ Id: 'a' }, { Id: 'b' }]);
	});

	it('URL-encodes the data query id', async () => {
		const { mockThis, httpRequestWithAuthentication } = buildMockThis({
			authentication: 'token',
			dataQueryId: 'a b/c',
			returnAll: false,
			pageSize: 10,
			page: 0,
			additionalFields: {},
		});
		httpRequestWithAuthentication.mockResolvedValue([]);

		await getData.call(mockThis, 0);

		expect(callOptions(httpRequestWithAuthentication).url).toBe(`${API_BASE}/DataQuery/a%20b%2Fc`);
	});

	it('maps optional Additional Fields to the exact query keys, skipping empty strings', async () => {
		const { mockThis, httpRequestWithAuthentication } = buildMockThis({
			authentication: 'token',
			dataQueryId: 'dq-1',
			returnAll: false,
			pageSize: 25,
			page: 0,
			additionalFields: {
				orderBy: 'Name ASC',
				search: '',
				filtersOperator: 0,
				archivedData: true,
				forceConsiderParentFilters: false,
				entityTypes: 'TypeA',
				columns: 'Name,State',
			},
		});
		httpRequestWithAuthentication.mockResolvedValue([]);

		await getData.call(mockThis, 0);

		expect(callOptions(httpRequestWithAuthentication).qs).toEqual({
			pageSize: 25,
			page: 0,
			orderBy: 'Name ASC',
			filtersOperator: 0,
			ArchivedData: true,
			ForceConsiderParentFilters: false,
			EntityTypes: 'TypeA',
			columns: 'Name,State',
			// `search: ''` is omitted
		});
	});

	it('returnAll pages until a short page is returned (pages are zero-based)', async () => {
		const { mockThis, httpRequestWithAuthentication } = buildMockThis({
			authentication: 'token',
			dataQueryId: 'dq-1',
			returnAll: true,
			pageSize: 2,
			additionalFields: { orderBy: 'Name ASC' },
		});
		httpRequestWithAuthentication
			.mockResolvedValueOnce([{ Id: 1 }, { Id: 2 }])
			.mockResolvedValueOnce([{ Id: 3 }, { Id: 4 }])
			.mockResolvedValueOnce([{ Id: 5 }]);

		const result = await getData.call(mockThis, 0);

		expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(3);
		expect(callOptions(httpRequestWithAuthentication, 0).qs).toEqual({ pageSize: 2, page: 0, orderBy: 'Name ASC' });
		expect(callOptions(httpRequestWithAuthentication, 1).qs).toEqual({ pageSize: 2, page: 1, orderBy: 'Name ASC' });
		expect(callOptions(httpRequestWithAuthentication, 2).qs).toEqual({ pageSize: 2, page: 2, orderBy: 'Name ASC' });
		expect(result).toEqual([{ Id: 1 }, { Id: 2 }, { Id: 3 }, { Id: 4 }, { Id: 5 }]);
	});

	it('returnAll makes one more request when the total is an exact multiple of pageSize', async () => {
		const { mockThis, httpRequestWithAuthentication } = buildMockThis({
			authentication: 'token',
			dataQueryId: 'dq-1',
			returnAll: true,
			pageSize: 2,
			additionalFields: {},
		});
		httpRequestWithAuthentication
			.mockResolvedValueOnce([{ Id: 1 }, { Id: 2 }])
			.mockResolvedValueOnce([]);

		const result = await getData.call(mockThis, 0);

		expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(2);
		expect(result).toEqual([{ Id: 1 }, { Id: 2 }]);
	});

	it('sends a parsed userFilters object in the POST body', async () => {
		const { mockThis, httpRequestWithAuthentication } = buildMockThis({
			authentication: 'token',
			dataQueryId: 'dq-1',
			returnAll: false,
			pageSize: 10,
			page: 0,
			additionalFields: {},
			userFilters: '{"LogicalOperator":1,"Conditions":[{"Operator":7,"Property":"Name","Value":["test"]}]}',
		});
		httpRequestWithAuthentication.mockResolvedValue([]);

		await getData.call(mockThis, 0);

		const options = callOptions(httpRequestWithAuthentication);
		expect(options.method).toBe('POST');
		// the parsed QueryFilterGroup is sent as the raw body (not wrapped)
		expect(options.body).toEqual({
			LogicalOperator: 1,
			Conditions: [{ Operator: 7, Property: 'Name', Value: ['test'] }],
		});
	});

	it('sends a default empty filter group when no userFilters is provided', async () => {
		const { mockThis, httpRequestWithAuthentication } = buildMockThis({
			authentication: 'token',
			dataQueryId: 'dq-1',
			returnAll: false,
			pageSize: 10,
			page: 0,
			additionalFields: {},
			userFilters: '',
		});
		httpRequestWithAuthentication.mockResolvedValue([]);

		await getData.call(mockThis, 0);

		expect(callOptions(httpRequestWithAuthentication).body).toEqual({
			LogicalOperator: 1,
			Conditions: [],
		});
	});

	it('wraps a non-array single-page response', async () => {
		const { mockThis, httpRequestWithAuthentication } = buildMockThis({
			authentication: 'token',
			dataQueryId: 'dq-1',
			returnAll: false,
			pageSize: 10,
			page: 0,
			additionalFields: {},
		});
		httpRequestWithAuthentication.mockResolvedValue({ Message: 'x' });

		const result = await getData.call(mockThis, 0);

		expect(result).toEqual([{ Message: 'x' }]);
	});
});
