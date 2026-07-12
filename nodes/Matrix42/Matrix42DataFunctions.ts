import { type IDataObject, type IExecuteFunctions, jsonParse } from 'n8n-workflow';
import { matrix42ApiRequest } from './GenericFunctions';

/** Parses a `type: 'json'` node parameter that may arrive as a string or an already-resolved object. */
function parseJsonParameter(value: unknown, parameterName: string): IDataObject {
	if (value === undefined || value === null || value === '') {
		return {};
	}
	if (typeof value === 'object') {
		return value as IDataObject;
	}
	return jsonParse<IDataObject>(value as string, {
		errorMessage: `The "${parameterName}" parameter does not contain valid JSON`,
	});
}

export async function getFragments(this: IExecuteFunctions, i: number) {
	const returnData: IDataObject[] = [];

	const ddname = this.getNodeParameter('dataDefinition', i) as string;
	const where = this.getNodeParameter('where', i) as string;
	const columns = this.getNodeParameter('columns', i) as string;
	const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;

	const additionalFields = this.getNodeParameter('additionalFields', i, {}) as {
		sort?: string;
	};

	const qs: IDataObject = {
		where,
		columns,
	};
	if (additionalFields.sort) {
		qs.sort = additionalFields.sort;
	}

	const endpoint = `/data/fragments/${encodeURIComponent(ddname)}` as const;

	if (returnAll) {
		const pageSize = 500;
		let pageNumber = 0;
		let received = 0;
		do {
			const page = (await matrix42ApiRequest.call(this, 'GET', endpoint, {}, {
				...qs,
				pagesize: pageSize,
				pagenumber: pageNumber,
			})) as IDataObject[];
			const rows = Array.isArray(page) ? page : [page];
			returnData.push(...rows);
			received = rows.length;
			pageNumber += 1;
		} while (received === pageSize);
		return returnData;
	}

	const limit = this.getNodeParameter('limit', i, 50) as number;
	qs.pagesize = limit;

	const response = await matrix42ApiRequest.call(this, 'GET', endpoint, {}, qs);

	if (Array.isArray(response)) {
		returnData.push(...response);
	} else {
		returnData.push(response as IDataObject);
	}

	return returnData;
}

export async function addFragment(this: IExecuteFunctions, i: number) {
	const returnData: IDataObject[] = [];

	const ddname = this.getNodeParameter('dataDefinition', i) as string;
	const fragmentData = parseJsonParameter(this.getNodeParameter('fragmentData', i), 'Fragment Data');

	const response = await matrix42ApiRequest.call(
		this,
		'POST',
		`/data/fragments/${encodeURIComponent(ddname)}`,
		fragmentData,
		{},
	);

	returnData.push({ fragmentId: response } as IDataObject);

	return returnData;
}

export async function updateFragment(this: IExecuteFunctions, i: number) {
	const ddname = this.getNodeParameter('dataDefinition', i) as string;
	const fragmentData = parseJsonParameter(this.getNodeParameter('fragmentData', i), 'Fragment Data');

	await matrix42ApiRequest.call(
		this,
		'PUT',
		`/data/fragments/${encodeURIComponent(ddname)}`,
		fragmentData,
		{},
	);

	return [{ Message: 'Success' }];
}

export async function deleteFragment(this: IExecuteFunctions, i: number) {
	const ddname = this.getNodeParameter('dataDefinition', i) as string;
	const fragmentId = this.getNodeParameter('fragmentId', i) as string;

	await matrix42ApiRequest.call(
		this,
		'DELETE',
		`/data/fragments/${encodeURIComponent(ddname)}/${encodeURIComponent(fragmentId)}`,
		{},
		{},
	);

	return [{ Message: 'Success' }];
}

export async function addObject(this: IExecuteFunctions, i: number) {
	const returnData: IDataObject[] = [];

	const ciname = this.getNodeParameter('configurationItem', i) as string;
	const objectData = parseJsonParameter(this.getNodeParameter('objectData', i), 'Object Data');

	const response = await matrix42ApiRequest.call(
		this,
		'POST',
		`/data/objects/${encodeURIComponent(ciname)}`,
		objectData,
		{},
	);

	returnData.push({ objectId: response } as IDataObject);

	return returnData;
}

export async function getObject(this: IExecuteFunctions, i: number) {
	const returnData: IDataObject[] = [];

	const ciname = this.getNodeParameter('configurationItem', i) as string;
	const objectId = this.getNodeParameter('objectId', i) as string;
	const full = this.getNodeParameter('full', i) as boolean;

	const qs: IDataObject = {
		full,
	};

	const response = await matrix42ApiRequest.call(
		this,
		'GET',
		`/data/objects/${encodeURIComponent(ciname)}/${encodeURIComponent(objectId)}`,
		{},
		qs,
	);

	returnData.push(response as IDataObject);

	return returnData;
}

export async function updateObject(this: IExecuteFunctions, i: number) {
	const ciname = this.getNodeParameter('configurationItem', i) as string;
	const objectData = parseJsonParameter(this.getNodeParameter('objectData', i), 'Object Data');
	const full = this.getNodeParameter('full', i) as boolean;

	const qs: IDataObject = {
		full,
	};

	await matrix42ApiRequest.call(
		this,
		'PUT',
		`/data/objects/${encodeURIComponent(ciname)}`,
		objectData,
		qs,
	);

	return [{ Message: 'Success' }];
}

export async function deleteObject(this: IExecuteFunctions, i: number) {
	const ciname = this.getNodeParameter('configurationItem', i) as string;
	const objectId = this.getNodeParameter('objectId', i) as string;

	await matrix42ApiRequest.call(
		this,
		'DELETE',
		`/data/objects/${encodeURIComponent(ciname)}/${encodeURIComponent(objectId)}`,
		{},
		{},
	);

	return [{ Message: 'Success' }];
}
