import type { INodeProperties } from 'n8n-workflow';

export const matrix42ImportOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['import'],
			},
		},
		options: [
			{
				name: 'Execute',
				value: 'execute',
				description: 'Execute an import definition',
				action: 'Execute an import definition',
			},
		],
		default: 'execute',
	},
];

const executeImportDefinitionOperation: INodeProperties[] = [
	{
		displayName: 'Import Definition Name or ID',
		name: 'sequenceEoid',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'getImportDefinitions',
		},
		default: '',
		description:
			'The import definition to execute. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: {
			show: {
				resource: ['import'],
				operation: ['execute'],
			},
		},
		required: true,
	},
];

export const matrix42ImportFields: INodeProperties[] = [...executeImportDefinitionOperation];
