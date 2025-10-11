import {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	JsonObject,
	NodeApiError,
} from 'n8n-workflow';
import { NodeConnectionType } from 'n8n-workflow';
import { matrix42ImportFields, matrix42ImportOperations } from './Matrix42ImportOperations';
import { matrix42AsqlFields, matrix42AsqlOperations } from './Matrix42AsqlOperations';
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
} from './Matrix42AsqlFunctions';
import { matrix42ApiRequest } from './GenericFunctions';
import {closeTicket, createTicket, transformTicket} from "./Matrix42TicketFunctions";
import {executeImportDefinition} from "./Matrix42ImportFunctions";
import {matrix42StorageFields, matrix42StorageOperations} from "./Matrix42StorageOperations";
import {uploadFileToCI} from "./Matrix42StorageFunctions";

export class Matrix42 implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Matrix42',
		name: 'matrix42',
		icon: { light: 'file:matrix42.svg', dark: 'file:matrix42.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Interact with Matrix42.',
		defaults: {
			name: 'Matrix42',
		},
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
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
						name: 'ASQL',
						value: 'asql',
					},
					{
						name: 'Import',
						value: 'import',
					},
					{
						name: 'Ticket',
						value: 'ticket',
					},
					{
						name: 'Storage',
						value: 'storage',
					},
				],
				default: 'ticket',
			},

			// Asql
			...matrix42AsqlOperations,
			...matrix42AsqlFields,

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
					}
				);

				if (responseData === undefined) {
					throw new NodeApiError(this.getNode(), responseData as JsonObject, {
						message:  'No data got returned',
					});
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

				const emptyUser = { name: 'None (Check Description)', value: '00000000-0000-0000-0000-000000000000' };
				returnData.unshift(emptyUser)

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

				if (responseData === undefined) {
					throw new NodeApiError(this.getNode(), responseData as JsonObject, {
						message:  'No data got returned',
					});
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

				if (responseData === undefined) {
					throw new NodeApiError(this.getNode(), responseData as JsonObject, {
						message:  'No data got returned',
					});
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

				if (responseData === undefined) {
					throw new NodeApiError(this.getNode(), responseData as JsonObject, {
						message:  'No data got returned',
					});
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
				const categoryId = this.getNodeParameter('category') as string;

				if (!categoryId) {
					throw new NodeApiError(this.getNode(), {categoryId}, {
						message:  'No category selected',
					});
				}

				const responseData = await matrix42ApiRequest.call(
					this,
					'GET',
					'/data/fragments/SPSScRoleClassBase',
					{},
					{
						columns: "T(SPSSecurityClassRole).Name as Name, ID, [Expression-ObjectID]",
					}
				);

				if (responseData === undefined) {
					throw new NodeApiError(this.getNode(), responseData as JsonObject, {
						message:  'No data got returned',
					});
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

				const responseDataCategory = await matrix42ApiRequest.call(
					this,
					'GET',
					'/data/fragments/SPSScCategoryClassBase',
					{},
					{
						where: `ID = '${categoryId}' AND Hidden = 0`,
						columns: "ID, Parent, Name, DefaultRecipientRole",
					}
				);

				let defaultOption: INodePropertyOptions | undefined;
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

				returnData.sort((a, b) => a.name.localeCompare(b.name));

				if (defaultOption) {
					returnData.unshift(defaultOption);
				}

				const emptyRole = { name: 'None (Check Description)', value: '00000000-0000-0000-0000-000000000000' };
				returnData.unshift(emptyRole)

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

				if (responseData === undefined) {
					throw new NodeApiError(this.getNode(), responseData as JsonObject, {
						message:  'No data got returned',
					});
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

				const defaultSla = { name: 'None (Check Description)', value: '00000000-0000-0000-0000-000000000000' };
				returnData.unshift(defaultSla)

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

				if (responseData === undefined) {
					throw new NodeApiError(this.getNode(), responseData as JsonObject, {
						message:  'No data got returned',
					});
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

				const defaultOla = { name: 'None (Check Description)', value: '00000000-0000-0000-0000-000000000000' };
				returnData.unshift(defaultOla)

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

				if (responseData === undefined) {
					throw new NodeApiError(this.getNode(), responseData as JsonObject, {
						message:  'No data got returned',
					});
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

				if (responseData === undefined) {
					throw new NodeApiError(this.getNode(), responseData as JsonObject, {
						message:  'No data got returned',
					});
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

				if (responseData === undefined) {
					throw new NodeApiError(this.getNode(), responseData as JsonObject, {
						message:  'No data got returned',
					});
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

				if (responseData === undefined) {
					throw new NodeApiError(this.getNode(), responseData as JsonObject, {
						message:  'No data got returned',
					});
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
			}
		}
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();

		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;

		const returnData: INodeExecutionData[] = [];
		let responseData: IDataObject[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				if (resource === 'asql') {
					if (operation === 'getFragments') {
						// ----------------------------------
						// asql:getFragments
						// ----------------------------------
						responseData = await getFragments.call(this, i);
					} else if (operation === 'addFragment') {
						// ----------------------------------
						// asql:addFragment
						// ----------------------------------
						responseData = await addFragment.call(this, i);
					} else if (operation === 'updateFragment') {
						// ----------------------------------
						// asql:updateFragment
						// ----------------------------------
						responseData = await updateFragment.call(this, i);
					} else if (operation === 'deleteFragment') {
						// ----------------------------------
						// asql:deleteFragment
						// ----------------------------------
						responseData = await deleteFragment.call(this, i);
					} else if (operation === 'addObject') {
						// ----------------------------------
						// asql:addObject
						// ----------------------------------
						responseData = await addObject.call(this, i);
					} else if (operation === 'getObject') {
						// ----------------------------------
						// asql:getObject
						// ----------------------------------
						responseData = await getObject.call(this, i);
					} else if (operation === 'updateObject') {
						// ----------------------------------
						// asql:updateObject
						// ----------------------------------
						responseData = await updateObject.call(this, i);
					} else if (operation === 'deleteObject') {
						// ----------------------------------
						// asql:deleteObject
						// ----------------------------------
						responseData = await deleteObject.call(this, i);
					}
				}

				if (resource === 'ticket') {
					if (operation === 'createTicket') {
						// ----------------------------------
						// ticket:createTicket
						// ----------------------------------
						responseData = await createTicket.call(this, i);
					} else if (operation === 'closeTicket') {
						// ----------------------------------
						// ticket:closeTicket
						// ----------------------------------
						responseData = await closeTicket.call(this, i);
					} else if (operation === 'transformTicket') {
						// ----------------------------------
						// ticket:transformTicket
						// ----------------------------------
						responseData = await transformTicket.call(this, i);
					}
				}

				if (resource === 'import') {
					if (operation === 'executeImportDefinition') {
						// ----------------------------------
						// import:executeImportDefinition
						// ----------------------------------
						responseData = await executeImportDefinition.call(this, i);
					}
				}

				if (resource === 'storage') {
					if (operation === 'uploadFile') {
						// ----------------------------------
						// storage:uploadFile
						// ----------------------------------
						responseData = await uploadFileToCI.call(this, i);
					}
				}

				const executionData = this.helpers.constructExecutionMetaData(
					this.helpers.returnJsonArray(responseData as IDataObject[]),
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

				throw error;
			}
		}

		return [returnData];
	}
}
