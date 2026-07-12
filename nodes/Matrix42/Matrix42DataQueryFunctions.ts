import { type IDataObject, type IExecuteFunctions, jsonParse } from 'n8n-workflow';
import { matrix42ApiRequest } from './GenericFunctions';

// Maps the Additional Fields parameter names to the exact query-string keys the
// DataQuery route expects (some are PascalCase in the API).
const OPTIONAL_QS: Record<string, string> = {
	redFilter: 'redFilter',
	yellowFilter: 'yellowFilter',
	greenFilter: 'greenFilter',
	totalCounted: 'totalCounted',
	orderBy: 'orderBy',
	search: 'search',
	filters: 'filters',
	startDate: 'startDate',
	endDate: 'endDate',
	filtersOperator: 'filtersOperator',
	columns: 'columns',
	forceConsiderParentFilters: 'ForceConsiderParentFilters',
	entityTypes: 'EntityTypes',
	archivedData: 'ArchivedData',
};

export async function getData(this: IExecuteFunctions, i: number) {
	const dataQueryId = this.getNodeParameter('dataQueryId', i) as string;
	const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;
	const pageSize = this.getNodeParameter('pageSize', i, 100) as number;
	const additionalFields = this.getNodeParameter('additionalFields', i, {}) as IDataObject & {
		userFilters?: string | IDataObject;
	};
	const userFiltersRaw = additionalFields.userFilters;

	// All the paging/filter options are query-string params (Source 0 in the contract).
	const baseQs: IDataObject = {};
	for (const [field, qsKey] of Object.entries(OPTIONAL_QS)) {
		const value = additionalFields[field];
		if (value !== undefined && value !== '') {
			baseQs[qsKey] = value as IDataObject[keyof IDataObject];
		}
	}

	// A structured filter group can only be passed in the body of the POST variant. Use POST
	// only when User Filters are supplied; otherwise use the simpler GET (no body).
	const hasUserFilters =
		userFiltersRaw !== undefined && userFiltersRaw !== null && userFiltersRaw !== '';
	const method = hasUserFilters ? 'POST' : 'GET';
	const body: IDataObject = hasUserFilters
		? typeof userFiltersRaw === 'object'
			? (userFiltersRaw as IDataObject)
			: jsonParse<IDataObject>(userFiltersRaw as string, {
					errorMessage: 'The "User Filters" field does not contain valid JSON',
				})
		: {};

	const endpoint = `/DataQuery/${encodeURIComponent(dataQueryId)}` as const;
	const returnData: IDataObject[] = [];

	if (returnAll) {
		// Page through the query (pages are zero-based) until a short/empty page is returned.
		let page = 0;
		let received = 0;
		do {
			const rows = (await matrix42ApiRequest.call(this, method, endpoint, body, {
				...baseQs,
				pageSize,
				page,
			})) as IDataObject[];
			const arr = Array.isArray(rows) ? rows : [rows];
			returnData.push(...arr);
			received = arr.length;
			page += 1;
		} while (received === pageSize);
		return returnData;
	}

	const page = this.getNodeParameter('page', i, 0) as number;
	const response = (await matrix42ApiRequest.call(this, method, endpoint, body, {
		...baseQs,
		pageSize,
		page,
	})) as IDataObject[];

	if (Array.isArray(response)) {
		returnData.push(...response);
	} else {
		returnData.push(response as IDataObject);
	}

	return returnData;
}
