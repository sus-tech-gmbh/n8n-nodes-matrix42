import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';

// The installed n8n-workflow package maps its ESM "import" condition to ./src/index.ts,
// which is not shipped — only the CJS dist build exists. Redirect the bare specifier to
// the working CJS entry so the node's own value imports (NodeConnectionType, NodeApiError)
// resolve under vitest.
vi.mock('n8n-workflow', async () => {
	const actual = await vi.importActual<Record<string, unknown>>('n8n-workflow/dist/index.js');
	return { ...actual };
});

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
import { NodeApiError, NodeConnectionType } from 'n8n-workflow';

import { Matrix42 } from '../nodes/Matrix42/Matrix42.node';

const SERVER_URL = 'https://m42.example.com';
const API_BASE = `${SERVER_URL}/m42Services/api`;
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const testNode: INode = {
	id: 'test-node-id',
	name: 'Matrix42 Test',
	type: 'n8n-nodes-matrix42.matrix42',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

// ---------------------------------------------------------------------------
// Mock builders
// ---------------------------------------------------------------------------

interface ExecContext {
	mockThis: IExecuteFunctions;
	http: ReturnType<typeof vi.fn>;
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
}): ExecContext {
	const { items = [{ json: {} }], params, continueOnFail = false } = options;

	const http = vi.fn().mockResolvedValue({ ok: true });
	const getNodeParameter = vi.fn((name: string, itemIndex?: number, fallback?: unknown) => {
		if (Object.prototype.hasOwnProperty.call(params, name)) {
			const value = params[name];
			return typeof value === 'function' ? (value as (i?: number) => unknown)(itemIndex) : value;
		}
		return fallback;
	});
	const getCredentials = vi.fn(async () => ({ serverUrl: SERVER_URL }));
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
		returnJsonArray: (data: IDataObject | IDataObject[]): INodeExecutionData[] =>
			(Array.isArray(data) ? data : [data]).map((json) => ({ json })),
		constructExecutionMetaData: (
			data: INodeExecutionData[],
			{ itemData }: { itemData: { item: number } },
		): INodeExecutionData[] => data.map((entry) => ({ ...entry, pairedItem: itemData })),
		assertBinaryData,
		getBinaryDataBuffer,
	};

	return { mockThis, http, getNodeParameter, getCredentials, assertBinaryData, getBinaryDataBuffer };
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

	const allParams: Record<string, unknown> = { authentication: 'webserviceToken', ...params };
	const getNodeParameter = vi.fn((name: string, fallback?: unknown) =>
		Object.prototype.hasOwnProperty.call(allParams, name) ? allParams[name] : fallback,
	);

	const mockThis = mock<ILoadOptionsFunctions>();
	const writable = mockThis as unknown as Record<string, unknown>;
	writable.getNodeParameter = getNodeParameter;
	writable.getCredentials = vi.fn(async () => ({ serverUrl: SERVER_URL }));
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
// Reference data (mirrors the source's declared resources/operations/fields)
// ---------------------------------------------------------------------------

const RESOURCE_OPERATIONS: Record<string, string[]> = {
	asql: [
		'getFragments',
		'addFragment',
		'updateFragment',
		'deleteFragment',
		'addObject',
		'getObject',
		'updateObject',
		'deleteObject',
	],
	import: ['executeImportDefinition'],
	ticket: ['createTicket', 'closeTicket', 'transformTicket', 'addJournalEntry'],
	storage: ['uploadFile'],
};

