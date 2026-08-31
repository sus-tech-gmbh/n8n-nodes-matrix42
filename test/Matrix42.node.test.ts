import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';

import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	INode,
	INodeExecutionData,
	INodeProperties,
	INodePropertyOptions,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { Matrix42 } from '../nodes/Matrix42/Matrix42.node';

const SERVER_URL = 'https://m42.example.com';
const API_BASE = `${SERVER_URL}/m42Services/api`;
const NIL_GUID = '00000000-0000-0000-0000-000000000000';
// randomUUID() / node:crypto produces RFC-4122 v4 UUIDs.
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const testNode: INode = {
	id: 'test-node-id',
	name: 'Matrix42 Test',
	type: 'n8n-nodes-matrix42.matrix42',
	typeVersion: 2,
	position: [0, 0],
	parameters: {},
};

// ---------------------------------------------------------------------------
// Mock builders
// ---------------------------------------------------------------------------

interface ExecContext {
	mockThis: IExecuteFunctions;
	http: ReturnType<typeof vi.fn>;
	plainHttp: ReturnType<typeof vi.fn>;
	getNodeParameter: ReturnType<typeof vi.fn>;
	getCredentials: ReturnType<typeof vi.fn>;
	assertBinaryData: ReturnType<typeof vi.fn>;
	getBinaryDataBuffer: ReturnType<typeof vi.fn>;
}

function createExecuteContext(options: {
	items?: INodeExecutionData[];
	params: Record<string, unknown>;
	continueOnFail?: boolean;
	binaryBuffer?: Uint8Array;
	allowUnauthorizedCerts?: boolean;
}): ExecContext {
	const {
		items = [{ json: {} }],
		continueOnFail = false,
		allowUnauthorizedCerts = false,
	} = options;
	// The ticket State field always has a default (200); inject it so ticket:create
	// tests that don't override it behave like the real UI.
	const params = { state: 200, ...options.params };

	const http = vi.fn().mockResolvedValue({ ok: true });
	// Token-path helper (helpers.httpRequest): serves the access-token exchange,
	// succeeds for data calls.
	const plainHttp = vi.fn(async (requestOptions: { url?: unknown }) => {
		if (String(requestOptions.url).endsWith('/ApiToken/GenerateAccessTokenFromApiToken')) {
			return { statusCode: 200, body: { RawToken: 'minted-access-token' } };
		}
		return { statusCode: 200, body: { ok: true } };
	});
	const getNodeParameter = vi.fn((name: string, itemIndex?: number, fallback?: unknown) => {
		if (Object.prototype.hasOwnProperty.call(params, name)) {
			const value = params[name];
			return typeof value === 'function' ? (value as (i?: number) => unknown)(itemIndex) : value;
		}
		return fallback;
	});
	const getCredentials = vi.fn(async (_credentialType?: string) => ({
		serverUrl: SERVER_URL,
		allowUnauthorizedCerts,
	}));
	const assertBinaryData = vi.fn();
	const getBinaryDataBuffer = vi.fn(async () => options.binaryBuffer ?? new Uint8Array(0));

	const mockThis = mock<IExecuteFunctions>();
	const writable = mockThis as unknown as Record<string, unknown>;
	writable.getInputData = vi.fn(() => items);
	writable.getNodeParameter = getNodeParameter;
	writable.getCredentials = getCredentials;
	writable.continueOnFail = vi.fn(() => continueOnFail);
	writable.getNode = vi.fn(() => testNode);
	writable.helpers = {
		httpRequestWithAuthentication: http,
		httpRequest: plainHttp,
		returnJsonArray: (data: IDataObject | IDataObject[]): INodeExecutionData[] =>
			(Array.isArray(data) ? data : [data]).map((json) => ({ json })),
		constructExecutionMetaData: (
			data: INodeExecutionData[],
			{ itemData }: { itemData: { item: number } },
		): INodeExecutionData[] => data.map((entry) => ({ ...entry, pairedItem: itemData })),
		assertBinaryData,
		getBinaryDataBuffer,
	};

	return {
		mockThis,
		http,
		plainHttp,
		getNodeParameter,
		getCredentials,
		assertBinaryData,
		getBinaryDataBuffer,
	};
}

interface LoadContext {
	mockThis: ILoadOptionsFunctions;
	http: ReturnType<typeof vi.fn>;
}

function createLoadOptionsContext(
	responses: unknown[],
	params: Record<string, unknown> = {},
): LoadContext {
	const http = vi.fn();
	for (const response of responses) {
		http.mockResolvedValueOnce(response);
	}

	const allParams: Record<string, unknown> = { authentication: 'basic', ...params };
	// matrix42ApiRequest reads getNodeParameter('authentication', 0); loadOptions read
	// getNodeParameter('category'). Both signatures resolve by name here.
	const getNodeParameter = vi.fn((name: string, fallback?: unknown) =>
		Object.prototype.hasOwnProperty.call(allParams, name) ? allParams[name] : fallback,
	);

	const mockThis = mock<ILoadOptionsFunctions>();
	const writable = mockThis as unknown as Record<string, unknown>;
	writable.getNodeParameter = getNodeParameter;
	writable.getCredentials = vi.fn(async () => ({
		serverUrl: SERVER_URL,
		allowUnauthorizedCerts: false,
	}));
	writable.getNode = vi.fn(() => testNode);
	writable.helpers = { httpRequestWithAuthentication: http };

	return { mockThis, http };
}

function httpCall(
	http: ReturnType<typeof vi.fn>,
	index = 0,
): { credentialType: string; options: IHttpRequestOptions } {
	const call = http.mock.calls[index] as [string, IHttpRequestOptions];
	return { credentialType: call[0], options: call[1] };
}

function shownOperations(prop: INodeProperties): string[] {
	return (prop.displayOptions?.show?.operation ?? []) as string[];
}

function shownResources(prop: INodeProperties): string[] {
	return (prop.displayOptions?.show?.resource ?? []) as string[];
}

function optionValues(prop: INodeProperties): Array<string | number> {
	return (prop.options as INodePropertyOptions[]).map((o) => o.value as string | number);
}

// ---------------------------------------------------------------------------
// Reference data (mirrors the current source's declared resources/operations/fields)
// ---------------------------------------------------------------------------

const RESOURCE_OPERATIONS: Record<string, string[]> = {
	dataFragment: ['create', 'delete', 'getAll', 'update'],
	dataObject: ['create', 'delete', 'get', 'update'],
	dataQuery: ['getData'],
	import: ['execute'],
	storage: ['upload'],
	ticket: ['addJournalEntry', 'close', 'create', 'transform'],
};

const OPERATION_DEFAULTS: Record<string, string> = {
	dataFragment: 'getAll',
	dataObject: 'get',
	dataQuery: 'getData',
	import: 'execute',
	storage: 'upload',
	ticket: 'create',
};

// Fields gated by BOTH resource and operation (operation values now repeat across resources).
const FIELDS: Record<string, Record<string, string[]>> = {
	dataFragment: {
		getAll: ['dataDefinition', 'where', 'columns', 'returnAll', 'limit', 'additionalFields'],
		create: ['dataDefinition', 'fragmentData'],
		update: ['dataDefinition', 'fragmentData'],
		delete: ['dataDefinition', 'fragmentId'],
	},
	dataObject: {
		create: ['configurationItem', 'objectData'],
		get: ['configurationItem', 'objectId', 'full'],
		update: ['configurationItem', 'objectData', 'full'],
		delete: ['configurationItem', 'objectId'],
	},
	dataQuery: {
		getData: ['dataQueryId', 'returnAll', 'pageSize', 'page', 'additionalFields'],
	},
	ticket: {
		create: [
			'ticketType',
			'category',
			'subject',
			'descriptionHTML',
			'impact',
			'urgency',
			'priority',
			'state',
			'additionalFields',
		],
		close: [
			'ticketEoid',
			'closeRelatedIncidents',
			'reason',
			'errorType',
			'comments',
			'servicesAvailability',
			'assetsAvailability',
			'sendMailToInitiator',
			'notifyResponsible',
			'sendMailToUsers',
			'sendMailToRelatedResponsibleUsers',
		],
		transform: ['ticketEoid', 'sourceTypeName', 'targetTypeName', 'category', 'additionalFields'],
		addJournalEntry: ['ticketEoid', 'comments', 'entryType', 'creator', 'visibleInPortal', 'additionalFields'],
	},
	import: {
		execute: ['sequenceEoid'],
	},
	storage: {
		upload: ['filename', 'storageId', 'objectId', 'binaryPropertyName', 'additionalFields'],
	},
};

