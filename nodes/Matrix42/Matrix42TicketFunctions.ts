import { type IDataObject, type IExecuteFunctions, jsonParse, NodeOperationError } from 'n8n-workflow';
import { matrix42ApiRequest } from './GenericFunctions';

const NIL_GUID = '00000000-0000-0000-0000-000000000000';

/** True for values that mean "not set" for a Matrix42 relation field (empty or the nil GUID sentinel). */
function isBlankRelation(value: unknown): boolean {
	return value === undefined || value === null || value === '' || value === NIL_GUID;
}

/** Coerces a numeric node parameter, throwing a descriptive error instead of emitting `NaN`/empty into a request. */
function toNumber(this: IExecuteFunctions, value: unknown, displayName: string): number {
	const num = Number(value);
	if (value === '' || value === null || value === undefined || Number.isNaN(num)) {
		throw new NodeOperationError(this.getNode(), `The "${displayName}" field must be a number`);
	}
	return num;
}

function parseJsonArray(value: unknown, displayName: string): unknown[] {
	if (value === undefined || value === null || value === '') {
		return [];
	}
	if (Array.isArray(value)) {
		return value;
	}
	if (typeof value === 'object') {
		return [value];
	}
	const parsed = jsonParse<unknown>(value as string, {
		errorMessage: `The "${displayName}" field does not contain valid JSON`,
	});
	return Array.isArray(parsed) ? parsed : [parsed];
}

export async function createTicket(this: IExecuteFunctions, i: number) {
	const returnData: IDataObject[] = [];

	const ticketType = this.getNodeParameter('ticketType', i) as number;
	const category = this.getNodeParameter('category', i) as string;
	const subject = this.getNodeParameter('subject', i) as string;
	const descriptionHTML = this.getNodeParameter('descriptionHTML', i) as string;
	const impact = toNumber.call(this, this.getNodeParameter('impact', i), 'Impact');
	const urgency = toNumber.call(this, this.getNodeParameter('urgency', i), 'Urgency');
	const state = toNumber.call(this, this.getNodeParameter('state', i), 'State');

	const additionalFields = this.getNodeParameter('additionalFields', i, {}) as {
		responsibleRole?: string;
		creator?: string;
		user?: string;
		responsibleUser?: string;
		sla?: string;
		extraProperties?: { property?: Array<{ name?: string; value?: string }> };
	};
	const responsibleRole = additionalFields.responsibleRole;
	const creator = additionalFields.creator;
	const user = additionalFields.user;
	const responsibleUser = additionalFields.responsibleUser;
	const sla = additionalFields.sla;
	const extraProperties = additionalFields.extraProperties?.property;

	let priority = this.getNodeParameter('priority', i) as number;

	if (Number(priority) === -1) {
		// Auto: derive the priority from the instance's impact/urgency mapping.
		const calculatedPriority = (await matrix42ApiRequest.call(
			this,
			'GET',
			'/data/fragments/SVMActivityPickupPriorityMapping',
			{},
			{
				where: `ImpactValue = ${impact} AND UrgencyValue = ${urgency}`,
				columns: 'PriorityValue',
			},
		)) as IDataObject[];

		if (Array.isArray(calculatedPriority) && calculatedPriority.length > 0) {
			priority = calculatedPriority[0].PriorityValue as number;
		} else {
			// No mapping row for this impact/urgency pair: fall back to "Medium".
			priority = 2;
		}
	}

	const qs: IDataObject = {
		activityType: ticketType,
	};

	const body: IDataObject = {
		Category: category,
		Subject: subject,
		state,
		DescriptionHTML: descriptionHTML,
		Impact: impact,
		Urgency: urgency,
		Priority: priority,
		EntryBy: 4,
	};

	// Optional relations: only send when the user actually picked one.
	if (!isBlankRelation(responsibleUser)) body.ResponsibleUser = responsibleUser;
	if (!isBlankRelation(responsibleRole)) body.ResponsibleRole = responsibleRole;
	if (!isBlankRelation(creator)) body.Creator = creator;
	if (!isBlankRelation(user)) body.User = user;
	if (!isBlankRelation(sla)) body.Sla = sla;

	// Arbitrary custom attributes as Name/Value pairs.
	if (Array.isArray(extraProperties) && extraProperties.length > 0) {
		body.ExtraProperties = extraProperties
			.filter((p) => p.name)
			.map((p) => ({ Name: p.name, Value: p.value }));
	}

	const response = await matrix42ApiRequest.call(this, 'POST', '/ticket/create', body, qs);

	returnData.push({ ticketEoid: response } as IDataObject);

	return returnData;
}

