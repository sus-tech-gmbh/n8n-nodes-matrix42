import {INodeProperties} from "n8n-workflow";

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
		// eslint-disable-next-line n8n-nodes-base/node-param-options-type-unsorted-items
		options: [
			{
				name: 'Upload File',
				value: 'uploadFile',
				description: 'Upload one or more file',
				action: 'Upload file',
			}
		],
		default: 'uploadFile',
	},
];

const uploadFilesOperation: INodeProperties[] = [
	{
		displayName: 'Filename',
		name: 'filename',
		type: 'string',
		default: '',
		description: 'The Name of the File',
		displayOptions: {
			show: {
				operation: ['uploadFile']
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
		description: 'The Storage Provider where the file should be uploaded to. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: {
			show: {
				operation: ['uploadFile']
			},
		},
		required: true,
	},
	{
		displayName: 'Object ID',
		name: 'objectId',
		type: 'string',
		default: '',
		description: 'The Object ID of the Configuration Item where the file should be attached to',
		displayOptions: {
			show: {
				operation: ['uploadFile']
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
				operation: ['uploadFile']
			},
		},
		placeholder: '',
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
				operation: ['uploadFile'],
			},
		},
		options: [
			{
				displayName: 'Comment',
				name: 'comment',
				type: 'string',
				default: '',
				description: 'Comment that is displayed on the uploaded attachment',
			}
		],
	},
];


export const matrix42StorageFields: INodeProperties[] = [
	...uploadFilesOperation,
];
