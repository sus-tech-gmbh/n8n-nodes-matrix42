import {INodeProperties} from "n8n-workflow";

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
		// eslint-disable-next-line n8n-nodes-base/node-param-options-type-unsorted-items
		options: [
			{
				name: 'Create Ticket',
				value: 'createTicket',
				description: 'Create a ticket',
				action: 'Create a ticket',
			},
			{
				name: 'Close Ticket',
				value: 'closeTicket',
				description: 'Close a ticket',
				action: 'Close ticket',
			},
			{
				name: 'Transform Ticket',
				value: 'transformTicket',
				description: 'Transform a ticket',
				action: 'Transform a ticket',
			},
			{
				name: 'Add Journal Entry',
				value: 'addJournalEntry',
				description: 'Add a journal entry',
				action: 'Add a journal entry',
			}
		],
		default: 'createTicket',
	},
];

const createTicketOperation: INodeProperties[] = [
	{
		displayName: 'Ticket Type',
		name: 'ticketType',
		type: 'options',
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
			}
		],
		default: 5,
		description: 'The type of the Ticket',
		displayOptions: {
			show: {
				operation: ['createTicket']
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
		description: 'The Category of the Ticket. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: {
			show: {
				operation: ['createTicket']
			},
		},
		required: true,
	},
	{
		displayName: 'Subject',
		name: 'subject',
		type: 'string',
		default: '',
		description: 'The Subject of the Ticket',
		displayOptions: {
			show: {
				operation: ['createTicket']
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
		description: 'The Description of the Ticket (HTML)',
		displayOptions: {
			show: {
				operation: ['createTicket']
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
		description: 'The Impact of the Ticket. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: {
			show: {
				operation: ['createTicket']
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
		description: 'The Urgency of the Ticket. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: {
			show: {
				operation: ['createTicket']
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
				description: 'Calculate Priority'
			},
			{
				name: 'Without',
				value: 0,
				description: 'Without Priority'
			},
			{
				name: 'Low',
				value: 1,
				description: 'Low Priority'
			},
			{
				name: 'Medium',
				value: 2,
				description: 'Medium Priority'
			},
			{
				name: 'High',
				value: 3,
				description: 'High Priority'
			},
		],
		default: -1,
		description: 'The Priority of the Ticket. It can be automatically calculated based on the urgency and impact.',
		displayOptions: {
			show: {
				operation: ['createTicket']
			},
		},
		required: true,
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
		description: 'The Responsible Role of the Ticket. If "None" is selected, the Category default will be used. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: {
			show: {
				operation: ['createTicket']
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
		description: 'The Creator of the Ticket. If "None" is selected, it will be left blank. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: {
			show: {
				operation: ['createTicket']
			},
		},
		required: true,
	},
	{
		displayName: 'Initiator Name or ID',
		name: 'user',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'getUsers',
		},
		default: '',
		description: 'The Initiator of the Ticket. If "None" is selected, it will be left blank. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: {
			show: {
				operation: ['createTicket']
			},
		},
		required: true,
	},
	{
		displayName: 'Responsible User Name or ID',
		name: 'responsibleUser',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'getUsers',
		},
		default: '',
		description: 'The Responsible User of the Ticket. If "None" is selected, it will be left blank. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: {
			show: {
				operation: ['createTicket']
			},
		},
		required: true,
	},
	{
		displayName: 'SLA Name or ID',
		name: 'sla',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'getTicketSlas',
		},
		default: '',
		description: 'The SLA of the Ticket. If "None" is selected, the Category default will be used. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: {
			show: {
				operation: ['createTicket']
			},
		},
		required: true,
	},
];