// ---------------------------------------------------------------------------
// 1) Description sanity
// ---------------------------------------------------------------------------

describe('Matrix42 node description', () => {
	const node = new Matrix42();
	const description = node.description;

	it('exposes the expected static metadata', () => {
		expect(description.displayName).toBe('Matrix42');
		expect(description.name).toBe('matrix42');
		expect(description.group).toEqual(['transform']);
		expect(description.version).toBe(2);
		expect(description.subtitle).toBe('={{$parameter["operation"] + ": " + $parameter["resource"]}}');
		expect(description.description).toBe('Interact with the Matrix42 ESMP web services API');
		expect(description.defaults).toEqual({ name: 'Matrix42' });
		expect(description.usableAsTool).toBe(true);
		expect(description.icon).toEqual({ light: 'file:matrix42.svg', dark: 'file:matrix42.dark.svg' });
	});

	it('has a single main input and a single main output', () => {
		expect(description.inputs).toEqual([NodeConnectionTypes.Main]);
		expect(description.outputs).toEqual([NodeConnectionTypes.Main]);
	});

	it('declares both credentials, each gated by the authentication parameter', () => {
		expect(description.credentials).toEqual([
			{
				name: 'matrix42TokenApi',
				displayName: 'Matrix42 Webservice Token Auth',
				required: true,
				displayOptions: {
					show: {
						authentication: ['webserviceToken'],
					},
				},
			},
			{
				name: 'matrix42BasicApi',
				displayName: 'Matrix42 Basic Auth',
				required: true,
				displayOptions: {
					show: {
						authentication: ['basic'],
					},
				},
			},
		]);
	});

	it('has an authentication parameter matching the credential gates', () => {
		const authentication = description.properties.find((p) => p.name === 'authentication');
		expect(authentication).toBeDefined();
		expect(authentication!.type).toBe('options');
		expect(authentication!.default).toBe('webserviceToken');
		expect(authentication!.displayOptions).toBeUndefined();
		expect(authentication!.options).toEqual([
			{ name: 'Webservice Token', value: 'webserviceToken' },
			{ name: 'Basic', value: 'basic' },
		]);
	});

	it('has a resource parameter with exactly [dataFragment, dataObject, dataQuery, import, storage, ticket]', () => {
		const resource = description.properties.find((p) => p.name === 'resource');
		expect(resource).toBeDefined();
		expect(resource!.type).toBe('options');
		expect(resource!.noDataExpression).toBe(true);
		expect(resource!.default).toBe('ticket');
		expect(resource!.options).toEqual([
			{ name: 'Data Fragment', value: 'dataFragment' },
			{ name: 'Data Object', value: 'dataObject' },
			{ name: 'Data Query', value: 'dataQuery' },
			{ name: 'Import', value: 'import' },
			{ name: 'Storage', value: 'storage' },
			{ name: 'Ticket', value: 'ticket' },
		]);
	});
});

// ---------------------------------------------------------------------------
// 2) Properties integrity
// ---------------------------------------------------------------------------

describe('Matrix42 node properties integrity', () => {
	const node = new Matrix42();
	const properties = node.description.properties;
	const operationProps = properties.filter((p) => p.name === 'operation');

	it('exposes exactly one operation dropdown per resource, gated via displayOptions.show.resource', () => {
		expect(operationProps).toHaveLength(6);

		const gatedResources: string[] = [];
		for (const prop of operationProps) {
			expect(prop.type).toBe('options');
			expect(prop.noDataExpression).toBe(true);
			const resources = shownResources(prop);
			expect(resources).toHaveLength(1);
			// operation dropdowns are gated by resource only (no operation gate)
			expect(shownOperations(prop)).toEqual([]);
			gatedResources.push(resources[0]);
		}

		expect(gatedResources.sort()).toEqual([
			'dataFragment',
			'dataObject',
			'dataQuery',
			'import',
			'storage',
			'ticket',
		]);
	});

	it('lists the expected operations per resource with the expected default', () => {
		for (const prop of operationProps) {
			const resource = shownResources(prop)[0];
			const values = optionValues(prop);
			expect(values, `operations for resource "${resource}"`).toEqual(
				RESOURCE_OPERATIONS[resource],
			);
			expect(prop.default).toBe(OPERATION_DEFAULTS[resource]);
			expect(values).toContain(prop.default);
		}
	});

	it('operation values now repeat across resources, so fields must be gated by resource + operation', () => {
		// create/delete/update appear under multiple resources - a resource+operation
		// pair is required to identify a field unambiguously.
		const allOps = Object.values(RESOURCE_OPERATIONS).flat();
		expect(new Set(allOps).size).toBeLessThan(allOps.length);
	});

	it('gates every non-core property on a known resource + operation pair', () => {
		const fieldProps = properties.filter(
			(p) => !['authentication', 'resource', 'operation'].includes(p.name),
		);
		expect(fieldProps.length).toBeGreaterThan(0);

		for (const prop of fieldProps) {
			const resources = shownResources(prop);
			const operations = shownOperations(prop);
			expect(resources.length, `property "${prop.name}" must be gated by resource`).toBe(1);
			expect(operations.length, `property "${prop.name}" must be gated by operation`).toBeGreaterThan(0);

			const resource = resources[0];
			expect(RESOURCE_OPERATIONS, `property "${prop.name}" gates on unknown resource`).toHaveProperty(
				resource,
			);
			for (const op of operations) {
				expect(
					RESOURCE_OPERATIONS[resource],
					`property "${prop.name}" gates on unknown op "${op}" for resource "${resource}"`,
				).toContain(op);
			}
		}
	});

	it('declares authentication and resource exactly once each', () => {
		expect(properties.filter((p) => p.name === 'authentication')).toHaveLength(1);
		expect(properties.filter((p) => p.name === 'resource')).toHaveLength(1);
	});

	it('has no duplicate name + displayOptions collisions', () => {
		// Visibility key: operation dropdowns are gated by resource only; every other
		// property is gated by the full resource x operation product.
		const visibilityKeys = (prop: INodeProperties): string[] => {
			const resources = shownResources(prop);
			const operations = shownOperations(prop);
			if (prop.name === 'operation') {
				return resources.map((r) => `${r}::*`);
			}
			const keys: string[] = [];
			for (const r of resources) {
				for (const o of operations) {
					keys.push(`${r}::${o}`);
				}
			}
			return keys;
		};

		const byName = new Map<string, INodeProperties[]>();
		for (const prop of properties) {
			const group = byName.get(prop.name) ?? [];
			group.push(prop);
			byName.set(prop.name, group);
		}

		for (const [name, group] of byName) {
			if (group.length < 2) continue;
			for (let a = 0; a < group.length; a++) {
				for (let b = a + 1; b < group.length; b++) {
					const keysA = visibilityKeys(group[a]);
					const keysB = visibilityKeys(group[b]);
					expect(keysA.length, `duplicate "${name}" must be gated`).toBeGreaterThan(0);
					expect(keysB.length, `duplicate "${name}" must be gated`).toBeGreaterThan(0);
					const overlap = keysA.filter((key) => keysB.includes(key));
					expect(overlap, `properties named "${name}" are visible simultaneously`).toEqual([]);
				}
			}
		}
	});

	const fieldCases = Object.entries(FIELDS).flatMap(([resource, ops]) =>
		Object.entries(ops).map(([operation, fields]) => ({ resource, operation, fields })),
	);

	it.each(fieldCases)(
		'exposes exactly the declared fields for $resource:$operation',
		({ resource, operation, fields }) => {
			const visible = properties
				.filter(
					(p) =>
						p.name !== 'operation' &&
						shownResources(p).includes(resource) &&
						shownOperations(p).includes(operation),
				)
				.map((p) => p.name)
				.sort();
			expect(visible).toEqual([...fields].sort());
		},
	);
});