export async function closeTicket(this: IExecuteFunctions, i: number) {
	const ticketEoid = this.getNodeParameter('ticketEoid', i) as string;
	const closeRelatedIncidents = this.getNodeParameter('closeRelatedIncidents', i) as boolean;
	const reason = this.getNodeParameter('reason', i) as number;
	const errorType = this.getNodeParameter('errorType', i) as number;
	const comments = this.getNodeParameter('comments', i) as string;
	const servicesAvailability = this.getNodeParameter('servicesAvailability', i) as number;
	const assetsAvailability = this.getNodeParameter('assetsAvailability', i) as number;
	const sendMailToInitiator = this.getNodeParameter('sendMailToInitiator', i) as boolean;
	const notifyResponsible = this.getNodeParameter('notifyResponsible', i) as boolean;
	const sendMailToUsers = this.getNodeParameter('sendMailToUsers', i) as boolean;
	const sendMailToRelatedResponsibleUsers = this.getNodeParameter(
		'sendMailToRelatedResponsibleUsers',
		i,
	) as boolean;

	const body = {
		ObjectIds: [ticketEoid],
		CloseRelatedIncidents: closeRelatedIncidents,
		Reason: reason,
		Comments: comments,
		ServicesAvailability: servicesAvailability,
		AssetsAvailability: assetsAvailability,
		SendMailToUsers: sendMailToUsers,
		ErrorType: errorType,
		SendMailToInitiator: sendMailToInitiator,
		NotifyResponsible: notifyResponsible,
		SendMailToRelatedResponsibleUsers: sendMailToRelatedResponsibleUsers,
	};

	await matrix42ApiRequest.call(this, 'POST', '/ticket/close', body, {});

	const returnData: IDataObject[] = [{ Message: 'Success' }];

	return returnData;
}

export async function transformTicket(this: IExecuteFunctions, i: number) {
	const ticketEoid = this.getNodeParameter('ticketEoid', i) as string;
	const sourceTypeName = this.getNodeParameter('sourceTypeName', i) as string;
	const targetTypeName = this.getNodeParameter('targetTypeName', i) as string;
	const category = this.getNodeParameter('category', i) as string;

	const additionalFields = this.getNodeParameter('additionalFields', i, {}) as {
		sla?: string;
		ola?: string;
		recipientRole?: string;
	};
	const sla = additionalFields.sla;
	const ola = additionalFields.ola;
	const recipientRole = additionalFields.recipientRole;

	const body: IDataObject = {
		ObjectIds: [ticketEoid],
		SourceTypeName: sourceTypeName,
		TargetTypeName: targetTypeName,
		Category: category,
	};

	if (!isBlankRelation(sla)) body.Sla = sla;
	if (!isBlankRelation(ola)) body.Ola = ola;
	if (!isBlankRelation(recipientRole)) body.RecipientRole = recipientRole;

	await matrix42ApiRequest.call(this, 'POST', '/ticket/transform', body, {});

	const returnData: IDataObject[] = [{ Message: 'Success' }];

	return returnData;
}

const GUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** The journal/Add contract for one template parameter. */
interface JournalParameter {
	Name: string;
	Value: unknown;
	Format?: string;
	IsCurrency?: boolean;
}

