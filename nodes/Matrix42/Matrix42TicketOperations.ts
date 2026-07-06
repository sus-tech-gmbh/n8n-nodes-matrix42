import type { INodeProperties } from 'n8n-workflow';

export const matrix42TicketOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['ticket'],
			},
		},
		options: [
			{
				name: 'Add Journal Entry',
				value: 'addJournalEntry',
				description: 'Add a journal entry to a ticket',
				action: 'Add a journal entry',
			},
			{
				name: 'Close',
				value: 'close',
				description: 'Close a ticket',
				action: 'Close a ticket',
			},
			{
				name: 'Create',
				value: 'create',
				description: 'Create a ticket',
				action: 'Create a ticket',
			},
			{
				name: 'Transform',
				value: 'transform',
				description: 'Transform a ticket into another type',
				action: 'Transform a ticket',
			},
		],
		default: 'create',
	},
];

const createTicketOperation: INodeProperties[] = [
	{
		displayName: 'Ticket Type',
		name: 'ticketType',
		type: 'options',
		// eslint-disable-next-line n8n-nodes-base/node-param-options-type-unsorted-items
		options: [
			{
				name: 'Ticket',
				value: 5,
			},
			{
				name: 'Service Request',
				value: 6,
			},
			{
				name: 'Incident',
				value: 0,
			},
		],
		default: 5,
		description: 'The type of the ticket',
		displayOptions: {
			show: {
				resource: ['ticket'],
				operation: ['create'],
			},
		},
		required: true,
	},
	{
		displayName: 'Category Name or ID',
		name: 'category',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'getTicketCategories',
		},
		default: '',
		description:
			'The category of the ticket. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: {
			show: {
				resource: ['ticket'],
				operation: ['create'],
			},
		},
		required: true,
	},
	{
		displayName: 'Subject',
		name: 'subject',
		type: 'string',
		default: '',
		description: 'The subject of the ticket',
		displayOptions: {
			show: {
				resource: ['ticket'],
				operation: ['create'],
			},
		},
		required: true,
	},
	{
		displayName: 'Description',
		name: 'descriptionHTML',
		type: 'string',
		typeOptions: {
			editor: 'htmlEditor',
		},
		default: '',
		description: 'The description of the ticket, as HTML',
		displayOptions: {
			show: {
				resource: ['ticket'],
				operation: ['create'],
			},
		},
		required: true,
	},
	{
		displayName: 'Impact Name or ID',
		name: 'impact',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'getTicketImpacts',
		},
		default: '',
		description:
			'The impact of the ticket. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: {
			show: {
				resource: ['ticket'],
				operation: ['create'],
			},
		},
		required: true,
	},
	{
		displayName: 'Urgency Name or ID',
		name: 'urgency',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'getTicketUrgencies',
		},
		default: '',
		description:
			'The urgency of the ticket. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: {
			show: {
				resource: ['ticket'],
				operation: ['create'],
			},
		},
		required: true,
	},
	{
		displayName: 'Priority',
		name: 'priority',
		type: 'options',
		// eslint-disable-next-line n8n-nodes-base/node-param-options-type-unsorted-items
		options: [
			{
				name: 'Auto',
				value: -1,
				description: 'Calculate the priority from impact and urgency',
			},
			{
				name: 'Without',
				value: 0,
			},
			{
				name: 'Low',
				value: 1,
			},
			{
				name: 'Medium',
				value: 2,
			},
			{
				name: 'High',
				value: 3,
			},
		],
		default: -1,
		description: 'The priority of the ticket. It can be calculated automatically from the urgency and impact.',
		displayOptions: {
			show: {
				resource: ['ticket'],
				operation: ['create'],
			},
		},
		required: true,
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: {
			show: {
				resource: ['ticket'],
				operation: ['create'],
			},
		},
		options: [
			{
				displayName: 'Creator Name or ID',
				name: 'creator',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getUsers',
				},
				default: '',
				description:
					'The creator of the ticket. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Initiator Name or ID',
				name: 'user',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getUsers',
				},
				default: '',
				description:
					'The initiator of the ticket. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Responsible Role Name or ID',
				name: 'responsibleRole',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getTicketRoles',
					loadOptionsDependsOn: ['category'],
				},
				default: '',
				description:
					'The responsible role of the ticket. Leave empty to use the category default. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Responsible User Name or ID',
				name: 'responsibleUser',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getUsers',
				},
				default: '',
				description:
					'The responsible user of the ticket. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'SLA Name or ID',
				name: 'sla',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getTicketSlas',
				},
				default: '',
				description:
					'The SLA of the ticket. Leave empty to use the category default. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
		],
	},
];