const OPERATION_FIELDS: Record<string, string[]> = {
	getFragments: ['dataDefinition', 'where', 'columns', 'additionalFields'],
	addFragment: ['dataDefinition', 'fragmentData'],
	updateFragment: ['dataDefinition', 'fragmentData'],
	deleteFragment: ['dataDefinition', 'fragmentId'],
	addObject: ['configurationItem', 'objectData'],
	getObject: ['configurationItem', 'objectId', 'full'],
	updateObject: ['configurationItem', 'objectData', 'full'],
	deleteObject: ['configurationItem', 'objectId'],
	createTicket: [
		'ticketType',
		'category',
		'subject',
		'descriptionHTML',
		'impact',
		'urgency',
		'priority',
		'responsibleRole',
		'creator',
		'user',
		'responsibleUser',
		'sla',
	],
	closeTicket: [
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
	transformTicket: [
		'ticketEoid',
		'sourceTypeName',
		'targetTypeName',
		'category',
		'sla',
		'ola',
		'recipientRole',
	],
	addJournalEntry: [
		'ticketEoid',
		'comments',
		'entryType',
		'creator',
		'visibleInPortal',
		'additionalFields',
	],
	executeImportDefinition: ['sequenceEoid'],
	uploadFile: ['filename', 'storageId', 'objectId', 'binaryPropertyName', 'additionalFields'],
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
		expect(description.version).toBe(1);
		expect(description.subtitle).toBe('={{$parameter["operation"] + ": " + $parameter["resource"]}}');
		expect(description.description).toBe('Interact with Matrix42.');
		expect(description.defaults).toEqual({ name: 'Matrix42' });
		expect(description.usableAsTool).toBe(true);
		expect(description.icon).toEqual({ light: 'file:matrix42.svg', dark: 'file:matrix42.svg' });
	});

	it('has a single main input and a single main output', () => {
		expect(description.inputs).toEqual([NodeConnectionType.Main]);
		expect(description.outputs).toEqual([NodeConnectionType.Main]);
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

	it('has a resource parameter with exactly [asql, import, ticket, storage]', () => {
		const resource = description.properties.find((p) => p.name === 'resource');
		expect(resource).toBeDefined();
		expect(resource!.type).toBe('options');
		expect(resource!.noDataExpression).toBe(true);
		expect(resource!.default).toBe('ticket');
		expect(resource!.options).toEqual([
			{ name: 'ASQL', value: 'asql' },
			{ name: 'Import', value: 'import' },
			{ name: 'Ticket', value: 'ticket' },
			{ name: 'Storage', value: 'storage' },
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
	const allKnownOperations = Object.values(RESOURCE_OPERATIONS).flat();

	it('exposes exactly one operation dropdown per resource, gated via displayOptions.show.resource', () => {
		expect(operationProps).toHaveLength(4);

		const gatedResources: string[] = [];
		for (const prop of operationProps) {
			expect(prop.type).toBe('options');
			expect(prop.noDataExpression).toBe(true);
			const resources = shownResources(prop);
			expect(resources).toHaveLength(1);
			gatedResources.push(resources[0]);
		}

		expect(gatedResources.sort()).toEqual(['asql', 'import', 'storage', 'ticket']);
	});

	it('lists the expected operations per resource with a valid default', () => {
		for (const prop of operationProps) {
			const resource = shownResources(prop)[0];
			const values = optionValues(prop);
			expect(values, `operations for resource "${resource}"`).toEqual(
				RESOURCE_OPERATIONS[resource],
			);
			expect(values).toContain(prop.default);
		}
	});

	it('uses globally unique operation values (fields are gated by operation only)', () => {
		// Field properties are gated exclusively by show.operation (no resource gate);
		// this is only unambiguous because operation values never repeat across resources.
		expect(new Set(allKnownOperations).size).toBe(allKnownOperations.length);
	});

	it('gates every non-core property on at least one known operation value', () => {
		const fieldProps = properties.filter(
			(p) => !['authentication', 'resource', 'operation'].includes(p.name),
		);
		expect(fieldProps.length).toBeGreaterThan(0);

		for (const prop of fieldProps) {
			const gate = shownOperations(prop);
			expect(gate.length, `property "${prop.name}" must be gated by operation`).toBeGreaterThan(0);
			for (const op of gate) {
				expect(allKnownOperations, `property "${prop.name}" gates on unknown op "${op}"`).toContain(
					op,
				);
			}
		}
	});

	it('declares authentication and resource exactly once each', () => {
		expect(properties.filter((p) => p.name === 'authentication')).toHaveLength(1);
		expect(properties.filter((p) => p.name === 'resource')).toHaveLength(1);
	});

	it('has no duplicate name + displayOptions collisions', () => {
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
					const gateA = name === 'operation' ? shownResources(group[a]) : shownOperations(group[a]);
					const gateB = name === 'operation' ? shownResources(group[b]) : shownOperations(group[b]);
					expect(gateA.length, `duplicate "${name}" must be gated`).toBeGreaterThan(0);
					expect(gateB.length, `duplicate "${name}" must be gated`).toBeGreaterThan(0);
					const overlap = gateA.filter((value) => gateB.includes(value));
					expect(overlap, `properties named "${name}" are visible simultaneously`).toEqual([]);
				}
			}
		}
	});

	it.each(Object.entries(OPERATION_FIELDS).map(([operation, fields]) => ({ operation, fields })))(
		'exposes exactly the declared fields for operation "$operation"',
		({ operation, fields }) => {
			const visible = properties
				.filter((p) => p.name !== 'operation' && shownOperations(p).includes(operation))
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

	// A parameter map that satisfies every operation used in the dispatch table.
	const dispatchParams: Record<string, unknown> = {
		authentication: 'webserviceToken',
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
		responsibleRole: 'role-1',
		creator: 'user-c',
		user: 'user-i',
		responsibleUser: 'user-r',
		sla: 'sla-1',
		ola: 'ola-1',
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
		recipientRole: 'role-2',
		entryType: 5,
		visibleInPortal: true,
		sequenceEoid: 'seq-1',
		additionalFields: {},
	};

	it.each([
		{ resource: 'asql', operation: 'getFragments', method: 'GET', endpoint: '/data/fragments/DDX' },
		{ resource: 'asql', operation: 'addFragment', method: 'POST', endpoint: '/data/fragments/DDX' },
		{ resource: 'asql', operation: 'updateFragment', method: 'PUT', endpoint: '/data/fragments/DDX' },
		{ resource: 'asql', operation: 'deleteFragment', method: 'DELETE', endpoint: '/data/fragments/DDX/frag-1' },
		{ resource: 'asql', operation: 'addObject', method: 'POST', endpoint: '/data/objects/CIX' },
		{ resource: 'asql', operation: 'getObject', method: 'GET', endpoint: '/data/objects/CIX/obj-1' },
		{ resource: 'asql', operation: 'updateObject', method: 'PUT', endpoint: '/data/objects/CIX' },
		{ resource: 'asql', operation: 'deleteObject', method: 'DELETE', endpoint: '/data/objects/CIX/obj-1' },
		{ resource: 'ticket', operation: 'createTicket', method: 'POST', endpoint: '/ticket/create' },
		{ resource: 'ticket', operation: 'closeTicket', method: 'POST', endpoint: '/ticket/close' },
		{ resource: 'ticket', operation: 'transformTicket', method: 'POST', endpoint: '/ticket/transform' },
		{ resource: 'ticket', operation: 'addJournalEntry', method: 'POST', endpoint: '/journal/Add' },
		{ resource: 'import', operation: 'executeImportDefinition', method: 'POST', endpoint: '/importdata/executeimportdefinition' },
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
			expect(lastCall.credentialType).toBe('matrix42TokenApi');
		},
	);

	it('asql:getFragments runs per input item and wraps each response row with the item index', async () => {
		const ctx = createExecuteContext({
			items: [{ json: { first: true } }, { json: { second: true } }],
			params: {
				authentication: 'webserviceToken',
				resource: 'asql',
				operation: 'getFragments',
				dataDefinition: (i?: number) => `DD${i}`,
				where: 'W',
				columns: 'C',
				additionalFields: { pageSize: 5, pageNumber: 2, sort: 'Name ASC' },
			},
		});
		ctx.http.mockResolvedValue([{ ID: 'f1' }, { ID: 'f2' }]);

		const result = await node.execute.call(ctx.mockThis);

		expect(ctx.http).toHaveBeenCalledTimes(2);

		const first = httpCall(ctx.http, 0);
		expect(first.credentialType).toBe('matrix42TokenApi');
		expect(first.options.method).toBe('GET');
		expect(first.options.url).toBe(`${API_BASE}/data/fragments/DD0`);
		expect(first.options.qs).toEqual({
			where: 'W',
			columns: 'C',
			pagesize: 5,
			pagenumber: 2,
			sort: 'Name ASC',
		});
		expect(first.options.headers).toEqual({ 'Content-Type': 'application/json' });
		expect(first.options.json).toBe(true);
		expect(first.options.skipSslCertificateValidation).toBe(false);
		// GET requests have their body removed entirely
		expect(first.options).not.toHaveProperty('body');

		const second = httpCall(ctx.http, 1);
		expect(second.options.url).toBe(`${API_BASE}/data/fragments/DD1`);

		// per-item parameters are read with the item index
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

	it('asql:getFragments omits paging params when additionalFields is unset (fallback {})', async () => {
		const ctx = createExecuteContext({
			params: {
				authentication: 'webserviceToken',
				resource: 'asql',
				operation: 'getFragments',
				dataDefinition: 'DD',
				where: 'W',
				columns: 'C',
				// no additionalFields entry: getNodeParameter falls back to the {} default
			},
		});
		ctx.http.mockResolvedValue([]);

		await node.execute.call(ctx.mockThis);

		expect(ctx.getNodeParameter).toHaveBeenCalledWith('additionalFields', 0, {});
		expect(httpCall(ctx.http).options.qs).toEqual({ where: 'W', columns: 'C' });
	});

	it('reads resource and operation once each, only for item index 0', async () => {
		const ctx = createExecuteContext({
			items: [{ json: {} }, { json: {} }],
			params: {
				authentication: 'webserviceToken',
				resource: 'asql',
				operation: 'deleteFragment',
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

	it('ticket:createTicket sends the exact body/query and wraps the response as ticketEoid', async () => {
		const ctx = createExecuteContext({
			params: {
				authentication: 'webserviceToken',
				resource: 'ticket',
				operation: 'createTicket',
				ticketType: 6,
				category: 'cat-9',
				subject: 'Subj',
				descriptionHTML: '<p>d</p>',
				impact: 2,
				urgency: 3,
				priority: 2,
				responsibleRole: 'role-1',
				creator: 'user-c',
				user: 'user-i',
				responsibleUser: 'user-r',
				sla: 'sla-1',
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
			state: 100,
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

	it('ticket:createTicket with priority Auto (-1) resolves the priority from the mapping first', async () => {
		const ctx = createExecuteContext({
			params: {
				authentication: 'webserviceToken',
				resource: 'ticket',
				operation: 'createTicket',
				ticketType: 5,
				category: 'cat-1',
				subject: 'S',
				descriptionHTML: 'D',
				impact: 2,
				urgency: 3,
				priority: -1,
				responsibleRole: 'role-1',
				creator: 'user-c',
				user: 'user-i',
				responsibleUser: 'user-r',
				sla: 'sla-1',
			},
		});
		ctx.http
			.mockResolvedValueOnce([{ PriorityValue: 1 }])
			.mockResolvedValueOnce('eoid-2');

		await node.execute.call(ctx.mockThis);

		expect(ctx.http).toHaveBeenCalledTimes(2);

		const mappingCall = httpCall(ctx.http, 0);
		expect(mappingCall.options.method).toBe('GET');
		expect(mappingCall.options.url).toBe(`${API_BASE}/data/fragments/SVMActivityPickupPriorityMapping`);
		expect(mappingCall.options.qs).toEqual({
			where: 'ImpactValue = 2 AND UrgencyValue = 3',
			columns: 'PriorityValue',
		});

		const createCall = httpCall(ctx.http, 1);
		expect((createCall.options.body as IDataObject).Priority).toBe(1);
	});

	it('ticket:closeTicket sends the exact body and returns a Success message item', async () => {
		const ctx = createExecuteContext({
			params: {
				authentication: 'webserviceToken',
				resource: 'ticket',
				operation: 'closeTicket',
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

		expect(ctx.http).toHaveBeenCalledTimes(1);
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

	it('import:executeImportDefinition posts SequenceId/ActionType 3 with a fresh v4 token', async () => {
		const ctx = createExecuteContext({
			params: {
				authentication: 'webserviceToken',
				resource: 'import',
				operation: 'executeImportDefinition',
				sequenceEoid: 'seq-1',
			},
		});
		ctx.http.mockResolvedValue({ IsSuccessful: true });

		const result = await node.execute.call(ctx.mockThis);

		expect(ctx.http).toHaveBeenCalledTimes(1);
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

	it('storage:uploadFile drives the full upload flow (typeId lookup, url, upload, finish, comment)', async () => {
		const buffer = new Uint8Array(11); // 11-byte payload; the source only reads .length
		const ctx = createExecuteContext({
			params: {
				authentication: 'webserviceToken',
				resource: 'storage',
				operation: 'uploadFile',
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
		expect(finishCall.options.body).toEqual({});

		const commentCall = httpCall(ctx.http, 4);
		expect(commentCall.options.method).toBe('POST');
		expect(commentCall.options.url).toBe(`${API_BASE}/filestorage/comment/${fileId}`);
		expect(commentCall.options.body).toBe('my comment');

		expect(result).toEqual([[{ json: { Message: 'Success' }, pairedItem: { item: 0 } }]]);
	});

	it('storage:uploadFile skips the comment call when no comment is provided', async () => {
		const ctx = createExecuteContext({
			params: {
				authentication: 'webserviceToken',
				resource: 'storage',
				operation: 'uploadFile',
				filename: 'file.txt',
				storageId: 'store-1',
				objectId: 'obj-1',
				binaryPropertyName: 'data',
				additionalFields: {},
			},
			binaryBuffer: new Uint8Array(1),
		});
		ctx.http
			.mockResolvedValueOnce([{ typeId: 'type-1' }])
			.mockResolvedValueOnce('https://upload.example')
			.mockResolvedValueOnce({})
			.mockResolvedValueOnce({});

		await node.execute.call(ctx.mockThis);

		expect(ctx.http).toHaveBeenCalledTimes(4);
		const lastCall = httpCall(ctx.http, 3);
		expect(lastCall.options.url).toContain(`${API_BASE}/commonStorage/finishUploading/`);
	});

	it('uses matrix42BasicApi when authentication is "basic"', async () => {
		const ctx = createExecuteContext({
			params: {
				authentication: 'basic',
				resource: 'asql',
				operation: 'deleteObject',
				configurationItem: 'CI',
				objectId: 'obj-1',
			},
		});

		await node.execute.call(ctx.mockThis);

		expect(ctx.getCredentials).toHaveBeenCalledWith('matrix42BasicApi');
		expect(httpCall(ctx.http).credentialType).toBe('matrix42BasicApi');
	});

	it('rethrows request errors when continueOnFail is false', async () => {
		const ctx = createExecuteContext({
			params: {
				authentication: 'webserviceToken',
				resource: 'asql',
				operation: 'deleteFragment',
				dataDefinition: 'DD',
				fragmentId: 'frag-1',
			},
			continueOnFail: false,
		});
		ctx.http.mockRejectedValue(new Error('boom'));

		await expect(node.execute.call(ctx.mockThis)).rejects.toThrow('boom');
	});

	it('emits { json: { error } } for the failed item and continues when continueOnFail is true', async () => {
		const ctx = createExecuteContext({
			items: [{ json: {} }, { json: {} }],
			params: {
				authentication: 'webserviceToken',
				resource: 'asql',
				operation: 'deleteFragment',
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

	// BUG: execute() silently falls through when resource/operation match no dispatch
	// branch. `responseData` keeps its previous value ([] initially), so an unsupported
	// operation returns an empty (or stale) result instead of failing loudly. n8n nodes
	// conventionally throw a NodeOperationError for unsupported resource/operation combos.
	it.todo('should throw a NodeOperationError for an unknown resource/operation combination');

	// BUG (in Matrix42TicketFunctions.createTicket, reachable via execute): when priority
	// is -1 and the priority-mapping request resolves to an empty array [], the truthy
	// check `if (calculatedPriority)` passes and `calculatedPriority[0].PriorityValue`
	// throws a TypeError instead of falling back to the default priority 2.
	it.todo('should fall back to priority 2 when the priority mapping lookup returns an empty array');
});

// ---------------------------------------------------------------------------
// 4) methods.loadOptions
// ---------------------------------------------------------------------------

describe('Matrix42.methods.loadOptions', () => {
	const node = new Matrix42();
	const loadOptions = node.methods.loadOptions;

	describe('getUsers', () => {
		it('queries SPSUserClassBase, maps/sorts users, and prepends the None entry', async () => {
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
			expect(call.options.qs).toEqual({ columns: 'ID, FirstName, LastName' });

			expect(result).toEqual([
				{ name: 'None (Check Description)', value: '00000000-0000-0000-0000-000000000000' },
				// null LastName is coalesced to '' leaving a trailing space
				{ name: 'Anna ', value: 'u-1' },
				{ name: 'Zed Zulu', value: 'u-2' },
			]);
		});

		// BUG: every loadOptions method guards `if (responseData === undefined)` and then
		// passes that same undefined value as the error object to the NodeApiError
		// constructor, which immediately crashes with
		// "TypeError: Cannot read properties of undefined (reading 'message')".
		// The intended NodeApiError('No data got returned') is never thrown.
		it.todo('should throw a NodeApiError("No data got returned") when the API returns undefined');
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
		expect(call.options.method).toBe('GET');
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
		it('promotes the category default role and prepends the None entry', async () => {
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
				{ name: 'None (Check Description)', value: '00000000-0000-0000-0000-000000000000' },
				{ name: 'Delta (Category Default)', value: 'r3' },
				{ name: 'Alpha', value: 'r1' },
				{ name: 'Beta', value: 'r2' },
			]);
		});

		it('throws a NodeApiError before any request when no category is selected', async () => {
			const ctx = createLoadOptionsContext([], { category: '' });

			await expect(loadOptions.getTicketRoles.call(ctx.mockThis)).rejects.toBeInstanceOf(
				NodeApiError,
			);
			expect(ctx.http).not.toHaveBeenCalled();
		});
	});

	it('getTicketSlas filters SLA_Type = 10 and prepends the None entry', async () => {
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
			{ name: 'None (Check Description)', value: '00000000-0000-0000-0000-000000000000' },
			{ name: 'Gold', value: 'sla-1' },
			{ name: 'Silver', value: 'sla-2' },
		]);
	});

	it('getTicketOlas filters SLA_Type = 20 and prepends the None entry', async () => {
		const ctx = createLoadOptionsContext([[{ ID: 'ola-1', Name: 'Ops OLA' }]]);

		const result = await loadOptions.getTicketOlas.call(ctx.mockThis);

		const call = httpCall(ctx.http);
		expect(call.options.url).toBe(`${API_BASE}/data/fragments/SVCServiceLevelAgreementClassBase`);
		expect(call.options.qs).toEqual({
			where: 'SLA_Type = 20',
			columns: 'ID, [Expression-ObjectID], Name, FulfillmentResponsibleRole',
		});

		expect(result).toEqual([
			{ name: 'None (Check Description)', value: '00000000-0000-0000-0000-000000000000' },
			{ name: 'Ops OLA', value: 'ola-1' },
		]);
	});

	it('getTicketCloseReasons filters StateGroup = 7 AND State = 204 with no None entry', async () => {
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

	it('getStorageProviders queries the eoid alias but uses the fragment ID as the option value', async () => {
		const ctx = createLoadOptionsContext([
			[{ ID: 'id-1', Name: 'Blob Storage', eoid: 'eoid-1' }],
		]);

		const result = await loadOptions.getStorageProviders.call(ctx.mockThis);

		const call = httpCall(ctx.http);
		expect(call.options.url).toBe(`${API_BASE}/data/fragments/DWPFileStorageAccountClass`);
		expect(call.options.qs).toEqual({ columns: 'ID, Name, [Expression-ObjectID] as eoid' });

		// characterization: value is ID, not the queried eoid alias
		expect(result).toEqual([{ name: 'Blob Storage', value: 'id-1' }]);
	});

	it('getJournalEntryTypes prepends the "None (Default)" entry with string value "0"', async () => {
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
			{ name: 'None (Default)', value: '0' },
			{ name: 'Mail', value: 3 },
			{ name: 'Note', value: 5 },
		]);
	});
});
