import type { IDataObject, IPollFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { escapeAsqlString, matrix42ApiRequest } from './GenericFunctions';

/** Additional-fields collection of the trigger. */
interface TriggerAdditionalFields {
	asqlFilter?: string;
	columns?: string;
	fetchFullObject?: boolean;
	limit?: number;
}

/**
 * Watermark state kept in the workflow's static data. Persisted by n8n on
 * activation and whenever a poll emits — never on a poll that returns null,
 * and never from a manual execution.
 */
interface TriggerStaticData extends IDataObject {
	/** Fingerprint of the watched configuration; a change resets the watermark. */
	configKey?: string;
	/** "Created or Updated" mode: highest seen rowversion, as a decimal string. */
	timestampWatermark?: string;
	/** "Created" mode: highest seen date, verbatim as the API returned it. */
	createdWatermark?: string;
	/** "Created" mode: fragment IDs already emitted at exactly `createdWatermark`. */
	boundaryIds?: string[];
}

/**
 * Keeps the boundary-ID dedup list from growing without bound. Must be at
 * least as large as the maximum poll limit — the poll page is widened by the
 * boundary count, so boundary rows can never crowd fresh rows out of a page.
 */
const MAX_BOUNDARY_IDS = 1000;

/** Upper bound of the per-poll limit, enforced in the node UI as well. */
export const MAX_POLL_LIMIT = 1000;

const EPOCH_ISO = '1970-01-01T00:00:00.000Z';

/**
 * The resolved Expression-TypeID → CI-internal-name map, cached per activation
 * (keyed on the static-data object identity, which lives exactly as long as
 * one Workflow instance). Schema data changes rarely; a TTL guards the rest.
 */
const schemaTypesCache = new WeakMap<object, { expiresAt: number; ciByTypeId: Map<string, string> }>();
const SCHEMA_TYPES_TTL_MS = 10 * 60_000;

/**
 * Decodes a Matrix42 `TimeStamp` value (base64 of the SQL Server 8-byte
 * big-endian rowversion) into a bigint. ASQL compares the same column against
 * a bare decimal integer literal.
 */
export function decodeRowVersion(value: unknown): bigint {
	if (typeof value === 'string' && value !== '') {
		const bytes = Buffer.from(value, 'base64');
		if (bytes.length === 8) {
			return bytes.readBigUInt64BE(0);
		}
	}
	throw new Error(`Value is not a rowversion timestamp: ${String(value)}`);
}

/**
 * Builds the columns list for the poll query: the fragment ID, the object ID
 * (aliased, so downstream nodes get the EOID every other operation expects),
 * the watermark column (the API refuses to sort by an unselected column), and
 * any user-requested extras. `DisplayString` and `Expression-TypeID` are
 * always in the response without being asked for.
 */
export function buildTriggerColumns(watermarkAttribute: string, extraColumns?: string): string {
	const columns = ['ID', '[Expression-ObjectID] as ObjectID', watermarkAttribute];
	// Also block the raw spellings of the aliased object-ID column — selecting
	// them explicitly is either an error (Expression-…) or a duplicate.
	const seen = new Set([
		...columns.map((column) => column.toLowerCase()),
		'objectid',
		'expression-objectid',
		'[expression-objectid]',
	]);
	for (const raw of (extraColumns ?? '').split(',')) {
		const column = raw.trim();
		if (column === '' || seen.has(column.toLowerCase())) continue;
		seen.add(column.toLowerCase());
		columns.push(column);
	}
	return columns.join(',');
}

/** Builds the server-side type filter, `T(SPSCommonClassBase).[TypeID] …`. */
export function buildTypeCondition(typeIds: string[]): string | undefined {
	const ids = typeIds.filter((id) => id !== '');
	if (ids.length === 0) return undefined;
	const literals = ids.map((id) => `'${escapeAsqlString(id)}'`);
	if (literals.length === 1) {
		return `T(SPSCommonClassBase).[TypeID] = ${literals[0]}`;
	}
	return `T(SPSCommonClassBase).[TypeID] IN (${literals.join(', ')})`;
}

async function fetchPage(
	this: IPollFunctions,
	dataDefinition: string,
	conditions: string[],
	columns: string,
	sort: string,
	pageSize: number,
): Promise<IDataObject[]> {
	const query: IDataObject = {
		columns,
		sort,
		pagesize: pageSize,
	};
	const where = conditions.filter((condition) => condition !== '').join(' AND ');
	if (where !== '') {
		query.where = where;
	}
	const response = await matrix42ApiRequest.call(
		this,
		'GET',
		`/data/fragments/${encodeURIComponent(dataDefinition)}`,
		{},
		query,
	);
	if (!Array.isArray(response)) {
		throw new NodeOperationError(
			this.getNode(),
			`Unexpected response from Matrix42 when polling "${dataDefinition}" — expected a list of rows`,
		);
	}
	return response as IDataObject[];
}

/**
 * Attaches the complete object (all fragments) to each row when the user asked
 * for it. The configuration item is resolved from the row's Expression-TypeID
 * through /Schema/types, cached per activation.
 */
async function attachFullObjects(this: IPollFunctions, rows: IDataObject[]): Promise<IDataObject[]> {
	const cacheKey = this.getWorkflowStaticData('node');
	let cached = schemaTypesCache.get(cacheKey);
	if (cached === undefined || cached.expiresAt < Date.now()) {
		const types = (await matrix42ApiRequest.call(this, 'GET', '/Schema/types', {})) as Array<{
			Id?: string;
			InternalName?: string;
		}>;
		const ciByTypeId = new Map<string, string>();
		if (Array.isArray(types)) {
			for (const type of types) {
				if (type.Id && type.InternalName) {
					ciByTypeId.set(type.Id.toLowerCase(), type.InternalName);
				}
			}
		}
		cached = { expiresAt: Date.now() + SCHEMA_TYPES_TTL_MS, ciByTypeId };
		schemaTypesCache.set(cacheKey, cached);
	}

	const result: IDataObject[] = [];
	for (const row of rows) {
		const typeId = typeof row['Expression-TypeID'] === 'string' ? row['Expression-TypeID'] : '';
		const objectId = typeof row.ObjectID === 'string' ? row.ObjectID : '';
		const ciName = cached.ciByTypeId.get(typeId.toLowerCase());
		if (ciName && objectId) {
			const object = await matrix42ApiRequest.call(
				this,
				'GET',
				`/data/objects/${encodeURIComponent(ciName)}/${encodeURIComponent(objectId)}`,
				{},
				{ full: false },
			);
			// The API answers 200 with null for objects the account cannot read.
			result.push(object === null || object === undefined ? { ...row } : { ...row, Object: object });
		} else {
			result.push({ ...row });
		}
	}
	return result;
}

export async function pollMatrix42(this: IPollFunctions) {
	const event = this.getNodeParameter('event') as string;
	const dataDefinition = this.getNodeParameter('dataDefinition') as string;
	const typeIds = (this.getNodeParameter('typeFilter', []) as string[]) ?? [];
	const additionalFields = (this.getNodeParameter('additionalFields', {}) ??
		{}) as TriggerAdditionalFields;

	const isCreatedMode = event === 'objectCreated';
	const watermarkAttribute = isCreatedMode
		? ((this.getNodeParameter('createdDateAttribute', 'CreatedDate') as string) || 'CreatedDate').trim()
		: 'TimeStamp';
	const limit = Math.min(Math.max(additionalFields.limit ?? 50, 1), MAX_POLL_LIMIT);
	const isManual = this.getMode() === 'manual';

	const staticData = this.getWorkflowStaticData('node') as TriggerStaticData;
	const configKey = `${dataDefinition}::${event}::${watermarkAttribute}`;
	const isFirstRun =
		staticData.configKey !== configKey ||
		(isCreatedMode ? staticData.createdWatermark === undefined : staticData.timestampWatermark === undefined);

	// Filters applied when polling for events. The baseline seed deliberately
	// skips the ASQL filter (see below); the type filter is safe everywhere
	// because an object's type never changes outside an explicit Transform.
	const typeCondition = buildTypeCondition(typeIds);
	const baseConditions = typeCondition === undefined ? [] : [typeCondition];
	const pollConditions = [...baseConditions];
	const asqlFilter = additionalFields.asqlFilter?.trim();
	if (asqlFilter) pollConditions.push(`(${asqlFilter})`);

	const columns = buildTriggerColumns(watermarkAttribute, additionalFields.columns);

	// Errors are deliberately NOT swallowed: in the editor and on the activation
	// poll they surface directly, and on an active workflow n8n turns a thrown
	// poll error into a visible failed execution (feeding any error workflow)
	// while the poller keeps running.

	if (isManual) {
		// "Fetch Test Event": newest matching row, watermark untouched — a manual
		// run could not persist static data anyway.
		const rows = await fetchPage.call(
			this,
			dataDefinition,
			pollConditions,
			columns,
			`${watermarkAttribute} DESC`,
			1,
		);
		if (rows.length === 0) return null;
		const items = additionalFields.fetchFullObject ? await attachFullObjects.call(this, rows) : rows;
		return [this.helpers.returnJsonArray(items)];
	}

	if (isFirstRun) {
		// Baseline: existing records never fire. The value comes from the data
		// itself, not the local clock — n8n persists it right after the
		// activation poll. The ASQL filter is NOT applied here: seeding on the
		// newest *matching* row would let a pre-existing older record fire later
		// when a mutable attribute starts satisfying the filter.
		const newest = await fetchPage.call(
			this,
			dataDefinition,
			baseConditions,
			columns,
			`${watermarkAttribute} DESC`,
			1,
		);
		staticData.configKey = configKey;
		if (isCreatedMode) {
			delete staticData.timestampWatermark;
			if (newest.length === 0) {
				staticData.createdWatermark = EPOCH_ISO;
				staticData.boundaryIds = [];
				return null;
			}
			const seedValue = newest[0][watermarkAttribute];
			if (typeof seedValue !== 'string' || !Number.isFinite(Date.parse(seedValue))) {
				throw new NodeOperationError(
					this.getNode(),
					`The attribute "${watermarkAttribute}" of "${dataDefinition}" holds no usable date (got: ${String(
						seedValue,
					)}). Pick a populated date attribute, or use the "Object Created or Updated" event, which works on every class.`,
				);
			}
			// Several pre-existing rows can share the newest date value (SQL
			// datetime ticks, bulk imports) — all of them belong to the boundary,
			// or they would fire as false events on the first real poll.
			const ties = await fetchPage.call(
				this,
				dataDefinition,
				[...baseConditions, `${watermarkAttribute} >= '${escapeAsqlString(seedValue)}'`],
				columns,
				`${watermarkAttribute} ASC`,
				MAX_BOUNDARY_IDS,
			);
			staticData.createdWatermark = seedValue;
			staticData.boundaryIds = ties
				.filter((row) => String(row[watermarkAttribute]) === seedValue)
				.map((row) => String(row.ID))
				.slice(0, MAX_BOUNDARY_IDS);
			return null;
		}
		delete staticData.createdWatermark;
		delete staticData.boundaryIds;
		staticData.timestampWatermark =
			newest.length > 0 ? decodeRowVersion(newest[0].TimeStamp).toString() : '0';
		return null;
	}

	if (isCreatedMode) {
		// Date literals are rounded to SQL datetime ticks, so only values the API
		// itself returned are safe to compare against: >= re-includes the boundary
		// row(s), which the boundary-ID list then drops. The page is widened by
		// the boundary count — boundary rows always sort first and must never be
		// able to crowd every fresh row out of the page.
		const watermark = staticData.createdWatermark as string;
		const boundaryIds = new Set(staticData.boundaryIds ?? []);
		const rows = await fetchPage.call(
			this,
			dataDefinition,
			[...pollConditions, `${watermarkAttribute} >= '${escapeAsqlString(watermark)}'`],
			columns,
			`${watermarkAttribute} ASC`,
			limit + boundaryIds.size,
		);
		const freshRows = rows.filter((row) => !boundaryIds.has(String(row.ID)));
		if (freshRows.length === 0) return null;

		const previousMs = Date.parse(watermark);
		let maxMs = previousMs;
		let maxVerbatim = watermark;
		for (const row of rows) {
			const value = String(row[watermarkAttribute]);
			const ms = Date.parse(value);
			if (Number.isFinite(ms) && ms > maxMs) {
				maxMs = ms;
				maxVerbatim = value;
			}
		}
		const idsAtMax = rows
			.filter((row) => Date.parse(String(row[watermarkAttribute])) === maxMs)
			.map((row) => String(row.ID));

		// Anything fallible happens BEFORE the watermark moves: a failed fetch
		// below fails this poll visibly and the next poll re-reads the same rows,
		// instead of silently skipping them.
		const items = additionalFields.fetchFullObject
			? await attachFullObjects.call(this, freshRows)
			: freshRows;

		staticData.createdWatermark = maxVerbatim;
		staticData.boundaryIds = (
			maxMs === previousMs ? Array.from(new Set([...boundaryIds, ...idsAtMax])) : idsAtMax
		).slice(-MAX_BOUNDARY_IDS);

		return [this.helpers.returnJsonArray(items)];
	}

	// "Created or Updated": the rowversion is unique and strictly increasing,
	// so a strict > comparison is exactly-once with no dedup at all.
	const watermark = BigInt(staticData.timestampWatermark as string);
	const rows = await fetchPage.call(
		this,
		dataDefinition,
		[...pollConditions, `TimeStamp > ${watermark.toString()}`],
		columns,
		'TimeStamp ASC',
		limit,
	);
	if (rows.length === 0) return null;

	let max = watermark;
	for (const row of rows) {
		const value = decodeRowVersion(row.TimeStamp);
		if (value > max) max = value;
	}

	// As above: fetch first, move the watermark last.
	const items = additionalFields.fetchFullObject ? await attachFullObjects.call(this, rows) : rows;

	staticData.timestampWatermark = max.toString();

	return [this.helpers.returnJsonArray(items)];
}