const closeTicketOperation: INodeProperties[] = [
	{
		displayName: 'Ticket ID',
		name: 'ticketEoid',
		type: 'string',
		default: '',
		description: 'The Expression-ObjectID of the ticket, service request or incident to close',
		displayOptions: {
			show: {
				resource: ['ticket'],
				operation: ['close'],
			},
		},
		required: true,
	},
	{
		displayName: 'Close Related Incidents',
		name: 'closeRelatedIncidents',
		type: 'boolean',
		default: false,
		description: 'Whether related incidents will be automatically closed',
		displayOptions: {
			show: {
				resource: ['ticket'],
				operation: ['close'],
			},
		},
	},
	{
		displayName: 'Close Reason Name or ID',
		name: 'reason',
		type: 'options',
		options: [
			{
				name: 'Directly Solved',
				value: 408,
			},
		],
		typeOptions: {
			loadOptionsMethod: 'getTicketCloseReasons',
		},
		default: 408,
		description:
			'The closing reason for the ticket. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: {
			show: {
				resource: ['ticket'],
				operation: ['close'],
			},
		},
		required: true,
	},
	{
		displayName: 'Error Type Name or ID',
		name: 'errorType',
		type: 'options',
		options: [
			{
				name: 'Unknown',
				value: 0,
			},
		],
		typeOptions: {
			loadOptionsMethod: 'getTicketCloseErrorTypes',
		},
		default: 0,
		description:
			'The error type for the ticket. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: {
			show: {
				resource: ['ticket'],
				operation: ['close'],
			},
		},
		required: true,
	},
	{
		displayName: 'Solution',
		name: 'comments',
		type: 'string',
		typeOptions: {
			editor: 'htmlEditor',
		},
		default: '',
		description: 'The solution for closing the ticket, as HTML',
		displayOptions: {
			show: {
				resource: ['ticket'],
				operation: ['close'],
			},
		},
		required: true,
	},
	{
		displayName: 'Services Availability',
		name: 'servicesAvailability',
		type: 'options',
		// eslint-disable-next-line n8n-nodes-base/node-param-options-type-unsorted-items
		options: [
			{
				name: 'Unknown',
				value: 0,
			},
			{
				name: 'Available',
				value: 10,
			},
			{
				name: 'Partial Available',
				value: 20,
			},
			{
				name: 'Unavailable (Planned)',
				value: 30,
			},
			{
				name: 'Unavailable (Unplanned)',
				value: 40,
			},
		],
		default: 10,
		description: 'The affected service availability while the ticket was being processed',
		displayOptions: {
			show: {
				resource: ['ticket'],
				operation: ['close'],
			},
		},
	},
	{
		displayName: 'Assets Availability',
		name: 'assetsAvailability',
		type: 'options',
		// eslint-disable-next-line n8n-nodes-base/node-param-options-type-unsorted-items
		options: [
			{
				name: 'Unknown',
				value: 0,
			},
			{
				name: 'Available',
				value: 10,
			},
			{
				name: 'Partial Available',
				value: 20,
			},
			{
				name: 'Unavailable (Planned)',
				value: 30,
			},
			{
				name: 'Unavailable (Unplanned)',
				value: 40,
			},
		],
		default: 10,
		description: 'The affected asset availability while the ticket was being processed',
		displayOptions: {
			show: {
				resource: ['ticket'],
				operation: ['close'],
			},
		},
	},
	{
		displayName: 'Send Mail to Initiator',
		name: 'sendMailToInitiator',
		type: 'boolean',
		default: true,
		description: 'Whether the notification mail will be sent to the initiator',
		displayOptions: {
			show: {
				resource: ['ticket'],
				operation: ['close'],
			},
		},
	},
	{
		displayName: 'Notify Responsible',
		name: 'notifyResponsible',
		type: 'boolean',
		default: true,
		description: 'Whether the notification mail will be sent to the responsible',
		displayOptions: {
			show: {
				resource: ['ticket'],
				operation: ['close'],
			},
		},
	},
	{
		displayName: 'Send Mail to Users',
		name: 'sendMailToUsers',
		type: 'boolean',
		default: true,
		description: 'Whether the notification mail will be sent to the users attached to the ticket',
		displayOptions: {
			show: {
				resource: ['ticket'],
				operation: ['close'],
			},
		},
	},
	{
		displayName: 'Send Mail to Related Responsible Users',
		name: 'sendMailToRelatedResponsibleUsers',
		type: 'boolean',
		default: true,
		description: 'Whether the notification mail will be sent to the responsible users of related tickets',
		displayOptions: {
			show: {
				resource: ['ticket'],
				operation: ['close'],
			},
		},
	},
];

