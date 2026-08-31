import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type {
	IDataObject,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	INode,
	IPollFunctions,
} from 'n8n-workflow';

import { Matrix42Trigger } from '../nodes/Matrix42/Matrix42Trigger.node';
import {
	buildTriggerColumns,
	buildTypeCondition,
	decodeRowVersion,
	pollMatrix42,
} from '../nodes/Matrix42/Matrix42TriggerFunctions';

const SERVER_URL = 'https://m42.example.com';
const BASE_URL = `${SERVER_URL}/m42Services/api`;

const testNode: INode = {
	id: 'test-trigger-id',
	name: 'Matrix42 Trigger Test',
	type: 'n8n-nodes-matrix42.matrix42Trigger',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

// Verified rowversion triples from the live instance (base64 -> decimal).
const TS_A = 'AAAAAACNrXM='; // 9284979
const TS_B = 'AAAAAACc5jE='; // 10282545
const TS_C = 'AAAAAACc6bE='; // 10283441

interface PollContext {
	mockThis: IPollFunctions;
	http: ReturnType<typeof vi.fn>;
	staticData: IDataObject;
	loggerError: ReturnType<typeof vi.fn>;
}

/**
 * Builds an IPollFunctions mock. Uses basic auth so every request goes through
 * the single observable httpRequestWithAuthentication mock; the token flow has
 * its own suite in GenericFunctions.test.ts. `responses` are consumed in call
 * order.
 */
function createPollContext(options: {
	params?: Record<string, unknown>;
	staticData?: IDataObject;
	mode?: string;
	responses?: unknown[];
}): PollContext {
	const params: Record<string, unknown> = {
		authentication: 'basic',
		event: 'objectCreated',
		dataDefinition: 'SPSActivityClassBase',
		...options.params,
	};
	const staticData = options.staticData ?? {};

	const http = vi.fn();
	for (const response of options.responses ?? []) {
		http.mockResolvedValueOnce(response);
	}
	http.mockResolvedValue([]);

	const loggerError = vi.fn();

	const mockThis = mock<IPollFunctions>();
	const writable = mockThis as unknown as Record<string, unknown>;
	writable.getNodeParameter = vi.fn((name: string, fallback?: unknown) =>
		Object.prototype.hasOwnProperty.call(params, name) ? params[name] : fallback,
	);
	writable.getMode = vi.fn(() => options.mode ?? 'trigger');
	writable.getWorkflowStaticData = vi.fn(() => staticData);
	writable.getCredentials = vi.fn(async () => ({ serverUrl: SERVER_URL }));
	writable.getNode = vi.fn(() => testNode);
	writable.logger = { error: loggerError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
	writable.helpers = {
		httpRequestWithAuthentication: http,
		returnJsonArray: (data: IDataObject | IDataObject[]) =>
			(Array.isArray(data) ? data : [data]).map((json) => ({ json })),
	};

	return { mockThis, http, staticData, loggerError };
}

/** The (credentialType, options) tuple of the Nth request. */
function callArgs(http: ReturnType<typeof vi.fn>, n = 0): [string, IHttpRequestOptions] {
	return http.mock.calls[n] as [string, IHttpRequestOptions];
}

beforeEach(() => {
	vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// pure helpers
// ---------------------------------------------------------------------------

describe('decodeRowVersion', () => {
	it('decodes the live-verified base64 rowversion values', () => {
		expect(decodeRowVersion(TS_A)).toBe(BigInt(9284979));
		expect(decodeRowVersion(TS_B)).toBe(BigInt(10282545));
		expect(decodeRowVersion(TS_C)).toBe(BigInt(10283441));
	});

	it('throws for values that are not an 8-byte base64 string', () => {
		expect(() => decodeRowVersion('')).toThrow('not a rowversion');
		expect(() => decodeRowVersion('AAA=')).toThrow('not a rowversion');
		expect(() => decodeRowVersion(42)).toThrow('not a rowversion');
		expect(() => decodeRowVersion(undefined)).toThrow('not a rowversion');
	});
});

describe('buildTriggerColumns', () => {
	it('always selects ID, the aliased object ID and the watermark attribute', () => {
		expect(buildTriggerColumns('CreatedDate')).toBe(
			'ID,[Expression-ObjectID] as ObjectID,CreatedDate',
		);
	});

	it('appends trimmed extra columns and deduplicates case-insensitively', () => {
		expect(buildTriggerColumns('TimeStamp', ' TicketNumber , Subject,, timestamp , id ')).toBe(
			'ID,[Expression-ObjectID] as ObjectID,TimeStamp,TicketNumber,Subject',
		);
	});

	it('drops extras that collide with the aliased object-ID column', () => {
		expect(
			buildTriggerColumns('CreatedDate', 'ObjectID, Expression-ObjectID, [Expression-ObjectID]'),
		).toBe('ID,[Expression-ObjectID] as ObjectID,CreatedDate');
	});
});

describe('buildTypeCondition', () => {
	it('returns undefined for an empty selection', () => {
		expect(buildTypeCondition([])).toBeUndefined();
		expect(buildTypeCondition([''])).toBeUndefined();
	});

	it('builds an equality for one type and an IN list for several', () => {
		expect(buildTypeCondition(['guid-1'])).toBe("T(SPSCommonClassBase).[TypeID] = 'guid-1'");
		expect(buildTypeCondition(['guid-1', 'guid-2'])).toBe(
			"T(SPSCommonClassBase).[TypeID] IN ('guid-1', 'guid-2')",
		);
	});

	it('escapes single quotes in ids', () => {
		expect(buildTypeCondition(["it's"])).toBe("T(SPSCommonClassBase).[TypeID] = 'it''s'");
	});
});

// ---------------------------------------------------------------------------
// poll(): manual mode
// ---------------------------------------------------------------------------

describe('pollMatrix42 manual mode', () => {
	it('fetches the newest matching row, leaves static data untouched, and returns it', async () => {
		const row = { ID: 'f-1', ObjectID: 'o-1', CreatedDate: '2026-08-31T11:49:52.61Z' };
		const ctx = createPollContext({ mode: 'manual', responses: [[row]] });

		const result = await pollMatrix42.call(ctx.mockThis);

		expect(ctx.http).toHaveBeenCalledTimes(1);
		const [credentialType, options] = callArgs(ctx.http);
		expect(credentialType).toBe('matrix42BasicApi');
		expect(options.url).toBe(`${BASE_URL}/data/fragments/SPSActivityClassBase`);
		expect(options.qs).toEqual({
			columns: 'ID,[Expression-ObjectID] as ObjectID,CreatedDate',
			sort: 'CreatedDate DESC',
			pagesize: 1,
		});
		expect(result).toEqual([[{ json: row }]]);
		expect(ctx.staticData).toEqual({});
	});

	it('returns null when nothing matches', async () => {
		const ctx = createPollContext({ mode: 'manual', responses: [[]] });

		expect(await pollMatrix42.call(ctx.mockThis)).toBeNull();
		expect(ctx.staticData).toEqual({});
	});

	it('applies type filter and ASQL filter server-side', async () => {
		const ctx = createPollContext({
			mode: 'manual',
			params: {
				typeFilter: ['type-1', 'type-2'],
				additionalFields: { asqlFilter: 'State = 204' },
			},
			responses: [[]],
		});

		await pollMatrix42.call(ctx.mockThis);

		expect(callArgs(ctx.http)[1].qs?.where).toBe(
			"T(SPSCommonClassBase).[TypeID] IN ('type-1', 'type-2') AND (State = 204)",
		);
	});

	it('throws instead of logging when the request fails', async () => {
		const ctx = createPollContext({ mode: 'manual' });
		ctx.http.mockReset().mockRejectedValue(new Error('boom'));

		await expect(pollMatrix42.call(ctx.mockThis)).rejects.toThrow('boom');
		expect(ctx.loggerError).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// poll(): created mode
// ---------------------------------------------------------------------------

describe('pollMatrix42 created mode', () => {
	it('first run seeds the watermark from the newest row (ASQL filter excluded) and collects all boundary ties', async () => {
		const newest = { ID: 'f-9', ObjectID: 'o-9', CreatedDate: '2026-08-31T11:49:52.61Z' };
		const tieB = { ID: 'f-8', ObjectID: 'o-8', CreatedDate: '2026-08-31T11:49:52.61Z' };
		// created between the two seed queries — newer than the seed, so NOT a tie
		const raceRow = { ID: 'f-99', ObjectID: 'o-99', CreatedDate: '2026-08-31T11:50:00Z' };
		const ctx = createPollContext({
			params: { typeFilter: ['type-1'], additionalFields: { asqlFilter: 'State = 204' } },
			responses: [[newest], [newest, tieB, raceRow]],
		});

		const result = await pollMatrix42.call(ctx.mockThis);

		expect(result).toBeNull();
		const seedCall = callArgs(ctx.http, 0)[1];
		expect(seedCall.qs).toMatchObject({ sort: 'CreatedDate DESC', pagesize: 1 });
		// the type filter applies to the seed; the ASQL filter deliberately does not
		expect(seedCall.qs?.where).toBe("T(SPSCommonClassBase).[TypeID] = 'type-1'");
		const tiesCall = callArgs(ctx.http, 1)[1];
		expect(tiesCall.qs?.where).toBe(
			"T(SPSCommonClassBase).[TypeID] = 'type-1' AND CreatedDate >= '2026-08-31T11:49:52.61Z'",
		);
		expect(ctx.staticData).toEqual({
			configKey: 'SPSActivityClassBase::objectCreated::CreatedDate',
			createdWatermark: '2026-08-31T11:49:52.61Z',
			boundaryIds: ['f-9', 'f-8'],
		});
	});

	it('first run on an empty class seeds the epoch watermark with a single request', async () => {
		const ctx = createPollContext({ responses: [[]] });

		expect(await pollMatrix42.call(ctx.mockThis)).toBeNull();
		expect(ctx.http).toHaveBeenCalledTimes(1);
		expect(ctx.staticData.createdWatermark).toBe('1970-01-01T00:00:00.000Z');
		expect(ctx.staticData.boundaryIds).toEqual([]);
	});

	it('first run fails visibly when the created-date attribute holds no usable date', async () => {
		const ctx = createPollContext({
			responses: [[{ ID: 'f-1', ObjectID: 'o-1', CreatedDate: null }]],
		});

		await expect(pollMatrix42.call(ctx.mockThis)).rejects.toThrow(
			'The attribute "CreatedDate" of "SPSActivityClassBase" holds no usable date',
		);
		expect(ctx.staticData.createdWatermark).toBeUndefined();
	});

	const seeded = () => ({
		configKey: 'SPSActivityClassBase::objectCreated::CreatedDate',
		createdWatermark: '2026-08-31T11:49:52.61Z',
		boundaryIds: ['f-9'],
	});

	it('subsequent run queries >= the stored watermark, drops boundary rows, emits fresh ones and advances', async () => {
		const boundaryRow = { ID: 'f-9', ObjectID: 'o-9', CreatedDate: '2026-08-31T11:49:52.61Z' };
		const fresh1 = { ID: 'f-10', ObjectID: 'o-10', CreatedDate: '2026-08-31T12:00:00Z' };
		const fresh2 = { ID: 'f-11', ObjectID: 'o-11', CreatedDate: '2026-08-31T12:30:00.5Z' };
		const ctx = createPollContext({
			staticData: seeded(),
			responses: [[boundaryRow, fresh1, fresh2]],
		});

		const result = await pollMatrix42.call(ctx.mockThis);

		const options = callArgs(ctx.http)[1];
		expect(options.qs).toEqual({
			columns: 'ID,[Expression-ObjectID] as ObjectID,CreatedDate',
			sort: 'CreatedDate ASC',
			// limit plus the size of the boundary set
			pagesize: 51,
			where: "CreatedDate >= '2026-08-31T11:49:52.61Z'",
		});
		expect(result).toEqual([[{ json: fresh1 }, { json: fresh2 }]]);
		expect(ctx.staticData.createdWatermark).toBe('2026-08-31T12:30:00.5Z');
		expect(ctx.staticData.boundaryIds).toEqual(['f-11']);
	});

	it('returns null and keeps the watermark when only boundary rows come back', async () => {
		const boundaryRow = { ID: 'f-9', ObjectID: 'o-9', CreatedDate: '2026-08-31T11:49:52.61Z' };
		const ctx = createPollContext({ staticData: seeded(), responses: [[boundaryRow]] });

		expect(await pollMatrix42.call(ctx.mockThis)).toBeNull();
		expect(ctx.staticData).toEqual(seeded());
	});

	it('widens the page by the boundary count so boundary rows cannot crowd out fresh rows', async () => {
		const tick = '2026-08-31T11:49:52.61Z';
		const boundaryRows = [
			{ ID: 'b-1', ObjectID: 'ob-1', CreatedDate: tick },
			{ ID: 'b-2', ObjectID: 'ob-2', CreatedDate: tick },
			{ ID: 'b-3', ObjectID: 'ob-3', CreatedDate: tick },
		];
		const fresh = { ID: 'f-20', ObjectID: 'o-20', CreatedDate: '2026-08-31T12:00:00Z' };
		const ctx = createPollContext({
			params: { additionalFields: { limit: 2 } },
			staticData: {
				configKey: 'SPSActivityClassBase::objectCreated::CreatedDate',
				createdWatermark: tick,
				boundaryIds: ['b-1', 'b-2', 'b-3'],
			},
			responses: [[...boundaryRows, fresh]],
		});

		const result = await pollMatrix42.call(ctx.mockThis);

		// limit 2 + 3 boundary ids: the fresh row still fits into the page
		expect(callArgs(ctx.http)[1].qs?.pagesize).toBe(5);
		expect(result).toEqual([[{ json: fresh }]]);
		expect(ctx.staticData.createdWatermark).toBe('2026-08-31T12:00:00Z');
	});

	it('a new row at exactly the watermark tick is emitted and joins the boundary set', async () => {
		const boundaryRow = { ID: 'f-9', ObjectID: 'o-9', CreatedDate: '2026-08-31T11:49:52.61Z' };
		const sameTick = { ID: 'f-12', ObjectID: 'o-12', CreatedDate: '2026-08-31T11:49:52.61Z' };
		const ctx = createPollContext({ staticData: seeded(), responses: [[boundaryRow, sameTick]] });

		const result = await pollMatrix42.call(ctx.mockThis);

		expect(result).toEqual([[{ json: sameTick }]]);
		expect(ctx.staticData.createdWatermark).toBe('2026-08-31T11:49:52.61Z');
		expect(ctx.staticData.boundaryIds).toEqual(expect.arrayContaining(['f-9', 'f-12']));
	});

	it('a changed configuration resets the watermark and re-seeds the baseline', async () => {
		const newest = { ID: 'f-1', ObjectID: 'o-1', CreatedDate: '2026-08-31T10:00:00Z' };
		const ctx = createPollContext({
			staticData: {
				configKey: 'SPSUserClassBase::objectCreated::CreatedDate',
				createdWatermark: '2020-01-01T00:00:00Z',
				boundaryIds: ['old'],
			},
			responses: [[newest], [newest]],
		});

		expect(await pollMatrix42.call(ctx.mockThis)).toBeNull();
		expect(ctx.staticData).toEqual({
			configKey: 'SPSActivityClassBase::objectCreated::CreatedDate',
			createdWatermark: '2026-08-31T10:00:00Z',
			boundaryIds: ['f-1'],
		});
	});

	it('uses a custom created-date attribute in columns, where and sort', async () => {
		const ctx = createPollContext({
			params: { createdDateAttribute: 'ReceivedAt' },
			staticData: {
				configKey: 'SPSActivityClassBase::objectCreated::ReceivedAt',
				createdWatermark: '2026-08-01T00:00:00Z',
				boundaryIds: [],
			},
			responses: [[]],
		});

		await pollMatrix42.call(ctx.mockThis);

		const options = callArgs(ctx.http)[1];
		expect(options.qs?.columns).toBe('ID,[Expression-ObjectID] as ObjectID,ReceivedAt');
		expect(options.qs?.where).toBe("ReceivedAt >= '2026-08-01T00:00:00Z'");
		expect(options.qs?.sort).toBe('ReceivedAt ASC');
	});
});

// ---------------------------------------------------------------------------
// poll(): created-or-updated (rowversion) mode
// ---------------------------------------------------------------------------

describe('pollMatrix42 created-or-updated mode', () => {
	const params = { event: 'objectCreatedOrUpdated' };

	it('first run seeds the rowversion watermark from the newest row and returns null', async () => {
		const ctx = createPollContext({
			params,
			responses: [[{ ID: 'f-1', ObjectID: 'o-1', TimeStamp: TS_C }]],
		});

		expect(await pollMatrix42.call(ctx.mockThis)).toBeNull();
		expect(callArgs(ctx.http)[1].qs).toMatchObject({ sort: 'TimeStamp DESC', pagesize: 1 });
		expect(ctx.staticData).toEqual({
			configKey: 'SPSActivityClassBase::objectCreatedOrUpdated::TimeStamp',
			timestampWatermark: '10283441',
		});
	});

	it('first run on an empty class seeds watermark 0', async () => {
		const ctx = createPollContext({ params, responses: [[]] });

		expect(await pollMatrix42.call(ctx.mockThis)).toBeNull();
		expect(ctx.staticData.timestampWatermark).toBe('0');
	});

	it('subsequent run queries a strict > integer comparison, emits every row and advances', async () => {
		const row1 = { ID: 'f-2', ObjectID: 'o-2', TimeStamp: TS_A };
		const row2 = { ID: 'f-3', ObjectID: 'o-3', TimeStamp: TS_B };
		const ctx = createPollContext({
			params,
			staticData: {
				configKey: 'SPSActivityClassBase::objectCreatedOrUpdated::TimeStamp',
				timestampWatermark: '9000000',
			},
			responses: [[row1, row2]],
		});

		const result = await pollMatrix42.call(ctx.mockThis);

		const options = callArgs(ctx.http)[1];
		expect(options.qs).toEqual({
			columns: 'ID,[Expression-ObjectID] as ObjectID,TimeStamp',
			sort: 'TimeStamp ASC',
			pagesize: 50,
			where: 'TimeStamp > 9000000',
		});
		expect(result).toEqual([[{ json: row1 }, { json: row2 }]]);
		expect(ctx.staticData.timestampWatermark).toBe('10282545');
	});

	it('returns null without touching the watermark when nothing is newer', async () => {
		const staticData = {
			configKey: 'SPSActivityClassBase::objectCreatedOrUpdated::TimeStamp',
			timestampWatermark: '10283441',
		};
		const ctx = createPollContext({ params, staticData: { ...staticData }, responses: [[]] });

		expect(await pollMatrix42.call(ctx.mockThis)).toBeNull();
		expect(ctx.staticData).toEqual(staticData);
	});

	it('respects a custom limit', async () => {
		const ctx = createPollContext({
			params: { ...params, additionalFields: { limit: 7 } },
			staticData: {
				configKey: 'SPSActivityClassBase::objectCreatedOrUpdated::TimeStamp',
				timestampWatermark: '1',
			},
			responses: [[]],
		});

		await pollMatrix42.call(ctx.mockThis);

		expect(callArgs(ctx.http)[1].qs?.pagesize).toBe(7);
	});
});

// ---------------------------------------------------------------------------
// poll(): full-object fetching
// ---------------------------------------------------------------------------

describe('pollMatrix42 fetch full object', () => {
	it('resolves the CI from /Schema/types and attaches the object', async () => {
		const row = {
			ID: 'f-1',
			ObjectID: 'o-1',
			CreatedDate: '2026-08-31T12:00:00Z',
			'Expression-TypeID': 'FE098714-AC94-47F1-9724-DF5BAC86B3FB',
		};
		const fullObject = { SPSActivityClassBase: { Subject: 'hello' } };
		const ctx = createPollContext({
			mode: 'manual',
			params: { additionalFields: { fetchFullObject: true } },
			responses: [[row], [{ Id: 'fe098714-ac94-47f1-9724-df5bac86b3fb', InternalName: 'SPSActivityTypeIncident' }], fullObject],
		});

		const result = await pollMatrix42.call(ctx.mockThis);

		expect(callArgs(ctx.http, 1)[1].url).toBe(`${BASE_URL}/Schema/types`);
		expect(callArgs(ctx.http, 2)[1].url).toBe(
			`${BASE_URL}/data/objects/SPSActivityTypeIncident/o-1`,
		);
		expect(result).toEqual([[{ json: { ...row, Object: fullObject } }]]);
	});

	it('keeps the row unchanged when the object is unreadable (null) or the type is unknown', async () => {
		const readableButNull = {
			ID: 'f-1',
			ObjectID: 'o-1',
			CreatedDate: '2026-08-31T12:00:00Z',
			'Expression-TypeID': 'fe098714-ac94-47f1-9724-df5bac86b3fb',
		};
		const unknownType = {
			ID: 'f-2',
			ObjectID: 'o-2',
			CreatedDate: '2026-08-31T12:01:00Z',
			'Expression-TypeID': 'ffffffff-0000-0000-0000-000000000000',
		};
		const ctx = createPollContext({
			mode: 'manual',
			params: { additionalFields: { fetchFullObject: true, limit: 2 } },
			responses: [
				[readableButNull, unknownType],
				[{ Id: 'fe098714-ac94-47f1-9724-df5bac86b3fb', InternalName: 'SPSActivityTypeIncident' }],
				null,
			],
		});

		const result = await pollMatrix42.call(ctx.mockThis);

		expect(result).toEqual([[{ json: readableButNull }, { json: unknownType }]]);
		// only one object request: the unknown type is skipped entirely
		expect(ctx.http).toHaveBeenCalledTimes(3);
	});

	it('does not advance the watermark when the full-object fetch fails on an active workflow', async () => {
		const beforeState = {
			configKey: 'SPSActivityClassBase::objectCreated::CreatedDate',
			createdWatermark: '2026-08-31T11:49:52.61Z',
			boundaryIds: ['f-9'],
		};
		const row = {
			ID: 'f-10',
			ObjectID: 'o-10',
			CreatedDate: '2026-08-31T12:00:00Z',
			'Expression-TypeID': 'fe098714-ac94-47f1-9724-df5bac86b3fb',
		};
		const ctx = createPollContext({
			params: { additionalFields: { fetchFullObject: true } },
			staticData: { ...beforeState, boundaryIds: ['f-9'] },
			responses: [[row]],
		});
		// the /Schema/types call fails
		ctx.http.mockRejectedValueOnce(new Error('transient outage'));

		await expect(pollMatrix42.call(ctx.mockThis)).rejects.toThrow('transient outage');
		// the fetched-but-never-emitted row must be re-read by the next poll
		expect(ctx.staticData).toEqual(beforeState);
	});

	it('caches the /Schema/types catalog across polls sharing one static-data object', async () => {
		const rowA = {
			ID: 'f-1',
			ObjectID: 'o-1',
			CreatedDate: '2026-08-31T12:00:00Z',
			'Expression-TypeID': 'fe098714-ac94-47f1-9724-df5bac86b3fb',
		};
		const rowB = { ...rowA, ID: 'f-2', ObjectID: 'o-2' };
		const types = [
			{ Id: 'fe098714-ac94-47f1-9724-df5bac86b3fb', InternalName: 'SPSActivityTypeIncident' },
		];
		const ctx = createPollContext({
			mode: 'manual',
			params: { additionalFields: { fetchFullObject: true } },
			responses: [[rowA], types, { obj: 1 }, [rowB], { obj: 2 }],
		});

		await pollMatrix42.call(ctx.mockThis);
		await pollMatrix42.call(ctx.mockThis);

		const typesCalls = ctx.http.mock.calls.filter((call) =>
			String((call[1] as IHttpRequestOptions).url).endsWith('/Schema/types'),
		);
		expect(typesCalls).toHaveLength(1);
		expect(ctx.http).toHaveBeenCalledTimes(5);
	});
});

// ---------------------------------------------------------------------------
// poll(): error handling on active workflows
// ---------------------------------------------------------------------------

describe('pollMatrix42 error handling', () => {
	it('throws on the very first (activation) poll so a bad configuration fails activation', async () => {
		const ctx = createPollContext({});
		ctx.http.mockReset().mockRejectedValue(new Error('Klasse enthält Attribut nicht'));

		await expect(pollMatrix42.call(ctx.mockThis)).rejects.toThrow('enthält');
	});

	it('also throws on later polls — n8n turns it into a visible failed execution and keeps polling', async () => {
		const beforeState = {
			configKey: 'SPSActivityClassBase::objectCreated::CreatedDate',
			createdWatermark: '2026-08-31T11:49:52.61Z',
			boundaryIds: [],
		};
		const ctx = createPollContext({ staticData: { ...beforeState, boundaryIds: [] } });
		ctx.http.mockReset().mockRejectedValue(new Error('ECONNREFUSED'));

		await expect(pollMatrix42.call(ctx.mockThis)).rejects.toThrow('ECONNREFUSED');
		expect(ctx.staticData).toEqual(beforeState);
	});
});

// ---------------------------------------------------------------------------
// node description + loadOptions
// ---------------------------------------------------------------------------

describe('Matrix42Trigger description', () => {
	const trigger = new Matrix42Trigger();

	it('declares a polling trigger with the expected identity', () => {
		expect(trigger.description.name).toBe('matrix42Trigger');
		expect(trigger.description.displayName).toBe('Matrix42 Trigger');
		expect(trigger.description.group).toEqual(['trigger']);
		expect(trigger.description.polling).toBe(true);
		expect(trigger.description.inputs).toEqual([]);
		expect(trigger.description.outputs).toEqual(['main']);
		expect(trigger.description).not.toHaveProperty('usableAsTool');
	});

	it('offers both credentials gated by the authentication parameter', () => {
		expect(trigger.description.credentials).toEqual([
			expect.objectContaining({
				name: 'matrix42TokenApi',
				displayOptions: { show: { authentication: ['webserviceToken'] } },
			}),
			expect.objectContaining({
				name: 'matrix42BasicApi',
				displayOptions: { show: { authentication: ['basic'] } },
			}),
		]);
	});
});

describe('Matrix42Trigger loadOptions', () => {
	const trigger = new Matrix42Trigger();

	function createLoadContext(response: unknown, params: Record<string, unknown> = {}) {
		const allParams: Record<string, unknown> = { authentication: 'basic', ...params };
		const http = vi.fn().mockResolvedValue(response);
		const mockThis = mock<ILoadOptionsFunctions>();
		const writable = mockThis as unknown as Record<string, unknown>;
		writable.getNodeParameter = vi.fn((name: string, fallback?: unknown) =>
			Object.prototype.hasOwnProperty.call(allParams, name) ? allParams[name] : fallback,
		);
		writable.getCredentials = vi.fn(async () => ({ serverUrl: SERVER_URL }));
		writable.getNode = vi.fn(() => testNode);
		writable.helpers = { httpRequestWithAuthentication: http };
		return { mockThis, http };
	}

	it('getDataDefinitions filters pickups and internal classes, labels and sorts the rest', async () => {
		const { mockThis, http } = createLoadContext([
			{ IsPickup: false, InternalName: 'SPSUserClassBase', DisplayName: 'User', ProtectionLevel: 3 },
			{ IsPickup: true, InternalName: 'SPSOrderPickupState', DisplayName: 'Order State', ProtectionLevel: 3 },
			{ IsPickup: false, InternalName: 'SchemaSecurityView', DisplayName: 'Security', ProtectionLevel: 1 },
			{ IsPickup: false, InternalName: 'SPSActivityClassBase', DisplayName: 'Activity', ProtectionLevel: 3 },
		]);

		const options = await trigger.methods.loadOptions.getDataDefinitions.call(mockThis);

		expect(callArgs(http)[1].url).toBe(`${BASE_URL}/Schema/classes`);
		expect(options).toEqual([
			{ name: 'Activity (SPSActivityClassBase)', value: 'SPSActivityClassBase' },
			{ name: 'User (SPSUserClassBase)', value: 'SPSUserClassBase' },
		]);
	});

	it('getObjectTypes narrows to types composed of the selected data definition', async () => {
		const types = [
			{
				Id: 'guid-incident',
				InternalName: 'SPSActivityTypeIncident',
				DisplayName: 'Incident',
				MainClassName: 'SPSActivityClassBase',
				RelatedClasses: ['SPSActivityClassBase', 'SPSCommonClassBase'],
			},
			{
				Id: 'guid-computer',
				InternalName: 'SPSComputerType',
				DisplayName: 'Computer',
				MainClassName: 'SPSComputerClassBase',
				RelatedClasses: ['SPSComputerClassBase', 'SPSCommonClassBase'],
			},
		];
		const { mockThis } = createLoadContext(types, { dataDefinition: 'SPSActivityClassBase' });

		const options = await trigger.methods.loadOptions.getObjectTypes.call(mockThis);

		expect(options).toEqual([
			{ name: 'Incident (SPSActivityTypeIncident)', value: 'guid-incident' },
		]);
	});

	it('getObjectTypes falls back to all types when nothing matches the data definition', async () => {
		const types = [
			{ Id: 'guid-a', InternalName: 'TypeA', DisplayName: 'A', MainClassName: 'X', RelatedClasses: [] },
			{ Id: 'guid-b', InternalName: 'TypeB', DisplayName: 'B', MainClassName: 'Y', RelatedClasses: [] },
		];
		const { mockThis } = createLoadContext(types, { dataDefinition: 'MTX_SomethingElse' });

		const options = await trigger.methods.loadOptions.getObjectTypes.call(mockThis);

		expect(options).toHaveLength(2);
	});
});

// ---------------------------------------------------------------------------
// "Ticket Created" preset event
// ---------------------------------------------------------------------------

describe('pollMatrix42 ticketCreated preset', () => {
	it('is offered as a third event and hides the data-definition field', () => {
		const trigger = new Matrix42Trigger();
		const event = trigger.description.properties.find((property) => property.name === 'event');
		expect((event?.options ?? []).map((option) => 'value' in option! && option.value)).toEqual([
			'objectCreated',
			'objectCreatedOrUpdated',
			'ticketCreated',
		]);
		expect(event?.default).toBe('ticketCreated');

		const dataDefinition = trigger.description.properties.find(
			(property) => property.name === 'dataDefinition',
		);
		expect(dataDefinition?.displayOptions).toEqual({
			show: { event: ['objectCreated', 'objectCreatedOrUpdated'] },
		});
		const createdDateAttribute = trigger.description.properties.find(
			(property) => property.name === 'createdDateAttribute',
		);
		expect(createdDateAttribute?.displayOptions).toEqual({ show: { event: ['objectCreated'] } });
	});

	it('polls SPSActivityClassBase on CreatedDate regardless of stored data-definition parameters', async () => {
		const newest = { ID: 'f-9', ObjectID: 'o-9', CreatedDate: '2026-08-31T11:49:52.61Z' };
		const ctx = createPollContext({
			// stale values from a previous event selection — the preset must win
			params: {
				event: 'ticketCreated',
				dataDefinition: 'SPSComputerClassBase',
				createdDateAttribute: 'WrongAttr',
			},
			responses: [[newest], [newest]],
		});

		const result = await pollMatrix42.call(ctx.mockThis);

		expect(result).toBeNull();
		const seedCall = callArgs(ctx.http)[1];
		expect(seedCall.url).toBe(`${BASE_URL}/data/fragments/SPSActivityClassBase`);
		expect(seedCall.qs).toMatchObject({
			columns: 'ID,[Expression-ObjectID] as ObjectID,CreatedDate',
			sort: 'CreatedDate DESC',
		});
		expect(ctx.staticData.configKey).toBe('SPSActivityClassBase::ticketCreated::CreatedDate');
		expect(ctx.staticData.createdWatermark).toBe('2026-08-31T11:49:52.61Z');
	});

	it('applies the ticket-type filter server-side in the preset', async () => {
		const ctx = createPollContext({
			mode: 'manual',
			params: { event: 'ticketCreated', typeFilter: ['incident-guid'] },
			responses: [[]],
		});

		await pollMatrix42.call(ctx.mockThis);

		const options = callArgs(ctx.http)[1];
		expect(options.url).toBe(`${BASE_URL}/data/fragments/SPSActivityClassBase`);
		expect(options.qs?.where).toBe("T(SPSCommonClassBase).[TypeID] = 'incident-guid'");
	});
});
