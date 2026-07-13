import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { escapeAsqlString } from './GenericFunctions';
import { matrix42ImportFields, matrix42ImportOperations } from './Matrix42ImportOperations';
import { matrix42DataFields, matrix42DataOperations } from './Matrix42DataOperations';
import { matrix42DataQueryFields, matrix42DataQueryOperations } from './Matrix42DataQueryOperations';
import { matrix42TicketFields, matrix42TicketOperations } from './Matrix42TicketOperations';
import {
	addFragment,
	addObject,
	deleteFragment,
	deleteObject,
	getFragments,
	getObject,
	updateFragment,
	updateObject
} from './Matrix42DataFunctions';
import { matrix42ApiRequest } from './GenericFunctions';
import {addJournalEntry, closeTicket, createTicket, transformTicket} from "./Matrix42TicketFunctions";
import { getData } from './Matrix42DataQueryFunctions';
import {executeImportDefinition} from "./Matrix42ImportFunctions";
import {matrix42StorageFields, matrix42StorageOperations} from "./Matrix42StorageOperations";
import {uploadFileToCI} from "./Matrix42StorageFunctions";

export class Matrix42 implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Matrix42',
		name: 'matrix42',
		icon: { light: 'file:matrix42.svg', dark: 'file:matrix42.dark.svg' },
		group: ['transform'],
		version: 2,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Interact with the Matrix42 ESMP web services API',
		defaults: {
			name: 'Matrix42',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
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
		],
		usableAsTool: true,
		properties: [
			{
				displayName: 'Authentication',
				name: 'authentication',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Webservice Token',
						value: 'webserviceToken',
					},
					{
						name: 'Basic',
						value: 'basic',
					},
				],
				default: 'webserviceToken',
			},
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Data Fragment',
						value: 'dataFragment',
					},
					{
						name: 'Data Object',
						value: 'dataObject',
					},
					{
						name: 'Data Query',
						value: 'dataQuery',
					},
					{
						name: 'Import',
						value: 'import',
					},
					{
						name: 'Storage',
						value: 'storage',
					},
					{
						name: 'Ticket',
						value: 'ticket',
					},
				],
				default: 'ticket',
			},

			// Data Fragment & Data Object
			...matrix42DataOperations,
			...matrix42DataFields,

			// Data Query
			...matrix42DataQueryOperations,
			...matrix42DataQueryFields,

			// Import
			...matrix42ImportOperations,
			...matrix42ImportFields,

			// Ticket
			...matrix42TicketOperations,
			...matrix42TicketFields,

			// Storage
			...matrix42StorageOperations,
			...matrix42StorageFields,
		],
	};

	methods = {
		loadOptions: {
			async getUsers(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const responseData = await matrix42ApiRequest.call(
					this,
					'GET',
					'/data/fragments/SPSUserClassBase',
					{},
					{
						columns: "ID, FirstName, LastName",
						pagesize: 1000,
					}
				);

				if (!Array.isArray(responseData)) {
					throw new NodeOperationError(this.getNode(), 'No data got returned');
				}

				const returnData: INodePropertyOptions[] = [];

				for (const userData of responseData) {
					const userName = `${userData.FirstName?? ''} ${userData.LastName?? ''}`;
					const userId = userData.ID;

					returnData.push({
						name: userName,
						value: userId,
					});
				}

				returnData.sort((a, b) => {
					if (a.name < b.name) {
						return -1;
					}
					if (a.name > b.name) {
						return 1;
					}
					return 0;
				});

				return returnData;
			},
			async getTicketUrgencies(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const responseData = await matrix42ApiRequest.call(
					this,
					'GET',
					'/data/fragments/SVMActivityPickupUrgency',
					{},
					{
						columns: "ID, Position, Value, DisplayString",
					}
				);

				if (!Array.isArray(responseData)) {
					throw new NodeOperationError(this.getNode(), 'No data got returned');
				}

				const returnData: INodePropertyOptions[] = [];

				for (const urgenciesData of responseData) {
					const urgencyName = urgenciesData.DisplayString;
					const urgencyValue = urgenciesData.Value;

					returnData.push({
						name: urgencyName,
						value: urgencyValue,
					});
				}

				returnData.sort((a, b) => {
					if (a.name < b.name) {
						return -1;
					}
					if (a.name > b.name) {
						return 1;
					}
					return 0;
				});

				return returnData;
			},
			async getTicketImpacts(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const responseData = await matrix42ApiRequest.call(
					this,
					'GET',
					'/data/fragments/SVMActivityPickupImpact',
					{},
					{
						columns: "ID, Position, Value, DisplayString",
					}
				);

				if (!Array.isArray(responseData)) {
					throw new NodeOperationError(this.getNode(), 'No data got returned');
				}

				const returnData: INodePropertyOptions[] = [];

				for (const impactData of responseData) {
					const impactName = impactData.DisplayString;
					const impactValue = impactData.Value;

					returnData.push({
						name: impactName,
						value: impactValue,
					});
				}

				returnData.sort((a, b) => {
					if (a.name < b.name) {
						return -1;
					}
					if (a.name > b.name) {
						return 1;
					}
					return 0;
				});

				return returnData;
			},
			async getTicketCategories(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const responseData = await matrix42ApiRequest.call(
					this,
					'GET',
					'/data/fragments/SPSScCategoryClassBase',
					{},
					{
						where: "Recursive(Parent).ID = 'd0f04f85-458f-40bd-aeb0-e97b08b933b5' AND Hidden = 0",
						columns: "ID, Parent, Name, DefaultRecipientRole",
					}
				);

				if (!Array.isArray(responseData)) {
					throw new NodeOperationError(this.getNode(), 'No data got returned');
				}

				interface Category {
					ID: string;
					Parent: string | null;
					Name: string;
				}

				const byId = new Map<string, Category>();
				const childrenMap = new Map<string|null, Category[]>();
				for (const cat of responseData) {
					byId.set(cat.ID, cat);
					const parent = cat.Parent ?? null;
					if (!childrenMap.has(parent)) {
						childrenMap.set(parent, []);
					}
					childrenMap.get(parent)!.push(cat);
				}

				for (const arr of childrenMap.values()) {
					arr.sort((a, b) => a.Name.localeCompare(b.Name));
				}

				const returnData: INodePropertyOptions[] = [];

				function traverse(nodes: Category[], prefix = '') {
					for (const node of nodes) {
						const fullName = prefix ? `${prefix} / ${node.Name}` : node.Name;
						returnData.push({
							name: fullName,
							value: node.ID,
						});
						const kids = childrenMap.get(node.ID);
						if (kids) {
							traverse(kids, fullName);
						}
					}
				}

				const roots = childrenMap.get(null) || [];
				traverse(roots);

				return returnData;
			},
			async getTicketRoles(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				// The role list does not depend on the category — the category is only used to
				// mark the category's default recipient role, so it stays optional here (the
				// field lives inside a collection and may be opened before a category is chosen).
				const categoryId = this.getNodeParameter('category', '') as string;

				const responseData = await matrix42ApiRequest.call(
					this,
					'GET',
					'/data/fragments/SPSScRoleClassBase',
					{},
					{
						columns: "T(SPSSecurityClassRole).Name as Name, ID, [Expression-ObjectID]",
					}
				);

				if (!Array.isArray(responseData)) {
					throw new NodeOperationError(this.getNode(), 'No data got returned');
				}

				const returnData: INodePropertyOptions[] = [];

				for (const roleData of responseData) {
					const roleName = roleData.Name;
					const roleId = roleData.ID;

					returnData.push({
						name: roleName,
						value: roleId,
					});
				}

				let defaultOption: INodePropertyOptions | undefined;
				if (categoryId) {
					const responseDataCategory = await matrix42ApiRequest.call(
						this,
						'GET',
						'/data/fragments/SPSScCategoryClassBase',
						{},
						{
							where: `ID = '${escapeAsqlString(categoryId)}' AND Hidden = 0`,
							columns: "ID, Parent, Name, DefaultRecipientRole",
						}
					);

					if (Array.isArray(responseDataCategory) && responseDataCategory.length) {
						const defaultRoleId = responseDataCategory[0].DefaultRecipientRole as string | undefined;
						if (defaultRoleId) {
							const idx = returnData.findIndex(opt => opt.value === defaultRoleId);
							if (idx !== -1) {
								defaultOption = returnData.splice(idx, 1)[0];
								defaultOption.name = `${defaultOption.name} (Category Default)`;
							}
						}
					}
				}

				returnData.sort((a, b) => a.name.localeCompare(b.name));

				if (defaultOption) {
					returnData.unshift(defaultOption);
				}

				return returnData;
			},
			async getTicketSlas(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const responseData = await matrix42ApiRequest.call(
					this,
					'GET',
					'/data/fragments/SVCServiceLevelAgreementClassBase',
					{},
					{
						where: 'SLA_Type = 10',
						columns: "ID, [Expression-ObjectID], Name, FulfillmentResponsibleRole",
					}
				);

				if (!Array.isArray(responseData)) {
					throw new NodeOperationError(this.getNode(), 'No data got returned');
				}

				const returnData: INodePropertyOptions[] = [];

				for (const slaData of responseData) {
					const slaName = slaData.Name;
					const slaId = slaData.ID;

					returnData.push({
						name: slaName,
						value: slaId,
					});
				}

				returnData.sort((a, b) => {
					if (a.name < b.name) {
						return -1;
					}
					if (a.name > b.name) {
						return 1;
					}
					return 0;
				});

				return returnData;
			},
			async getTicketOlas(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const responseData = await matrix42ApiRequest.call(
					this,
					'GET',
					'/data/fragments/SVCServiceLevelAgreementClassBase',
					{},
					{
						where: 'SLA_Type = 20',
						columns: "ID, [Expression-ObjectID], Name, FulfillmentResponsibleRole",
					}
				);

				if (!Array.isArray(responseData)) {
					throw new NodeOperationError(this.getNode(), 'No data got returned');
				}

				const returnData: INodePropertyOptions[] = [];

				for (const olaData of responseData) {
					const olaName = olaData.Name;
					const olaId = olaData.ID;

					returnData.push({
						name: olaName,
						value: olaId,
					});
				}

				returnData.sort((a, b) => {
					if (a.name < b.name) {
						return -1;
					}
					if (a.name > b.name) {
						return 1;
					}
					return 0;
				});

				return returnData;
			},
			async getActivityStates(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const responseData = await matrix42ApiRequest.call(
					this,
					'GET',
					'/data/fragments/SPSCommonPickupObjectStatus',
					{},
					{
						where: 'StateGroup = 7',
						columns: "Value, DisplayString, Position",
					}
				);

				if (!Array.isArray(responseData)) {
					throw new NodeOperationError(this.getNode(), 'No data got returned');
				}

				const returnData: INodePropertyOptions[] = [];

				for (const stateData of responseData) {
					returnData.push({
						name: stateData.DisplayString,
						value: stateData.Value,
					});
				}

				returnData.sort((a, b) => Number(a.value) - Number(b.value));

				return returnData;
			},
			async getTicketCloseReasons(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const responseData = await matrix42ApiRequest.call(
					this,
					'GET',
					'/data/fragments/SPSCommonPickupObjectStateReason',
					{},
					{
						where: 'StateGroup = 7 AND State = 204',
						columns: "ID, Position, Value, DisplayString, StateGroup",
					}
				);

				if (!Array.isArray(responseData)) {
					throw new NodeOperationError(this.getNode(), 'No data got returned');
				}

				const returnData: INodePropertyOptions[] = [];

				for (const closeReasonData of responseData) {
					const closeReasonName = closeReasonData.DisplayString;
					const closeReasonValue = closeReasonData.Value;

					returnData.push({
						name: closeReasonName,
						value: closeReasonValue,
					});
				}

				returnData.sort((a, b) => {
					if (a.name < b.name) {
						return -1;
					}
					if (a.name > b.name) {
						return 1;
					}
					return 0;
				});

				return returnData;
			},
			async getTicketCloseErrorTypes(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const responseData = await matrix42ApiRequest.call(
					this,
					'GET',
					'/data/fragments/SVMActivityPickupErrorType',
					{},
					{
						columns: "ID, Position, Value, DisplayString",
					}
				);

				if (!Array.isArray(responseData)) {
					throw new NodeOperationError(this.getNode(), 'No data got returned');
				}

				const returnData: INodePropertyOptions[] = [];

				for (const errorTypeData of responseData) {
					const errorTypeName = errorTypeData.DisplayString;
					const errorTypeValue = errorTypeData.Value;

					returnData.push({
						name: errorTypeName,
						value: errorTypeValue,
					});
				}

				returnData.sort((a, b) => {
					if (a.name < b.name) {
						return -1;
					}
					if (a.name > b.name) {
						return 1;
					}
					return 0;
				});

				return returnData;
			},
			async getDataQueries(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const responseData = await matrix42ApiRequest.call(
					this,
					'GET',
					'/data/fragments/PDRDataQueryClassBase',
					{},
					{
						columns: "Name, [Expression-ObjectID] as eoid",
					}
				);

				if (!Array.isArray(responseData)) {
					throw new NodeOperationError(this.getNode(), 'No data got returned');
				}

				const returnData: INodePropertyOptions[] = [];

				for (const dataQuery of responseData) {
					returnData.push({
						name: dataQuery.Name,
						value: dataQuery.eoid,
					});
				}

				returnData.sort((a, b) => {
					if (a.name < b.name) {
						return -1;
					}
					if (a.name > b.name) {
						return 1;
					}
					return 0;
				});

				return returnData;
			},
			async getImportDefinitions(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const responseData = await matrix42ApiRequest.call(
					this,
					'GET',
					'/data/fragments/GDIEImportClassBase',
					{},
					{
						columns: "ID, Name, [Expression-ObjectID] as eoid",
					}
				);

				if (!Array.isArray(responseData)) {
					throw new NodeOperationError(this.getNode(), 'No data got returned');
				}

				const returnData: INodePropertyOptions[] = [];

				for (const importDefinitionsData of responseData) {
					const importDefinitionName = importDefinitionsData.Name;
					const importDefinitionValue = importDefinitionsData.eoid;

					returnData.push({
						name: importDefinitionName,
						value: importDefinitionValue,
					});
				}

				returnData.sort((a, b) => {
					if (a.name < b.name) {
						return -1;
					}
					if (a.name > b.name) {
						return 1;
					}
					return 0;
				});

				return returnData;
			},
			async getStorageProviders(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const responseData = await matrix42ApiRequest.call(
					this,
					'GET',
					'/data/fragments/DWPFileStorageAccountClass',
					{},
					{
						columns: "ID, Name, [Expression-ObjectID] as eoid",
					}
				);

				if (!Array.isArray(responseData)) {
					throw new NodeOperationError(this.getNode(), 'No data got returned');
				}

				const returnData: INodePropertyOptions[] = [];

				for (const storageProviderData of responseData) {
					const storageProviderName = storageProviderData.Name;
					const storageProviderValue = storageProviderData.ID;

					returnData.push({
						name: storageProviderName,
						value: storageProviderValue,
					});
				}

				returnData.sort((a, b) => {
					if (a.name < b.name) {
						return -1;
					}
					if (a.name > b.name) {
						return 1;
					}
					return 0;
				});

				return returnData;
			},
			async getJournalEntryTypes(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const responseData = await matrix42ApiRequest.call(
					this,
					'GET',
					'/data/fragments/SPSJournalEntryPickupType',
					{},
					{
						columns: "Value, DisplayString",
					}
				);

				if (!Array.isArray(responseData)) {
					throw new NodeOperationError(this.getNode(), 'No data got returned');
				}

				const returnData: INodePropertyOptions[] = [];

				for (const journalEntryType of responseData) {
					const name = journalEntryType.DisplayString;
					const value = journalEntryType.Value;

					returnData.push({
						name: name,
						value: value,
					});
				}

				returnData.sort((a, b) => {
					if (a.name < b.name) {
						return -1;
					}
					if (a.name > b.name) {
						return 1;
					}
					return 0;
				});

				const defaultEntry = { name: 'None (Default)', value: 0 };
				returnData.unshift(defaultEntry)

				return returnData;
			},
		}
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();

		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;

		const handlers: Record<string, Record<string, (i: number) => Promise<IDataObject[]>>> = {
			dataFragment: {
				getAll: getFragments,
				create: addFragment,
				update: updateFragment,
				delete: deleteFragment,
			},
			dataObject: {
				create: addObject,
				get: getObject,
				update: updateObject,
				delete: deleteObject,
			},
			ticket: {
				create: createTicket,
				close: closeTicket,
				transform: transformTicket,
				addJournalEntry,
			},
			dataQuery: {
				getData,
			},
			import: {
				execute: executeImportDefinition,
			},
			storage: {
				upload: uploadFileToCI,
			},
		};

		const handler = handlers[resource]?.[operation];
		if (!handler) {
			throw new NodeOperationError(
				this.getNode(),
				`The operation "${operation}" is not supported for resource "${resource}"`,
			);
		}

		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const responseData = await handler.call(this, i);

				const executionData = this.helpers.constructExecutionMetaData(
					this.helpers.returnJsonArray(responseData),
					{ itemData: { item: i } },
				);

				returnData.push(...executionData);
			} catch (error) {
				if (this.continueOnFail()) {
					const exectionErrorWithMetaData = this.helpers.constructExecutionMetaData(
						[{ json: { error: error.message } }],
						{ itemData: { item: i } },
					);
					returnData.push(...exectionErrorWithMetaData);
					continue;
				}

				throw new NodeApiError(this.getNode(), error as JsonObject);
			}
		}

		return [returnData];
	}
}