const closeTicketOperation: INodeProperties[] = [
	{
		displayName: 'Ticket EOID',
		name: 'ticketEoid',
		type: 'string',
		default: '',
		description: 'The Expression-ObjectID of the Ticket/Service Request/Incident',
		displayOptions: {
			show: {
				operation: ['closeTicket']
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
				operation: ['closeTicket']
			},
		},
		required: true,
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
		description: 'Closing reason for the Ticket. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: {
			show: {
				operation: ['closeTicket']
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
		description: 'Error Type for the Ticket. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: {
			show: {
				operation: ['closeTicket']
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
		description: 'Solution for Closing Ticket in HTML',
		displayOptions: {
			show: {
				operation: ['closeTicket']
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
		description: 'Set the affected Service Availability while ticket been processed',
		displayOptions: {
			show: {
				operation: ['closeTicket']
			},
		},
		required: true,
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
				description: 'Calculate Priority'
			},
			{
				name: 'Available',
				value: 10,
				description: 'Without Priority'
			},
			{
				name: 'Partial Available',
				value: 20,
				description: 'Low Priority'
			},
			{
				name: 'Unavailable(Planned)',
				value: 30,
				description: 'Medium Priority'
			},
			{
				name: 'Unavailable(Unplanned)',
				value: 40,
				description: 'High Priority'
			},
		],
		default: 10,
		description: 'Set the affected Service Availability while ticket been processed',
		displayOptions: {
			show: {
				operation: ['closeTicket']
			},
		},
		required: true,
	},
	{
		displayName: 'Send Mail To Initiator',
		name: 'sendMailToInitiator',
		type: 'boolean',
		default: true,
		description: 'Whether the notification mail will be sent to the initiator',
		displayOptions: {
			show: {
				operation: ['closeTicket']
			},
		},
		required: true,
	},
	{
		displayName: 'Notify Responsible',
		name: 'notifyResponsible',
		type: 'boolean',
		default: true,
		description: 'Whether the notification mail will be sent to the responsible',
		displayOptions: {
			show: {
				operation: ['closeTicket']
			},
		},
		required: true,
	},
	{
		displayName: 'Send Mail To Users',
		name: 'sendMailToUsers',
		type: 'boolean',
		default: true,
		description: 'Whether the notification mail will be sent to the Ticket attached users',
		displayOptions: {
			show: {
				operation: ['closeTicket']
			},
		},
		required: true,
	},
	{
		displayName: 'Send Mail To Related Responsible Users',
		name: 'sendMailToRelatedResponsibleUsers',
		type: 'boolean',
		default: true,
		description: 'Whether the notification mail will be sent to the related tickets responsible users',
		displayOptions: {
			show: {
				operation: ['closeTicket']
			},
		},
		required: true,
	},
];

const transformTicketOperation: INodeProperties[] = [
	{
		displayName: 'Ticket EOID',
		name: 'ticketEoid',
		type: 'string',
		default: '',
		description: 'The Expression-ObjectID of the Ticket/Service Request/Incident',
		displayOptions: {
			show: {
				operation: ['transformTicket']
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
				name: 'Ticket',
				value: "SPSActivityTypeTicket",
			},
			{
				name: 'Service Request',
				value: "SPSActivityTypeServiceRequest",
			},
			{
				name: 'Incident',
				value: "SPSActivityTypeIncident",
			}
		],
		default: 'SPSActivityTypeTicket',
		description: 'The Source Type of the Activity (what type is the activity)',
		displayOptions: {
			show: {
				operation: ['transformTicket']
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
				name: 'Service Request',
				value: "SPSActivityTypeServiceRequest",
			},
			{
				name: 'Incident',
				value: "SPSActivityTypeIncident",
			}
		],
		default: 'SPSActivityTypeServiceRequest',
		description: 'The Target Type of the Activity (what will the activity be transformed to)',
		displayOptions: {
			show: {
				operation: ['transformTicket']
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
		description: 'The Category of the Ticket. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: {
			show: {
				operation: ['transformTicket']
			},
		},
		required: true,
	},
	{
		displayName: 'SLA Name or ID',
		name: 'sla',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'getTicketSlas',
		},
		default: '',
		description: 'The SLA of the Ticket. If "None" is selected, it will not be changed. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: {
			show: {
				operation: ['transformTicket']
			},
		},
		required: true,
	},
	{
		displayName: 'OLA Name or ID',
		name: 'ola',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'getTicketOlas',
		},
		default: '',
		description: 'The OLA of the Ticket. If "None" is selected, it will not be changed. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: {
			show: {
				operation: ['transformTicket']
			},
		},
		required: true,
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
		description: 'The Responsible Role of the Ticket. If "None" is selected, it will not be changed. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: {
			show: {
				operation: ['transformTicket']
			},
		},
		required: true,
	}
];

const addJournalEntryOperation: INodeProperties[] = [
	{
		displayName: 'Ticket EOID',
		name: 'ticketEoid',
		type: 'string',
		default: '',
		description: 'The Expression-ObjectID of the Ticket/Service Request/Incident',
		displayOptions: {
			show: {
				operation: ['addJournalEntry']
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
				operation: ['addJournalEntry']
			},
		},
		required: true,
	},
	{
		displayName: 'Entry Type Name or ID',
		name: 'entryType',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'getJournalEntryTypes',
		},
		default: '',
		description: 'The Entry Type of the Journal Entry. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: {
			show: {
				operation: ['addJournalEntry']
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
		description: 'The Creator of the Journal Entry. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: {
			show: {
				operation: ['addJournalEntry']
			},
		},
		required: true,
	},
	{
		displayName: 'Visible in Portal',
		name: 'visibleInPortal',
		type: 'boolean',
		default: false,
		description: 'Whether the journal entry should be visible in portal',
		displayOptions: {
			show: {
				operation: ['addJournalEntry']
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
				operation: ['addJournalEntry'],
			},
		},
		// eslint-disable-next-line n8n-nodes-base/node-param-collection-type-unsorted-items
		options: [
			{
				displayName: 'Type ID',
				name: 'typeId',
				type: 'string',
				default: undefined,
			},
			{
				displayName: 'Publish',
				name: 'publish',
				type: 'boolean',
				default: true,
			},
			{
				displayName: 'File IDs',
				name: 'fileIds',
				type: 'json',
				default: undefined,
			},
			{
				displayName: 'Parameters',
				name: 'parameters',
				type: 'json',
				default: '[]',
			},
			{
				displayName: 'Is From Edit Dialog',
				name: 'isFormEditDialog',
				type: 'boolean',
				default: false,
			},
		],
	},
];

export const matrix42TicketFields: INodeProperties[] = [
	...closeTicketOperation,
	...createTicketOperation,
	...transformTicketOperation,
	...addJournalEntryOperation
];

