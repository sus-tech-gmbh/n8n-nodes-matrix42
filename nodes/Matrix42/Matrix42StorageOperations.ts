import type { INodeProperties } from 'n8n-workflow';

export const matrix42StorageOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['storage'],
			},
		},
		options: [
			{
				name: 'Upload',
				value: 'upload',
				description: 'Upload a file and attach it to a configuration item',
				action: 'Upload a file',
			},
		],
		default: 'upload',
	},
];

const uploadFilesOperation: INodeProperties[] = [
	{
		displayName: 'Filename',
		name: 'filename',
		type: 'string',
		default: '',
		placeholder: 'e.g. report.pdf',
		description: 'The name of the file as it should appear in Matrix42',
		displayOptions: {
			show: {
				resource: ['storage'],
				operation: ['upload'],
			},
		},
		required: true,
	},
	{
		displayName: 'Storage Name or ID',
		name: 'storageId',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'getStorageProviders',
		},
		default: '',
		description:
			'The storage provider to upload the file to. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: {
			show: {
				resource: ['storage'],
				operation: ['upload'],
			},
		},
		required: true,
	},
	{
		displayName: 'Object ID',
		name: 'objectId',
		type: 'string',
		default: '',
		description: 'The Object ID of the configuration item to attach the file to',
		displayOptions: {
			show: {
				resource: ['storage'],
				operation: ['upload'],
			},
		},
		required: true,
	},
	{
		displayName: 'Input Binary Field',
		name: 'binaryPropertyName',
		type: 'string',
		default: 'data',
		required: true,
		displayOptions: {
			show: {
				resource: ['storage'],
				operation: ['upload'],
			},
		},
		hint: 'The name of the input binary field containing the file to be uploaded',
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: {
			show: {
				resource: ['storage'],
				operation: ['upload'],
			},
		},
		options: [
			{
				displayName: 'Comment',
				name: 'comment',
				type: 'string',
				default: '',
				description: 'Comment displayed on the uploaded attachment',
			},
		],
	},
];

export const matrix42StorageFields: INodeProperties[] = [...uploadFilesOperation];