// ---------------------------------------------------------------------------
// 3) execute() dispatch
// ---------------------------------------------------------------------------

describe('Matrix42.execute()', () => {
	const node = new Matrix42();

	// A parameter map that satisfies the operations exercised by the dispatch table.
	const dispatchParams: Record<string, unknown> = {
		authentication: 'basic',
		dataDefinition: 'DDX',
		where: 'W',
		columns: 'C',
		fragmentData: { X: 1 },
		fragmentId: 'frag-1',
		configurationItem: 'CIX',
		objectData: { Y: 2 },
		objectId: 'obj-1',
		full: true,
		ticketType: 5,
		category: 'cat-1',
		subject: 'Subject',
		descriptionHTML: '<p>d</p>',
		impact: 2,
		urgency: 3,
		priority: 2,
		ticketEoid: 'eoid-1',
		closeRelatedIncidents: false,
		reason: 408,
		errorType: 0,
		comments: 'comment',
		servicesAvailability: 10,
		assetsAvailability: 10,
		sendMailToInitiator: true,
		notifyResponsible: true,
		sendMailToUsers: true,
		sendMailToRelatedResponsibleUsers: true,
		sourceTypeName: 'SPSActivityTypeTicket',
		targetTypeName: 'SPSActivityTypeIncident',
		entryType: 5,
		creator: 'user-c',
		visibleInPortal: true,
		sequenceEoid: 'seq-1',
		dataQueryId: 'dq-1',
		additionalFields: {},
	};

	it.each([
		{ resource: 'dataFragment', operation: 'getAll', method: 'GET', endpoint: '/data/fragments/DDX' },
		{ resource: 'dataFragment', operation: 'create', method: 'POST', endpoint: '/data/fragments/DDX' },
		{ resource: 'dataFragment', operation: 'update', method: 'PUT', endpoint: '/data/fragments/DDX' },
		{ resource: 'dataFragment', operation: 'delete', method: 'DELETE', endpoint: '/data/fragments/DDX/frag-1' },
		{ resource: 'dataObject', operation: 'create', method: 'POST', endpoint: '/data/objects/CIX' },
		{ resource: 'dataObject', operation: 'get', method: 'GET', endpoint: '/data/objects/CIX/obj-1' },
		{ resource: 'dataObject', operation: 'update', method: 'PUT', endpoint: '/data/objects/CIX' },
		{ resource: 'dataObject', operation: 'delete', method: 'DELETE', endpoint: '/data/objects/CIX/obj-1' },
		{ resource: 'ticket', operation: 'create', method: 'POST', endpoint: '/ticket/create' },
		{ resource: 'ticket', operation: 'close', method: 'POST', endpoint: '/ticket/close' },
		{ resource: 'ticket', operation: 'transform', method: 'POST', endpoint: '/ticket/transform' },
		{ resource: 'ticket', operation: 'addJournalEntry', method: 'POST', endpoint: '/journal/Add' },
		{ resource: 'import', operation: 'execute', method: 'POST', endpoint: '/importdata/executeimportdefinition' },
		{ resource: 'dataQuery', operation: 'getData', method: 'GET', endpoint: '/DataQuery/dq-1' },
	])(
		'dispatches $resource:$operation to $method $endpoint',
		async ({ resource, operation, method, endpoint }) => {
			const ctx = createExecuteContext({
				params: { ...dispatchParams, resource, operation },
			});
			ctx.http.mockResolvedValue([{ ok: true }]);

			await node.execute.call(ctx.mockThis);

			expect(ctx.http.mock.calls.length).toBeGreaterThan(0);
			const lastCall = httpCall(ctx.http, ctx.http.mock.calls.length - 1);
			expect(lastCall.options.method).toBe(method);
			expect(lastCall.options.url).toBe(`${API_BASE}${endpoint}`);
			expect(lastCall.credentialType).toBe('matrix42BasicApi');
		},
	);

	it('token auth: execute() mints an access token once and sends data requests with it', async () => {
		const ctx = createExecuteContext({
			items: [{ json: {} }, { json: {} }],
			params: {
				...dispatchParams,
				authentication: 'webserviceToken',
				resource: 'dataFragment',
				operation: 'getAll',
				returnAll: false,
				limit: 5,
			},
		});

		await node.execute.call(ctx.mockThis);

		// no request may take the credential-helper path in token mode
		expect(ctx.http).not.toHaveBeenCalled();
		const calls = ctx.plainHttp.mock.calls.map((call) => call[0] as { url: string; headers?: Record<string, string> });
		const exchanges = calls.filter((options) =>
			options.url.endsWith('/ApiToken/GenerateAccessTokenFromApiToken'),
		);
		const dataCalls = calls.filter(
			(options) => !options.url.endsWith('/ApiToken/GenerateAccessTokenFromApiToken'),
		);
		// one execution context → exactly one exchange, shared by both items
		expect(exchanges).toHaveLength(1);
		expect(dataCalls).toHaveLength(2);
		for (const options of dataCalls) {
			expect(options.headers?.Authorization).toBe('Bearer minted-access-token');
		}
	});

	it('throws a NodeOperationError for an unknown resource/operation combination', async () => {
		const ctx = createExecuteContext({
			params: { authentication: 'basic', resource: 'ticket', operation: 'bogus' },
			continueOnFail: true, // still throws: the guard runs before the item loop
		});

		await expect(node.execute.call(ctx.mockThis)).rejects.toBeInstanceOf(NodeOperationError);
		await expect(node.execute.call(ctx.mockThis)).rejects.toThrow(/bogus/);
		await expect(node.execute.call(ctx.mockThis)).rejects.toThrow(/ticket/);
		expect(ctx.http).not.toHaveBeenCalled();
	});

	it('dataFragment:getAll runs per item, sends exact GET query, and wraps rows with the item index', async () => {
		const ctx = createExecuteContext({
			items: [{ json: { first: true } }, { json: { second: true } }],
			params: {
				authentication: 'basic',
				resource: 'dataFragment',
				operation: 'getAll',
				dataDefinition: (i?: number) => `DD${i}`,
				where: 'W',
				columns: 'C',
				returnAll: false,
				limit: 5,
				additionalFields: { sort: 'Name ASC' },
			},
		});
		ctx.http.mockResolvedValue([{ ID: 'f1' }, { ID: 'f2' }]);

		const result = await node.execute.call(ctx.mockThis);

		expect(ctx.http).toHaveBeenCalledTimes(2);

		const first = httpCall(ctx.http, 0);
		expect(first.credentialType).toBe('matrix42BasicApi');
		expect(first.options.method).toBe('GET');
		expect(first.options.url).toBe(`${API_BASE}/data/fragments/DD0`);
		expect(first.options.qs).toEqual({
			where: 'W',
			columns: 'C',
			sort: 'Name ASC',
			pagesize: 5,
		});
		expect(first.options.headers).toEqual({ 'Content-Type': 'application/json' });
		expect(first.options.json).toBe(true);
		expect(first.options.skipSslCertificateValidation).toBe(false);
		// GET requests have their body removed entirely
		expect(first.options).not.toHaveProperty('body');

		const second = httpCall(ctx.http, 1);
		expect(second.options.url).toBe(`${API_BASE}/data/fragments/DD1`);

		expect(ctx.getNodeParameter).toHaveBeenCalledWith('dataDefinition', 0);
		expect(ctx.getNodeParameter).toHaveBeenCalledWith('dataDefinition', 1);

		expect(result).toEqual([
			[
				{ json: { ID: 'f1' }, pairedItem: { item: 0 } },
				{ json: { ID: 'f2' }, pairedItem: { item: 0 } },
				{ json: { ID: 'f1' }, pairedItem: { item: 1 } },
				{ json: { ID: 'f2' }, pairedItem: { item: 1 } },
			],
		]);
	});

	it('dataFragment:getAll reads returnAll/limit/additionalFields with fallbacks and always sends pagesize=limit', async () => {
		const ctx = createExecuteContext({
			params: {
				authentication: 'basic',
				resource: 'dataFragment',
				operation: 'getAll',
				dataDefinition: 'DD',
				where: 'W',
				columns: 'C',
				// returnAll / limit / additionalFields omitted -> defaults kick in
			},
		});
		ctx.http.mockResolvedValue([]);

		await node.execute.call(ctx.mockThis);

		expect(ctx.getNodeParameter).toHaveBeenCalledWith('returnAll', 0, false);
		expect(ctx.getNodeParameter).toHaveBeenCalledWith('limit', 0, 50);
		expect(ctx.getNodeParameter).toHaveBeenCalledWith('additionalFields', 0, {});
		expect(httpCall(ctx.http).options.qs).toEqual({ where: 'W', columns: 'C', pagesize: 50 });
	});

	it('dataFragment:getAll with returnAll pages with pagesize 500 until a short page is returned', async () => {
		const fullPage = Array.from({ length: 500 }, (_, k) => ({ ID: `id-${k}` }));
		const ctx = createExecuteContext({
			params: {
				authentication: 'basic',
				resource: 'dataFragment',
				operation: 'getAll',
				dataDefinition: 'DD',
				where: 'W',
				columns: 'C',
				returnAll: true,
			},
		});
		ctx.http.mockResolvedValueOnce(fullPage).mockResolvedValueOnce([{ ID: 'last' }]);

		const result = await node.execute.call(ctx.mockThis);

		expect(ctx.http).toHaveBeenCalledTimes(2);
		expect(httpCall(ctx.http, 0).options.qs).toEqual({
			where: 'W',
			columns: 'C',
			pagesize: 500,
			pagenumber: 0,
		});
		expect(httpCall(ctx.http, 1).options.qs).toEqual({
			where: 'W',
			columns: 'C',
			pagesize: 500,
			pagenumber: 1,
		});
		expect(result[0]).toHaveLength(501);
	});

	it('encodeURIComponent-escapes data-definition and id path segments', async () => {
		const ctx = createExecuteContext({
			params: {
				authentication: 'basic',
				resource: 'dataFragment',
				operation: 'delete',
				dataDefinition: 'Space Name',
				fragmentId: 'a/b',
			},
		});
		ctx.http.mockResolvedValue({});

		await node.execute.call(ctx.mockThis);

		expect(httpCall(ctx.http).options.url).toBe(`${API_BASE}/data/fragments/Space%20Name/a%2Fb`);
	});

	it('dataObject:get sends full in the query string and wraps the single response object', async () => {
		const ctx = createExecuteContext({
			params: {
				authentication: 'basic',
				resource: 'dataObject',
				operation: 'get',
				configurationItem: 'CI',
				objectId: 'o-1',
				full: true,
			},
		});
		ctx.http.mockResolvedValue({ ID: 'o-1', Name: 'X' });

		const result = await node.execute.call(ctx.mockThis);

		const call = httpCall(ctx.http);
		expect(call.options.method).toBe('GET');
		expect(call.options.url).toBe(`${API_BASE}/data/objects/CI/o-1`);
		expect(call.options.qs).toEqual({ full: true });
		expect(result).toEqual([[{ json: { ID: 'o-1', Name: 'X' }, pairedItem: { item: 0 } }]]);
	});

	it('dataObject:create wraps the response under objectId', async () => {
		const ctx = createExecuteContext({
			params: {
				authentication: 'basic',
				resource: 'dataObject',
				operation: 'create',
				configurationItem: 'CI',
				objectData: { Name: 'X' },
			},
		});
		ctx.http.mockResolvedValue('new-obj-eoid');

		const result = await node.execute.call(ctx.mockThis);

		const call = httpCall(ctx.http);
		expect(call.options.method).toBe('POST');
		expect(call.options.url).toBe(`${API_BASE}/data/objects/CI`);
		expect(call.options.body).toEqual({ Name: 'X' });
		expect(result).toEqual([[{ json: { objectId: 'new-obj-eoid' }, pairedItem: { item: 0 } }]]);
	});

	it('ticket:create sends the exact body/query and wraps the response as ticketEoid', async () => {
		const ctx = createExecuteContext({
			params: {
				authentication: 'basic',
				resource: 'ticket',
				operation: 'create',
				ticketType: 6,
				category: 'cat-9',
				subject: 'Subj',
				descriptionHTML: '<p>d</p>',
				impact: 2,
				urgency: 3,
				priority: 2,
				additionalFields: {
					responsibleRole: 'role-1',
					creator: 'user-c',
					user: 'user-i',
					responsibleUser: 'user-r',
					sla: 'sla-1',
				},
			},
		});
		ctx.http.mockResolvedValue('eoid-123');

		const result = await node.execute.call(ctx.mockThis);

		expect(ctx.http).toHaveBeenCalledTimes(1);
		const call = httpCall(ctx.http);
		expect(call.options.method).toBe('POST');
		expect(call.options.url).toBe(`${API_BASE}/ticket/create`);
		expect(call.options.qs).toEqual({ activityType: 6 });
		expect(call.options.body).toEqual({
			Category: 'cat-9',
			Subject: 'Subj',
			state: 200,
			DescriptionHTML: '<p>d</p>',
			Impact: 2,
			Urgency: 3,
			Priority: 2,
			EntryBy: 4,
			ResponsibleUser: 'user-r',
			ResponsibleRole: 'role-1',
			Creator: 'user-c',
			User: 'user-i',
			Sla: 'sla-1',
		});

		expect(result).toEqual([[{ json: { ticketEoid: 'eoid-123' }, pairedItem: { item: 0 } }]]);
	});

	it('ticket:create omits blank/nil-GUID optional relations from the body', async () => {
		const ctx = createExecuteContext({
			params: {
				authentication: 'basic',
				resource: 'ticket',
				operation: 'create',
				ticketType: 5,
				category: 'cat-1',
				subject: 'S',
				descriptionHTML: 'D',
				impact: 1,
				urgency: 1,
				priority: 0,
				additionalFields: {
					responsibleRole: NIL_GUID, // nil-GUID sentinel -> omitted
					creator: '', // empty -> omitted
					user: 'u-1', // kept
					// responsibleUser / sla absent -> omitted
				},
			},
		});
		ctx.http.mockResolvedValue('eoid');

		await node.execute.call(ctx.mockThis);

		const body = httpCall(ctx.http).options.body as IDataObject;
		expect(body).not.toHaveProperty('ResponsibleRole');
		expect(body).not.toHaveProperty('Creator');
		expect(body).not.toHaveProperty('ResponsibleUser');
		expect(body).not.toHaveProperty('Sla');
		expect(body.User).toBe('u-1');
	});

	it('ticket:create resolves priority Auto (-1) from the impact/urgency mapping', async () => {
		const ctx = createExecuteContext({
			params: {
				authentication: 'basic',
				resource: 'ticket',
				operation: 'create',
				ticketType: 5,
				category: 'cat-1',
				subject: 'S',
				descriptionHTML: 'D',
				impact: 2,
				urgency: 3,
				priority: -1,
				additionalFields: {},
			},
		});
		ctx.http.mockResolvedValueOnce([{ PriorityValue: 1 }]).mockResolvedValueOnce('eoid-2');

		await node.execute.call(ctx.mockThis);

		expect(ctx.http).toHaveBeenCalledTimes(2);
		const mappingCall = httpCall(ctx.http, 0);
		expect(mappingCall.options.method).toBe('GET');
		expect(mappingCall.options.url).toBe(`${API_BASE}/data/fragments/SVMActivityPickupPriorityMapping`);
		expect(mappingCall.options.qs).toEqual({
			where: 'ImpactValue = 2 AND UrgencyValue = 3',
			columns: 'PriorityValue',
		});
		expect((httpCall(ctx.http, 1).options.body as IDataObject).Priority).toBe(1);
	});

	it('ticket:create falls back to priority 2 when the mapping lookup returns an empty array', async () => {
		const ctx = createExecuteContext({
			params: {
				authentication: 'basic',
				resource: 'ticket',
				operation: 'create',
				ticketType: 5,
				category: 'cat-1',
				subject: 'S',
				descriptionHTML: 'D',
				impact: 2,
				urgency: 3,
				priority: -1,
				additionalFields: {},
			},
		});
		ctx.http.mockResolvedValueOnce([]).mockResolvedValueOnce('eoid-3');

		await node.execute.call(ctx.mockThis);

		expect(ctx.http).toHaveBeenCalledTimes(2);
		expect((httpCall(ctx.http, 1).options.body as IDataObject).Priority).toBe(2);
	});

	it('wraps a create validation error (non-numeric impact) as NodeApiError', async () => {
		const ctx = createExecuteContext({
			params: {
				authentication: 'basic',
				resource: 'ticket',
				operation: 'create',
				ticketType: 5,
				category: 'cat-1',
				subject: 'S',
				descriptionHTML: 'D',
				impact: '', // toNumber() rejects empty
				urgency: 3,
				priority: 2,
				additionalFields: {},
			},
		});

		await expect(node.execute.call(ctx.mockThis)).rejects.toBeInstanceOf(NodeApiError);
		expect(ctx.http).not.toHaveBeenCalled();
	});

	it('ticket:close sends the exact body and returns a Success message item', async () => {
		const ctx = createExecuteContext({
			params: {
				authentication: 'basic',
				resource: 'ticket',
				operation: 'close',
				ticketEoid: 'eoid-9',
				closeRelatedIncidents: true,
				reason: 408,
				errorType: 0,
				comments: '<p>done</p>',
				servicesAvailability: 10,
				assetsAvailability: 20,
				sendMailToInitiator: false,
				notifyResponsible: true,
				sendMailToUsers: false,
				sendMailToRelatedResponsibleUsers: true,
			},
		});
		ctx.http.mockResolvedValue({});

		const result = await node.execute.call(ctx.mockThis);

		const call = httpCall(ctx.http);
		expect(call.options.method).toBe('POST');
		expect(call.options.url).toBe(`${API_BASE}/ticket/close`);
		expect(call.options.qs).toEqual({});
		expect(call.options.body).toEqual({
			ObjectIds: ['eoid-9'],
			CloseRelatedIncidents: true,
			Reason: 408,
			Comments: '<p>done</p>',
			ServicesAvailability: 10,
			AssetsAvailability: 20,
			SendMailToUsers: false,
			ErrorType: 0,
			SendMailToInitiator: false,
			NotifyResponsible: true,
			SendMailToRelatedResponsibleUsers: true,
		});
		expect(result).toEqual([[{ json: { Message: 'Success' }, pairedItem: { item: 0 } }]]);
	});

	it('ticket:transform sends ObjectIds + type names, adds set relations, and returns Success', async () => {
		const ctx = createExecuteContext({
			params: {
				authentication: 'basic',
				resource: 'ticket',
				operation: 'transform',
				ticketEoid: 'eoid-7',
				sourceTypeName: 'SPSActivityTypeTicket',
				targetTypeName: 'SPSActivityTypeIncident',
				category: 'cat-3',
				additionalFields: { sla: 'sla-1', ola: 'ola-1', recipientRole: 'role-2' },
			},
		});
		ctx.http.mockResolvedValue({});

		const result = await node.execute.call(ctx.mockThis);

		const call = httpCall(ctx.http);
		expect(call.options.method).toBe('POST');
		expect(call.options.url).toBe(`${API_BASE}/ticket/transform`);
		expect(call.options.body).toEqual({
			ObjectIds: ['eoid-7'],
			SourceTypeName: 'SPSActivityTypeTicket',
			TargetTypeName: 'SPSActivityTypeIncident',
			Category: 'cat-3',
			Sla: 'sla-1',
			Ola: 'ola-1',
			RecipientRole: 'role-2',
		});
		expect(result).toEqual([[{ json: { Message: 'Success' }, pairedItem: { item: 0 } }]]);
	});

	it('ticket:transform omits blank optional relations', async () => {
		const ctx = createExecuteContext({
			params: {
				authentication: 'basic',
				resource: 'ticket',
				operation: 'transform',
				ticketEoid: 'eoid-7',
				sourceTypeName: 'SPSActivityTypeTicket',
				targetTypeName: 'SPSActivityTypeIncident',
				category: 'cat-3',
				additionalFields: { sla: '', ola: NIL_GUID },
			},
		});
		ctx.http.mockResolvedValue({});

		await node.execute.call(ctx.mockThis);

		expect(httpCall(ctx.http).options.body).toEqual({
			ObjectIds: ['eoid-7'],
			SourceTypeName: 'SPSActivityTypeTicket',
			TargetTypeName: 'SPSActivityTypeIncident',
			Category: 'cat-3',
		});
	});

	it('ticket:addJournalEntry parses arrays, sends IsFromEditDialog, and returns Success', async () => {
		const ctx = createExecuteContext({
			params: {
				authentication: 'basic',
				resource: 'ticket',
				operation: 'addJournalEntry',
				ticketEoid: 'eoid-4',
				comments: 'a note',
				entryType: 5,
				creator: 'user-c',
				visibleInPortal: true,
				additionalFields: {
					isFromEditDialog: true,
					publish: true,
					typeId: '019f8b52-9a05-e711-1010-e2edb1eae152',
					parameters: '[{"Name":"a","Value":1}]',
					fileIds: '["f1","f2"]',
				},
			},
		});
		ctx.http.mockResolvedValue({});

		const result = await node.execute.call(ctx.mockThis);

		const call = httpCall(ctx.http);
		expect(call.options.method).toBe('POST');
		expect(call.options.url).toBe(`${API_BASE}/journal/Add`);
		expect(call.options.body).toEqual({
			ObjectId: 'eoid-4',
			Publish: true,
			Comments: 'a note',
			EntryType: 5,
			Creator: 'user-c',
			VisibleInPortal: true,
			Parameters: [{ Name: 'a', Value: 1 }],
			IsFromEditDialog: true,
			TypeId: '019f8b52-9a05-e711-1010-e2edb1eae152',
			FileIds: ['f1', 'f2'],
		});
		expect(result).toEqual([[{ json: { Message: 'Success' }, pairedItem: { item: 0 } }]]);
	});

	it('ticket:addJournalEntry applies defaults when additionalFields is empty', async () => {
		const ctx = createExecuteContext({
			params: {
				authentication: 'basic',
				resource: 'ticket',
				operation: 'addJournalEntry',
				ticketEoid: 'eoid-4',
				comments: 'a note',
				entryType: 3,
				creator: 'user-c',
				visibleInPortal: false,
				additionalFields: {},
			},
		});
		ctx.http.mockResolvedValue({});

		await node.execute.call(ctx.mockThis);

		expect(httpCall(ctx.http).options.body).toEqual({
			ObjectId: 'eoid-4',
			Publish: false,
			Comments: 'a note',
			EntryType: 3,
			Creator: 'user-c',
			VisibleInPortal: false,
			Parameters: [],
			IsFromEditDialog: false,
		});
	});

	it('import:execute posts SequenceId/ActionType 3 with a fresh v4 token', async () => {
		const ctx = createExecuteContext({
			params: {
				authentication: 'basic',
				resource: 'import',
				operation: 'execute',
				sequenceEoid: 'seq-1',
			},
		});
		ctx.http.mockResolvedValue({ IsSuccessful: true });

		const result = await node.execute.call(ctx.mockThis);

		const call = httpCall(ctx.http);
		expect(call.options.method).toBe('POST');
		expect(call.options.url).toBe(`${API_BASE}/importdata/executeimportdefinition`);

		const body = call.options.body as {
			Parameters: unknown[];
			SequenceId: string;
			ActionType: number;
			Token: string;
		};
		expect(body.Parameters).toEqual([]);
		expect(body.SequenceId).toBe('seq-1');
		expect(body.ActionType).toBe(3);
		expect(body.Token).toMatch(UUID_V4_REGEX);

		expect(result).toEqual([[{ json: { IsSuccessful: true }, pairedItem: { item: 0 } }]]);
	});

	it('storage:upload drives the full flow (typeId lookup, url, upload, finish, comment)', async () => {
		const buffer = new Uint8Array(11); // 11-byte payload; the source only reads .length
		const ctx = createExecuteContext({
			params: {
				authentication: 'basic',
				resource: 'storage',
				operation: 'upload',
				filename: 'file.txt',
				storageId: 'store-1',
				objectId: 'obj-1',
				binaryPropertyName: 'data',
				additionalFields: { comment: 'my comment' },
			},
			binaryBuffer: buffer,
		});
		ctx.http
			.mockResolvedValueOnce([{ typeId: 'type-1' }])
			.mockResolvedValueOnce('https://upload.example')
			.mockResolvedValueOnce({})
			.mockResolvedValueOnce({})
			.mockResolvedValueOnce({});

		const result = await node.execute.call(ctx.mockThis);

		expect(ctx.assertBinaryData).toHaveBeenCalledWith(0, 'data');
		expect(ctx.getBinaryDataBuffer).toHaveBeenCalledWith(0, 'data');
		expect(ctx.http).toHaveBeenCalledTimes(5);

		const typeIdCall = httpCall(ctx.http, 0);
		expect(typeIdCall.options.method).toBe('GET');
		expect(typeIdCall.options.url).toBe(`${API_BASE}/data/fragments/SPSCommonClassBase`);
		expect(typeIdCall.options.qs).toEqual({
			where: "[Expression-ObjectID] = 'obj-1'",
			columns: 'TypeID as typeId',
		});

		const uploadUrlCall = httpCall(ctx.http, 1);
		expect(uploadUrlCall.options.method).toBe('POST');
		expect(uploadUrlCall.options.url).toBe(`${API_BASE}/filestorage/getuploadurl`);
		const uploadUrlBody = uploadUrlCall.options.body as {
			Name: string;
			StorageId: string;
			TypeId: string;
			ObjectId: string;
			UniqueFileId: string;
			Size: number;
		};
		expect(uploadUrlBody.Name).toBe('file.txt');
		expect(uploadUrlBody.StorageId).toBe('store-1');
		expect(uploadUrlBody.TypeId).toBe('type-1');
		expect(uploadUrlBody.ObjectId).toBe('obj-1');
		expect(uploadUrlBody.Size).toBe(11);
		expect(uploadUrlBody.UniqueFileId).toMatch(UUID_V4_REGEX);

		const fileId = uploadUrlBody.UniqueFileId;

		const uploadCall = httpCall(ctx.http, 2);
		expect(uploadCall.options.method).toBe('POST');
		expect(uploadCall.options.url).toBe(`${API_BASE}/filestorage/upload`);
		expect(uploadCall.options.qs).toEqual({ fileid: fileId });
		expect(uploadCall.options.headers).toEqual({ 'Content-Type': 'application/octet-stream' });
		expect(uploadCall.options.json).toBe(false);
		expect(uploadCall.options.body).toBe(buffer);

		const finishCall = httpCall(ctx.http, 3);
		expect(finishCall.options.method).toBe('POST');
		expect(finishCall.options.url).toBe(`${API_BASE}/commonStorage/finishUploading/${fileId}`);
		// empty {} body -> matrix42ApiRequest drops the body entirely
		expect(finishCall.options).not.toHaveProperty('body');

		const commentCall = httpCall(ctx.http, 4);
		expect(commentCall.options.method).toBe('POST');
		expect(commentCall.options.url).toBe(`${API_BASE}/filestorage/comment/${fileId}`);
		// the comment is sent JSON-encoded (quoted)
		expect(commentCall.options.body).toBe(JSON.stringify('my comment'));

		expect(result).toEqual([[{ json: { Message: 'Success' }, pairedItem: { item: 0 } }]]);
	});

	it('storage:upload skips the comment call when no comment is provided', async () => {
		const ctx = createExecuteContext({
			params: {
				authentication: 'basic',
				resource: 'storage',
				operation: 'upload',
				filename: 'file.txt',
				storageId: 'store-1',
				objectId: 'obj-1',
				binaryPropertyName: 'data',
				additionalFields: {},
			},
			binaryBuffer: new Uint8Array(4),
		});
		ctx.http
			.mockResolvedValueOnce([{ typeId: 'type-1' }])
			.mockResolvedValueOnce('https://upload.example')
			.mockResolvedValueOnce({})
			.mockResolvedValueOnce({});

		await node.execute.call(ctx.mockThis);

		expect(ctx.http).toHaveBeenCalledTimes(4);
		expect(httpCall(ctx.http, 3).options.url).toContain(`${API_BASE}/commonStorage/finishUploading/`);
	});

	it('storage:upload surfaces a NodeApiError when no configuration item matches the objectId', async () => {
		const ctx = createExecuteContext({
			params: {
				authentication: 'basic',
				resource: 'storage',
				operation: 'upload',
				filename: 'file.txt',
				storageId: 'store-1',
				objectId: 'missing',
				binaryPropertyName: 'data',
				additionalFields: {},
			},
			binaryBuffer: new Uint8Array(2),
		});
		ctx.http.mockResolvedValueOnce([]); // typeId lookup returns nothing

		await expect(node.execute.call(ctx.mockThis)).rejects.toBeInstanceOf(NodeApiError);
	});

	it('uses matrix42BasicApi when authentication is "basic"', async () => {
		const ctx = createExecuteContext({
			params: {
				authentication: 'basic',
				resource: 'dataObject',
				operation: 'delete',
				configurationItem: 'CI',
				objectId: 'obj-1',
			},
		});

		await node.execute.call(ctx.mockThis);

		expect(ctx.getCredentials).toHaveBeenCalledWith('matrix42BasicApi');
		expect(httpCall(ctx.http).credentialType).toBe('matrix42BasicApi');
	});

	it('sets skipSslCertificateValidation from the credential allowUnauthorizedCerts flag', async () => {
		const ctx = createExecuteContext({
			params: {
				authentication: 'basic',
				resource: 'dataObject',
				operation: 'delete',
				configurationItem: 'CI',
				objectId: 'obj-1',
			},
			allowUnauthorizedCerts: true,
		});

		await node.execute.call(ctx.mockThis);

		expect(httpCall(ctx.http).options.skipSslCertificateValidation).toBe(true);
	});

	it('reads resource and operation once each, only for item index 0', async () => {
		const ctx = createExecuteContext({
			items: [{ json: {} }, { json: {} }],
			params: {
				authentication: 'basic',
				resource: 'dataFragment',
				operation: 'delete',
				dataDefinition: 'DD',
				fragmentId: 'frag-1',
			},
		});

		await node.execute.call(ctx.mockThis);

		const resourceReads = ctx.getNodeParameter.mock.calls.filter((c) => c[0] === 'resource');
		const operationReads = ctx.getNodeParameter.mock.calls.filter((c) => c[0] === 'operation');
		expect(resourceReads).toEqual([['resource', 0]]);
		expect(operationReads).toEqual([['operation', 0]]);
	});

	it('wraps request errors as NodeApiError when continueOnFail is false', async () => {
		const ctx = createExecuteContext({
			params: {
				authentication: 'basic',
				resource: 'dataFragment',
				operation: 'delete',
				dataDefinition: 'DD',
				fragmentId: 'frag-1',
			},
			continueOnFail: false,
		});
		ctx.http.mockRejectedValue(new Error('boom'));

		await expect(node.execute.call(ctx.mockThis)).rejects.toBeInstanceOf(NodeApiError);
	});

	it('emits { json: { error } } for the failed item and continues when continueOnFail is true', async () => {
		const ctx = createExecuteContext({
			items: [{ json: {} }, { json: {} }],
			params: {
				authentication: 'basic',
				resource: 'dataFragment',
				operation: 'delete',
				dataDefinition: 'DD',
				fragmentId: 'frag-1',
			},
			continueOnFail: true,
		});
		ctx.http.mockRejectedValueOnce(new Error('boom')).mockResolvedValue({});

		const result = await node.execute.call(ctx.mockThis);

		expect(result).toEqual([
			[
				{ json: { error: 'boom' }, pairedItem: { item: 0 } },
				{ json: { Message: 'Success' }, pairedItem: { item: 1 } },
			],
		]);
	});
});