const transformTicketOperation: INodeProperties[] = [
	{
		displayName: 'Ticket ID',
		name: 'ticketEoid',
		type: 'string',
		default: '',
		description: 'The Expression-ObjectID of the ticket, service request or incident to transform',
		displayOptions: {
			show: {
				resource: ['ticket'],
				operation: ['transform'],
			},
		},
		required: true,
	},
	{
		displayName: 'Source Type',
		name: 'sourceTypeName',
		type: 'options',
		options: [
			{
				name: 'Incident',
				value: 'SPSActivityTypeIncident',
			},
			{
				name: 'Service Request',
				value: 'SPSActivityTypeServiceRequest',
			},
			{
				name: 'Ticket',
				value: 'SPSActivityTypeTicket',
			},
		],
		default: 'SPSActivityTypeTicket',
		description: 'The current type of the ticket',
		displayOptions: {
			show: {
				resource: ['ticket'],
				operation: ['transform'],
			},
		},
		required: true,
	},
	{
		displayName: 'Target Type',
		name: 'targetTypeName',
		type: 'options',
		options: [
			{
				name: 'Incident',
				value: 'SPSActivityTypeIncident',
			},
			{
				name: 'Service Request',
				value: 'SPSActivityTypeServiceRequest',
			},
		],
		default: 'SPSActivityTypeServiceRequest',
		description: 'The type the ticket will be transformed to',
		displayOptions: {
			show: {
				resource: ['ticket'],
				operation: ['transform'],
			},
		},
		required: true,
	},
	{
		displayName: 'Category Name or ID',
		name: 'category',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'getTicketCategories',
		},
		default: '',
		description:
			'The category of the ticket. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: {
			show: {
				resource: ['ticket'],
				operation: ['transform'],
			},
		},
		required: true,
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: {
			show: {
				resource: ['ticket'],
				operation: ['transform'],
			},
		},
		options: [
			{
				displayName: 'OLA Name or ID',
				name: 'ola',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getTicketOlas',
				},
				default: '',
				description:
					'The OLA of the ticket. Leave empty to keep it unchanged. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Recipient Role Name or ID',
				name: 'recipientRole',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getTicketRoles',
					loadOptionsDependsOn: ['category'],
				},
				default: '',
				description:
					'The recipient role of the ticket. Leave empty to keep it unchanged. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'SLA Name or ID',
				name: 'sla',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getTicketSlas',
				},
				default: '',
				description:
					'The SLA of the ticket. Leave empty to keep it unchanged. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
		],
	},
];

const addJournalEntryOperation: INodeProperties[] = [
	{
		displayName: 'Ticket ID',
		name: 'ticketEoid',
		type: 'string',
		default: '',
		description: 'The Expression-ObjectID of the ticket, service request or incident',
		displayOptions: {
			show: {
				resource: ['ticket'],
				operation: ['addJournalEntry'],
			},
		},
		required: true,
	},
	{
		displayName: 'Comments',
		name: 'comments',
		type: 'string',
		default: '',
		description: 'The content of the journal entry',
		displayOptions: {
			show: {
				resource: ['ticket'],
				operation: ['addJournalEntry'],
			},
		},
		required: true,
	},
	{
		displayName: 'Type Name or ID',
		name: 'entryType',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'getJournalEntryTypes',
		},
		default: '',
		description:
			'The type of the journal entry. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: {
			show: {
				resource: ['ticket'],
				operation: ['addJournalEntry'],
			},
		},
		required: true,
	},
	{
		displayName: 'Creator Name or ID',
		name: 'creator',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'getUsers',
		},
		default: '',
		description:
			'The creator of the journal entry. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: {
			show: {
				resource: ['ticket'],
				operation: ['addJournalEntry'],
			},
		},
		required: true,
	},
	{
		displayName: 'Visible in Portal',
		name: 'visibleInPortal',
		type: 'boolean',
		default: false,
		description: 'Whether the journal entry should be visible in the portal',
		displayOptions: {
			show: {
				resource: ['ticket'],
				operation: ['addJournalEntry'],
			},
		},
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: {
			show: {
				resource: ['ticket'],
				operation: ['addJournalEntry'],
			},
		},
		options: [
			{
				displayName: 'File IDs',
				name: 'fileIds',
				type: 'json',
				default: '[]',
				description: 'JSON array of file IDs to attach to the journal entry',
			},
			{
				displayName: 'Is From Edit Dialog',
				name: 'isFromEditDialog',
				type: 'boolean',
				default: false,
				description: 'Whether the entry originates from an edit dialog',
			},
			{
				displayName: 'Parameters',
				name: 'parameters',
				type: 'json',
				default: '[]',
				description: 'JSON array of additional parameters for the journal entry',
			},
			{
				displayName: 'Publish',
				name: 'publish',
				type: 'boolean',
				default: true,
				description: 'Whether to publish the journal entry',
			},
			{
				displayName: 'Type ID',
				name: 'typeId',
				type: 'string',
				default: '',
				description: 'The Expression-ObjectID of the journal entry type',
			},
		],
	},
];

export const matrix42TicketFields: INodeProperties[] = [
	...createTicketOperation,
	...closeTicketOperation,
	...transformTicketOperation,
	...addJournalEntryOperation,
];
