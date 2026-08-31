import type {
	ILoadOptionsFunctions,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	IPollFunctions,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';
import {
	listDataDefinitionOptions,
	listObjectTypeOptions,
	pollMatrix42,
	TICKET_DATA_DEFINITION,
} from './Matrix42TriggerFunctions';

export class Matrix42Trigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Matrix42 Trigger',
		name: 'matrix42Trigger',
		icon: { light: 'file:matrix42.svg', dark: 'file:matrix42.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle:
			'={{$parameter["event"] === "ticketCreated" ? "on ticket created" : ($parameter["event"] === "objectCreated" ? "created" : "created/updated") + ": " + $parameter["dataDefinition"]}}',
		description: 'Starts the workflow when objects are created or updated in Matrix42',
		defaults: {
			name: 'Matrix42 Trigger',
		},
		polling: true,
		inputs: [],
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
		properties: [
			{
				displayName:
					'This trigger polls Matrix42 on the schedule set under Poll Times (while the workflow is active) and fires for records that appeared since the last check. The "Fetch Test Event" button does not wait for new records — it just returns the newest matching record as a sample, without changing the trigger\'s state.',
				name: 'notice',
				type: 'notice',
				default: '',
			},
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
				displayName: 'Event',
				name: 'event',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Object Created',
						value: 'objectCreated',
						description:
							'Fire once for every new object of any data definition, watched through a creation-date attribute',
					},
					{
						name: 'Object Created or Updated',
						value: 'objectCreatedOrUpdated',
						description:
							'Fire for new and changed objects, watched through the universal TimeStamp rowversion',
					},
					{
						name: 'Ticket Created',
						value: 'ticketCreated',
						description: 'Fire once for every new Service Desk ticket',
					},
				],
				default: 'ticketCreated',
			},
			{
				displayName: 'Data Definition Name or ID',
				name: 'dataDefinition',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getDataDefinitions',
				},
				default: 'SPSActivityClassBase',
				required: true,
				description:
					'The data definition (class) whose records are watched. The default SPSActivityClassBase covers all Service Desk tickets. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				displayOptions: {
					show: {
						event: ['objectCreated', 'objectCreatedOrUpdated'],
					},
				},
			},
			{
				displayName: 'Type Filter Names or IDs',
				name: 'typeFilter',
				type: 'multiOptions',
				typeOptions: {
					loadOptionsMethod: 'getObjectTypes',
					loadOptionsDependsOn: ['dataDefinition'],
				},
				default: [],
				description:
					'Only fire for objects of these configuration-item types (e.g. only Incidents). Empty means all types. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Created-Date Attribute',
				name: 'createdDateAttribute',
				type: 'string',
				default: 'CreatedDate',
				required: true,
				description:
					'Attribute of the data definition that holds the creation date. Not every class has one — when the class lacks it (e.g. SPSComputerClassBase), the poll fails with "does not contain attribute"; use the Object Created or Updated event instead, which works on every class.',
				displayOptions: {
					show: {
						event: ['objectCreated'],
					},
				},
			},
			{
				displayName: 'Additional Fields',
				name: 'additionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				options: [
					{
						displayName: 'Extra Columns',
						name: 'columns',
						type: 'string',
						default: '',
						placeholder: 'e.g. TicketNumber, Subject',
						description:
							'Comma-separated list of additional attributes to include in the output. The fragment ID, the object ID and the watermark attribute are always included.',
					},
					{
						displayName: 'Fetch Full Object',
						name: 'fetchFullObject',
						type: 'boolean',
						default: false,
						description:
							'Whether to fetch the complete object (all fragments) for every result and attach it as "Object". Costs one extra request per result.',
					},
					{
						displayName: 'Filter (ASQL)',
						name: 'asqlFilter',
						type: 'string',
						default: '',
						placeholder: "e.g. State = 204 AND Subject LIKE '%printer%'",
						description:
							'ASQL condition combined (AND) with the watermark condition, evaluated server-side',
					},
					{
						displayName: 'Limit',
						name: 'limit',
						type: 'number',
						typeOptions: {
							minValue: 1,
						},
						default: 50,
						description: 'Max number of results to return',
						hint: 'Values above 1000 are capped at 1000',
					},
				],
			},
		],
	};

	methods = {
		loadOptions: {
			async getDataDefinitions(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return await listDataDefinitionOptions.call(this);
			},

			async getObjectTypes(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				// The Ticket Created preset always watches the ticket class, even when a
				// previously chosen data definition is still stored on the node.
				const event = this.getNodeParameter('event', '') as string;
				const dataDefinition =
					event === 'ticketCreated'
						? TICKET_DATA_DEFINITION
						: (this.getNodeParameter('dataDefinition', '') as string);
				return await listObjectTypeOptions.call(this, dataDefinition);
			},
		},
	};

	async poll(this: IPollFunctions) {
		return await pollMatrix42.call(this);
	}
}
