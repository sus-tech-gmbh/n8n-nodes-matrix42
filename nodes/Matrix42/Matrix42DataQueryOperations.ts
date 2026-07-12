import type { INodeProperties } from 'n8n-workflow';

export const matrix42DataQueryOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['dataQuery'],
			},
		},
		options: [
			{
				name: 'Get Data',
				value: 'getData',
				description: 'Get the list items of a data query',
				action: 'Get data query data',
			},
		],
		default: 'getData',
	},
];

const getDataOperation: INodeProperties[] = [
	{
		displayName: 'Data Query Name or ID',
		name: 'dataQueryId',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'getDataQueries',
		},
		default: '',
		description:
			'The data query (content widget list) to read. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: {
			show: {
				resource: ['dataQuery'],
				operation: ['getData'],
			},
		},
		required: true,
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: {
			show: {
				resource: ['dataQuery'],
				operation: ['getData'],
			},
		},
	},
	{
		displayName: 'Page Size',
		name: 'pageSize',
		type: 'number',
		default: 100,
		typeOptions: {
			minValue: 1,
		},
		description:
			'Number of items per page. When "Return All" is enabled, this is the batch size used while paging.',
		displayOptions: {
			show: {
				resource: ['dataQuery'],
				operation: ['getData'],
			},
		},
	},
	{
		displayName: 'Page',
		name: 'page',
		type: 'number',
		default: 0,
		typeOptions: {
			minValue: 0,
		},
		description: 'The page number to fetch (pages are zero-based)',
		displayOptions: {
			show: {
				resource: ['dataQuery'],
				operation: ['getData'],
				returnAll: [false],
			},
		},
	},
	{
		displayName: 'User Filters',
		name: 'userFilters',
		type: 'json',
		default: '',
		description:
			'Optional structured filter group sent in the request body (a QueryFilterGroup). Example: <code>{ "LogicalOperator": 1, "Conditions": [ { "Operator": 7, "Property": "Name", "Value": ["test"] } ] }</code>. LogicalOperator: 1 = And, 2 = Or. Operator: 1 = Equals, 2 = NonEquals, 7 = Contains, 10 = In, 12 = Between, 14 = IsEmpty, 15 = IsNotEmpty (see the Matrix42 QueryFilterOperator enum for the full list). Leave empty to apply no extra filter.',
		displayOptions: {
			show: {
				resource: ['dataQuery'],
				operation: ['getData'],
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
				resource: ['dataQuery'],
				operation: ['getData'],
			},
		},
		options: [
			{
				displayName: 'Archived Data',
				name: 'archivedData',
				type: 'boolean',
				default: false,
				description: 'Whether archived data should be returned',
			},
			{
				displayName: 'Columns',
				name: 'columns',
				type: 'string',
				default: '',
				placeholder: 'e.g. Name, State',
				description: 'Data query columns, comma-separated',
			},
			{
				displayName: 'End Date',
				name: 'endDate',
				type: 'dateTime',
				default: '',
				description: 'End date of the given range, in local time format',
			},
			{
				displayName: 'Entity Types',
				name: 'entityTypes',
				type: 'string',
				default: '',
				description: 'Allowed entity types',
			},
			{
				displayName: 'Filters',
				name: 'filters',
				type: 'string',
				default: '',
				description: 'Filter IDs, comma-separated',
			},
			{
				displayName: 'Filters Operator',
				name: 'filtersOperator',
				type: 'number',
				default: 0,
				description: 'The logical operator between the selected query filters',
			},
			{
				displayName: 'Force Consider Parent Filters',
				name: 'forceConsiderParentFilters',
				type: 'boolean',
				default: false,
				description: 'Whether the data query considers parent filters',
			},
			{
				displayName: 'Green Filter',
				name: 'greenFilter',
				type: 'string',
				default: '',
				description: 'Green quick filter ID',
			},
			{
				displayName: 'Order By',
				name: 'orderBy',
				type: 'string',
				default: '',
				placeholder: 'e.g. Name ASC',
				description: 'Sorting expression',
			},
			{
				displayName: 'Red Filter',
				name: 'redFilter',
				type: 'string',
				default: '',
				description: 'Red quick filter ID',
			},
			{
				displayName: 'Search',
				name: 'search',
				type: 'string',
				default: '',
				description: 'Search keyword',
			},
			{
				displayName: 'Start Date',
				name: 'startDate',
				type: 'dateTime',
				default: '',
				description: 'Start date of the given range, in local time format',
			},
			{
				displayName: 'Total Counted',
				name: 'totalCounted',
				type: 'boolean',
				default: false,
				description: 'Whether the data query is total counted',
			},
			{
				displayName: 'Yellow Filter',
				name: 'yellowFilter',
				type: 'string',
				default: '',
				description: 'Yellow quick filter ID',
			},
		],
	},
];

export const matrix42DataQueryFields: INodeProperties[] = [...getDataOperation];
