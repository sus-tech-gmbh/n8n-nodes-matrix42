import type { INodeProperties } from 'n8n-workflow';

export const matrix42DataOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['dataFragment'],
			},
		},
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Create a new data definition fragment',
				action: 'Create a fragment',
			},
			{
				name: 'Delete',
				value: 'delete',
				description: 'Delete a fragment by its data definition and fragment ID',
				action: 'Delete a fragment',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Retrieve fragments matching a search expression',
				action: 'Get many fragments',
			},
			{
				name: 'Update',
				value: 'update',
				description: 'Update an existing data definition fragment',
				action: 'Update a fragment',
			},
		],
		default: 'getAll',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['dataObject'],
			},
		},
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Create a new object for a configuration item',
				action: 'Create an object',
			},
			{
				name: 'Delete',
				value: 'delete',
				description: 'Delete an object by its configuration item and object ID',
				action: 'Delete an object',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Retrieve a single object by its ID',
				action: 'Get an object',
			},
			{
				name: 'Update',
				value: 'update',
				description: 'Update an existing object',
				action: 'Update an object',
			},
		],
		default: 'get',
	},
];

// ----------------------------------
// Data Fragment
// ----------------------------------
const getFragmentsOperation: INodeProperties[] = [
	{
		displayName: 'Data Definition',
		name: 'dataDefinition',
		type: 'string',
		default: '',
		placeholder: 'e.g. SPSActivityClassBase',
		description: 'Technical name of the data definition',
		displayOptions: {
			show: {
				resource: ['dataFragment'],
				operation: ['getAll'],
			},
		},
		required: true,
	},
	{
		displayName: 'Where',
		name: 'where',
		type: 'string',
		default: '',
		placeholder: "e.g. Name = 'Example'",
		description: 'An ASQL where expression to filter the result set',
		displayOptions: {
			show: {
				resource: ['dataFragment'],
				operation: ['getAll'],
			},
		},
	},
	{
		displayName: 'Columns',
		name: 'columns',
		type: 'string',
		default: '',
		placeholder: 'e.g. ID, Name, CreatedDate',
		description:
			'An ASQL column expression defining the columns of the result set, separated by commas. If no columns are defined, the operation returns only fragment IDs.',
		displayOptions: {
			show: {
				resource: ['dataFragment'],
				operation: ['getAll'],
			},
		},
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: {
			show: {
				resource: ['dataFragment'],
				operation: ['getAll'],
			},
		},
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		default: 50,
		description: 'Max number of results to return',
		typeOptions: {
			minValue: 1,
		},
		displayOptions: {
			show: {
				resource: ['dataFragment'],
				operation: ['getAll'],
				returnAll: [false],
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
				resource: ['dataFragment'],
				operation: ['getAll'],
			},
		},
		options: [
			{
				displayName: 'Sort',
				name: 'sort',
				type: 'string',
				default: '',
				placeholder: 'e.g. Name ASC, CreatedDate DESC',
				description: 'Defines the sorting of the result set',
			},
		],
	},
];

const addFragmentsOperation: INodeProperties[] = [
	{
		displayName: 'Data Definition',
		name: 'dataDefinition',
		type: 'string',
		default: '',
		placeholder: 'e.g. SPSActivityClassBase',
		description: 'Technical name of the data definition',
		displayOptions: {
			show: {
				resource: ['dataFragment'],
				operation: ['create'],
			},
		},
		required: true,
	},
	{
		displayName: 'Fragment Data',
		name: 'fragmentData',
		type: 'json',
		default: '',
		description: 'JSON object with the new fragment data',
		displayOptions: {
			show: {
				resource: ['dataFragment'],
				operation: ['create'],
			},
		},
		required: true,
	},
];

const updateFragmentsOperation: INodeProperties[] = [
	{
		displayName: 'Data Definition',
		name: 'dataDefinition',
		type: 'string',
		default: '',
		placeholder: 'e.g. SPSActivityClassBase',
		description: 'Technical name of the data definition',
		displayOptions: {
			show: {
				resource: ['dataFragment'],
				operation: ['update'],
			},
		},
		required: true,
	},
	{
		displayName: 'Fragment Data',
		name: 'fragmentData',
		type: 'json',
		default: '',
		description: 'JSON object with the fragment data to update. Must include the fragment ID.',
		displayOptions: {
			show: {
				resource: ['dataFragment'],
				operation: ['update'],
			},
		},
		required: true,
	},
];