/** True for a row whose every value is empty — an accidental "Add Parameter" click. */
function isBlankParameterRow(raw: unknown): boolean {
	if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
		return false;
	}
	return Object.values(raw).every((value) => value === '' || value === undefined || value === null);
}

/**
 * Normalizes one journal parameter to the {Name, Value, Format?, IsCurrency?} shape the API
 * expects, accepting both key casings. Anything else is rejected with a descriptive message —
 * the API would otherwise store a nameless junk parameter (HTTP 200) or answer a 400 whose
 * validation body carries empty messages.
 */
function toJournalParameter(this: IExecuteFunctions, raw: unknown, index: number): JournalParameter {
	if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
		throw new NodeOperationError(
			this.getNode(),
			`Journal parameter ${index + 1} must be an object with "Name" and "Value" keys`,
		);
	}
	const entry = raw as Record<string, unknown>;
	const name = entry.Name ?? entry.name;
	if (typeof name !== 'string' || name.trim() === '') {
		throw new NodeOperationError(
			this.getNode(),
			`Journal parameter ${index + 1} needs a non-empty "Name"`,
		);
	}
	const parameter: JournalParameter = { Name: name, Value: entry.Value ?? entry.value ?? '' };
	const format = entry.Format ?? entry.format;
	if (typeof format === 'string' && format !== '') {
		parameter.Format = format;
	}
	const isCurrency = entry.IsCurrency ?? entry.isCurrency;
	if (typeof isCurrency === 'boolean') {
		parameter.IsCurrency = isCurrency;
	}
	return parameter;
}

export async function addJournalEntry(this: IExecuteFunctions, i: number) {
	const ticketEoid = this.getNodeParameter('ticketEoid', i) as string;
	const comments = this.getNodeParameter('comments', i) as string;
	const entryType = toNumber.call(this, this.getNodeParameter('entryType', i), 'Type');
	const creator = this.getNodeParameter('creator', i, '') as string;
	const visibleInPortal = this.getNodeParameter('visibleInPortal', i) as boolean;

	const additionalFields = this.getNodeParameter('additionalFields', i, {}) as {
		typeId?: string;
		publish?: boolean;
		fileIds?: string;
		journalParameters?: {
			parameter?: Array<{ name?: string; value?: string; format?: string }>;
		};
		/** Raw-JSON parameters of workflows saved before the fixedCollection UI. */
		parameters?: unknown;
		isFromEditDialog?: boolean;
	};

	const rawParameters: unknown[] = [
		...(additionalFields.journalParameters?.parameter ?? []),
		...parseJsonArray(additionalFields.parameters, 'Parameters'),
	];
	const parameters = rawParameters
		.filter((raw) => !isBlankParameterRow(raw))
		.map((raw, index) => toJournalParameter.call(this, raw, index));

	const body: IDataObject = {
		ObjectId: ticketEoid,
		Publish: additionalFields.publish ?? false,
		Comments: comments,
		EntryType: entryType,
		VisibleInPortal: visibleInPortal,
		Parameters: parameters,
		IsFromEditDialog: additionalFields.isFromEditDialog ?? false,
		...(additionalFields.fileIds !== undefined && {
			FileIds: parseJsonArray(additionalFields.fileIds, 'File IDs'),
		}),
	};

	// Omitted when blank: the API rejects an empty Creator with an opaque 400 but happily
	// attributes the entry to the API user when the key is absent.
	if (!isBlankRelation(creator)) {
		body.Creator = creator;
	}

	const typeId = additionalFields.typeId;
	if (typeId !== undefined && typeId !== '') {
		if (!GUID_RE.test(typeId)) {
			throw new NodeOperationError(
				this.getNode(),
				`The "Type ID" field must be a GUID, got: ${typeId}`,
			);
		}
		body.TypeId = typeId;
	}

	await matrix42ApiRequest.call(this, 'POST', '/journal/Add', body, {});

	const returnData: IDataObject[] = [{ Message: 'Success' }];

	return returnData;
}