// ---------------------------------------------------------------------------
// 4) methods.loadOptions
// ---------------------------------------------------------------------------

describe('Matrix42.methods.loadOptions', () => {
	const node = new Matrix42();
	const loadOptions = node.methods.loadOptions;

	describe('getUsers', () => {
		it('queries SPSUserClassBase with pagesize 1000, maps and sorts users (no None sentinel)', async () => {
			const ctx = createLoadOptionsContext([
				[
					{ ID: 'u-2', FirstName: 'Zed', LastName: 'Zulu' },
					{ ID: 'u-1', FirstName: 'Anna', LastName: null },
				],
			]);

			const result = await loadOptions.getUsers.call(ctx.mockThis);

			expect(ctx.http).toHaveBeenCalledTimes(1);
			const call = httpCall(ctx.http);
			expect(call.options.method).toBe('GET');
			expect(call.options.url).toBe(`${API_BASE}/data/fragments/SPSUserClassBase`);
			expect(call.options.qs).toEqual({ columns: 'ID, FirstName, LastName', pagesize: 1000 });

			expect(result).toEqual([
				// null LastName is coalesced to '' leaving a trailing space
				{ name: 'Anna ', value: 'u-1' },
				{ name: 'Zed Zulu', value: 'u-2' },
			]);
		});

		it('throws a NodeOperationError when the API does not return an array', async () => {
			const ctx = createLoadOptionsContext([undefined]);

			await expect(loadOptions.getUsers.call(ctx.mockThis)).rejects.toBeInstanceOf(
				NodeOperationError,
			);
		});
	});

	it('getTicketUrgencies maps DisplayString/Value from SVMActivityPickupUrgency, sorted by name', async () => {
		const ctx = createLoadOptionsContext([
			[
				{ ID: 'a', Position: 1, Value: 1, DisplayString: 'Low' },
				{ ID: 'b', Position: 2, Value: 3, DisplayString: 'High' },
			],
		]);

		const result = await loadOptions.getTicketUrgencies.call(ctx.mockThis);

		const call = httpCall(ctx.http);
		expect(call.options.url).toBe(`${API_BASE}/data/fragments/SVMActivityPickupUrgency`);
		expect(call.options.qs).toEqual({ columns: 'ID, Position, Value, DisplayString' });

		expect(result).toEqual([
			{ name: 'High', value: 3 },
			{ name: 'Low', value: 1 },
		]);
	});

	it('getTicketImpacts maps DisplayString/Value from SVMActivityPickupImpact, sorted by name', async () => {
		const ctx = createLoadOptionsContext([
			[
				{ ID: 'a', Position: 1, Value: 2, DisplayString: 'Medium' },
				{ ID: 'b', Position: 2, Value: 1, DisplayString: 'Low' },
			],
		]);

		const result = await loadOptions.getTicketImpacts.call(ctx.mockThis);

		const call = httpCall(ctx.http);
		expect(call.options.url).toBe(`${API_BASE}/data/fragments/SVMActivityPickupImpact`);
		expect(call.options.qs).toEqual({ columns: 'ID, Position, Value, DisplayString' });

		expect(result).toEqual([
			{ name: 'Low', value: 1 },
			{ name: 'Medium', value: 2 },
		]);
	});

	it('getActivityStates queries SPSCommonPickupObjectStatus StateGroup=7, sorted by numeric value', async () => {
		const ctx = createLoadOptionsContext([
			[
				{ Value: 202, DisplayString: 'In Progress', Position: 15 },
				{ Value: 200, DisplayString: 'New', Position: 5 },
				{ Value: 205, DisplayString: 'Planned', Position: 1 },
			],
		]);

		const result = await loadOptions.getActivityStates.call(ctx.mockThis);

		const call = httpCall(ctx.http);
		expect(call.options.url).toBe(`${API_BASE}/data/fragments/SPSCommonPickupObjectStatus`);
		expect(call.options.qs).toEqual({ where: 'StateGroup = 7', columns: 'Value, DisplayString, Position' });

		expect(result).toEqual([
			{ name: 'New', value: 200 },
			{ name: 'In Progress', value: 202 },
			{ name: 'Planned', value: 205 },
		]);
	});

	it('getTicketCategories builds a sorted "Parent / Child" hierarchy', async () => {
		const ctx = createLoadOptionsContext([
			[
				{ ID: 'root-b', Parent: null, Name: 'B Root' },
				{ ID: 'kid-1', Parent: 'root-b', Name: 'Kid' },
				{ ID: 'root-a', Parent: null, Name: 'A Root' },
			],
		]);

		const result = await loadOptions.getTicketCategories.call(ctx.mockThis);

		const call = httpCall(ctx.http);
		expect(call.options.url).toBe(`${API_BASE}/data/fragments/SPSScCategoryClassBase`);
		expect(call.options.qs).toEqual({
			where: "Recursive(Parent).ID = 'd0f04f85-458f-40bd-aeb0-e97b08b933b5' AND Hidden = 0",
			columns: 'ID, Parent, Name, DefaultRecipientRole',
		});

		expect(result).toEqual([
			{ name: 'A Root', value: 'root-a' },
			{ name: 'B Root', value: 'root-b' },
			{ name: 'B Root / Kid', value: 'kid-1' },
		]);
	});

	describe('getTicketRoles', () => {
		it('promotes the category default role and sorts the rest (no None sentinel)', async () => {
			const ctx = createLoadOptionsContext(
				[
					[
						{ Name: 'Beta', ID: 'r2' },
						{ Name: 'Alpha', ID: 'r1' },
						{ Name: 'Delta', ID: 'r3' },
					],
					[{ ID: 'cat-1', Parent: null, Name: 'X', DefaultRecipientRole: 'r3' }],
				],
				{ category: 'cat-1' },
			);

			const result = await loadOptions.getTicketRoles.call(ctx.mockThis);

			expect(ctx.http).toHaveBeenCalledTimes(2);

			const rolesCall = httpCall(ctx.http, 0);
			expect(rolesCall.options.url).toBe(`${API_BASE}/data/fragments/SPSScRoleClassBase`);
			expect(rolesCall.options.qs).toEqual({
				columns: 'T(SPSSecurityClassRole).Name as Name, ID, [Expression-ObjectID]',
			});

			const categoryCall = httpCall(ctx.http, 1);
			expect(categoryCall.options.url).toBe(`${API_BASE}/data/fragments/SPSScCategoryClassBase`);
			expect(categoryCall.options.qs).toEqual({
				where: "ID = 'cat-1' AND Hidden = 0",
				columns: 'ID, Parent, Name, DefaultRecipientRole',
			});

			expect(result).toEqual([
				{ name: 'Delta (Category Default)', value: 'r3' },
				{ name: 'Alpha', value: 'r1' },
				{ name: 'Beta', value: 'r2' },
			]);
		});

		it('escapes single quotes in the category id used for the where clause', async () => {
			const ctx = createLoadOptionsContext(
				[[{ Name: 'Alpha', ID: 'r1' }], []],
				{ category: "a'b" },
			);

			await loadOptions.getTicketRoles.call(ctx.mockThis);

			expect(httpCall(ctx.http, 1).options.qs).toEqual({
				where: "ID = 'a''b' AND Hidden = 0",
				columns: 'ID, Parent, Name, DefaultRecipientRole',
			});
		});

		it('returns all roles without a category lookup when no category is selected', async () => {
			const ctx = createLoadOptionsContext(
				[
					[
						{ Name: 'Beta', ID: 'r2' },
						{ Name: 'Alpha', ID: 'r1' },
					],
				],
				{ category: '' },
			);

			const result = await loadOptions.getTicketRoles.call(ctx.mockThis);

			// only the roles query runs — no category default lookup, and no throw
			expect(ctx.http).toHaveBeenCalledTimes(1);
			expect(httpCall(ctx.http, 0).options.url).toBe(`${API_BASE}/data/fragments/SPSScRoleClassBase`);
			expect(result).toEqual([
				{ name: 'Alpha', value: 'r1' },
				{ name: 'Beta', value: 'r2' },
			]);
		});
	});

	it('getTicketSlas filters SLA_Type = 10 (no None sentinel)', async () => {
		const ctx = createLoadOptionsContext([
			[
				{ ID: 'sla-2', Name: 'Silver' },
				{ ID: 'sla-1', Name: 'Gold' },
			],
		]);

		const result = await loadOptions.getTicketSlas.call(ctx.mockThis);

		const call = httpCall(ctx.http);
		expect(call.options.url).toBe(`${API_BASE}/data/fragments/SVCServiceLevelAgreementClassBase`);
		expect(call.options.qs).toEqual({
			where: 'SLA_Type = 10',
			columns: 'ID, [Expression-ObjectID], Name, FulfillmentResponsibleRole',
		});

		expect(result).toEqual([
			{ name: 'Gold', value: 'sla-1' },
			{ name: 'Silver', value: 'sla-2' },
		]);
	});

	it('getTicketOlas filters SLA_Type = 20 (no None sentinel)', async () => {
		const ctx = createLoadOptionsContext([[{ ID: 'ola-1', Name: 'Ops OLA' }]]);

		const result = await loadOptions.getTicketOlas.call(ctx.mockThis);

		const call = httpCall(ctx.http);
		expect(call.options.url).toBe(`${API_BASE}/data/fragments/SVCServiceLevelAgreementClassBase`);
		expect(call.options.qs).toEqual({
			where: 'SLA_Type = 20',
			columns: 'ID, [Expression-ObjectID], Name, FulfillmentResponsibleRole',
		});

		expect(result).toEqual([{ name: 'Ops OLA', value: 'ola-1' }]);
	});

	it('getTicketCloseReasons filters StateGroup = 7 AND State = 204', async () => {
		const ctx = createLoadOptionsContext([
			[
				{ ID: 'a', Position: 1, Value: 408, DisplayString: 'Solved', StateGroup: 7 },
				{ ID: 'b', Position: 2, Value: 409, DisplayString: 'Cancelled', StateGroup: 7 },
			],
		]);

		const result = await loadOptions.getTicketCloseReasons.call(ctx.mockThis);

		const call = httpCall(ctx.http);
		expect(call.options.url).toBe(`${API_BASE}/data/fragments/SPSCommonPickupObjectStateReason`);
		expect(call.options.qs).toEqual({
			where: 'StateGroup = 7 AND State = 204',
			columns: 'ID, Position, Value, DisplayString, StateGroup',
		});

		expect(result).toEqual([
			{ name: 'Cancelled', value: 409 },
			{ name: 'Solved', value: 408 },
		]);
	});

	it('getTicketCloseErrorTypes maps SVMActivityPickupErrorType entries sorted by name', async () => {
		const ctx = createLoadOptionsContext([
			[
				{ ID: 'a', Position: 1, Value: 1, DisplayString: 'User Error' },
				{ ID: 'b', Position: 2, Value: 0, DisplayString: 'Unknown' },
			],
		]);

		const result = await loadOptions.getTicketCloseErrorTypes.call(ctx.mockThis);

		const call = httpCall(ctx.http);
		expect(call.options.url).toBe(`${API_BASE}/data/fragments/SVMActivityPickupErrorType`);
		expect(call.options.qs).toEqual({ columns: 'ID, Position, Value, DisplayString' });

		expect(result).toEqual([
			{ name: 'Unknown', value: 0 },
			{ name: 'User Error', value: 1 },
		]);
	});

	it('getImportDefinitions uses the [Expression-ObjectID] alias (eoid) as the option value', async () => {
		const ctx = createLoadOptionsContext([
			[
				{ ID: 'id-1', Name: 'Beta Import', eoid: 'eoid-b' },
				{ ID: 'id-2', Name: 'Alpha Import', eoid: 'eoid-a' },
			],
		]);

		const result = await loadOptions.getImportDefinitions.call(ctx.mockThis);

		const call = httpCall(ctx.http);
		expect(call.options.url).toBe(`${API_BASE}/data/fragments/GDIEImportClassBase`);
		expect(call.options.qs).toEqual({ columns: 'ID, Name, [Expression-ObjectID] as eoid' });

		expect(result).toEqual([
			{ name: 'Alpha Import', value: 'eoid-a' },
			{ name: 'Beta Import', value: 'eoid-b' },
		]);
	});

	it('getDataQueries queries PDRDataQueryClassBase and uses the eoid alias as the option value', async () => {
		const ctx = createLoadOptionsContext([
			[
				{ Name: 'Beta Query', eoid: 'eoid-b' },
				{ Name: 'Alpha Query', eoid: 'eoid-a' },
			],
		]);

		const result = await loadOptions.getDataQueries.call(ctx.mockThis);

		const call = httpCall(ctx.http);
		expect(call.options.url).toBe(`${API_BASE}/data/fragments/PDRDataQueryClassBase`);
		expect(call.options.qs).toEqual({ columns: 'Name, [Expression-ObjectID] as eoid' });

		expect(result).toEqual([
			{ name: 'Alpha Query', value: 'eoid-a' },
			{ name: 'Beta Query', value: 'eoid-b' },
		]);
	});

	it('getStorageProviders queries the eoid alias but uses the fragment ID as the option value', async () => {
		const ctx = createLoadOptionsContext([[{ ID: 'id-1', Name: 'Blob Storage', eoid: 'eoid-1' }]]);

		const result = await loadOptions.getStorageProviders.call(ctx.mockThis);

		const call = httpCall(ctx.http);
		expect(call.options.url).toBe(`${API_BASE}/data/fragments/DWPFileStorageAccountClass`);
		expect(call.options.qs).toEqual({ columns: 'ID, Name, [Expression-ObjectID] as eoid' });

		// characterization: value is ID, not the queried eoid alias
		expect(result).toEqual([{ name: 'Blob Storage', value: 'id-1' }]);
	});

	it('getJournalEntryTypes prepends the "None (Default)" entry with numeric value 0', async () => {
		const ctx = createLoadOptionsContext([
			[
				{ Value: 5, DisplayString: 'Note' },
				{ Value: 3, DisplayString: 'Mail' },
			],
		]);

		const result = await loadOptions.getJournalEntryTypes.call(ctx.mockThis);

		const call = httpCall(ctx.http);
		expect(call.options.url).toBe(`${API_BASE}/data/fragments/SPSJournalEntryPickupType`);
		expect(call.options.qs).toEqual({ columns: 'Value, DisplayString' });

		expect(result).toEqual([
			{ name: 'None (Default)', value: 0 },
			{ name: 'Mail', value: 3 },
			{ name: 'Note', value: 5 },
		]);
	});
});