const deleteFragmentsOperation: INodeProperties[] = [
	{
		displayName: 'Data Definition',
		name: 'dataDefinition',
		type: 'string',
		default: '',
		placeholder: 'e.g. SPSActivityClassBase',
		description: 'Technical name of the data definition',
		displayOptions: {
			show: {
				resource: ['dataFragment'],
				operation: ['delete'],
			},
		},
		required: true,
	},
	{
		displayName: 'Fragment ID',
		name: 'fragmentId',
		type: 'string',
		default: '',
		description: 'ID of the fragment to delete',
		displayOptions: {
			show: {
				resource: ['dataFragment'],
				operation: ['delete'],
			},
		},
		required: true,
	},
];

// ----------------------------------
// Data Object
// ----------------------------------
const addObjectOperation: INodeProperties[] = [
	{
		displayName: 'Configuration Item',
		name: 'configurationItem',
		type: 'string',
		default: '',
		placeholder: 'e.g. SPSActivityTypeIncident',
		description: 'Technical name of the configuration item',
		displayOptions: {
			show: {
				resource: ['dataObject'],
				operation: ['create'],
			},
		},
		required: true,
	},
	{
		displayName: 'Object Data',
		name: 'objectData',
		type: 'json',
		default: '',
		description: 'JSON object with all data required to create the object, in the same structure that Get returns',
		displayOptions: {
			show: {
				resource: ['dataObject'],
				operation: ['create'],
			},
		},
		required: true,
	},
];

const getObjectOperation: INodeProperties[] = [
	{
		displayName: 'Configuration Item',
		name: 'configurationItem',
		type: 'string',
		default: '',
		placeholder: 'e.g. SPSActivityTypeIncident',
		description: 'Technical name of the configuration item',
		displayOptions: {
			show: {
				resource: ['dataObject'],
				operation: ['get'],
			},
		},
		required: true,
	},
	{
		displayName: 'Object ID',
		name: 'objectId',
		type: 'string',
		default: '',
		description: 'The Expression-ObjectID of the object to retrieve',
		displayOptions: {
			show: {
				resource: ['dataObject'],
				operation: ['get'],
			},
		},
		required: true,
	},
	{
		displayName: 'Full',
		name: 'full',
		type: 'boolean',
		default: true,
		description: 'Whether to load the whole object with all related multi-fragment data, otherwise all multi-fragments are omitted',
		displayOptions: {
			show: {
				resource: ['dataObject'],
				operation: ['get'],
			},
		},
	},
];

const updateObjectOperation: INodeProperties[] = [
	{
		displayName: 'Configuration Item',
		name: 'configurationItem',
		type: 'string',
		default: '',
		placeholder: 'e.g. SPSActivityTypeIncident',
		description: 'Technical name of the configuration item',
		displayOptions: {
			show: {
				resource: ['dataObject'],
				operation: ['update'],
			},
		},
		required: true,
	},
	{
		displayName: 'Object Data',
		name: 'objectData',
		type: 'json',
		default: '',
		description: 'JSON object retrieved by Get and adjusted with new values',
		displayOptions: {
			show: {
				resource: ['dataObject'],
				operation: ['update'],
			},
		},
		required: true,
	},
	{
		displayName: 'Full',
		name: 'full',
		type: 'boolean',
		default: true,
		description: 'Whether to update multi-fragment data',
		displayOptions: {
			show: {
				resource: ['dataObject'],
				operation: ['update'],
			},
		},
	},
];

const deleteObjectOperation: INodeProperties[] = [
	{
		displayName: 'Configuration Item',
		name: 'configurationItem',
		type: 'string',
		default: '',
		placeholder: 'e.g. SPSActivityTypeIncident',
		description: 'Technical name of the configuration item',
		displayOptions: {
			show: {
				resource: ['dataObject'],
				operation: ['delete'],
			},
		},
		required: true,
	},
	{
		displayName: 'Object ID',
		name: 'objectId',
		type: 'string',
		default: '',
		description: 'The Expression-ObjectID of the object to delete',
		displayOptions: {
			show: {
				resource: ['dataObject'],
				operation: ['delete'],
			},
		},
		required: true,
	},
];

export const matrix42DataFields: INodeProperties[] = [
	...getFragmentsOperation,
	...addFragmentsOperation,
	...updateFragmentsOperation,
	...deleteFragmentsOperation,
	...addObjectOperation,
	...getObjectOperation,
	...updateObjectOperation,
	...deleteObjectOperation,
];
