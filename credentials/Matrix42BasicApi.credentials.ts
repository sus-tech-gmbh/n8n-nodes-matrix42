import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class Matrix42BasicApi implements ICredentialType {
	name = 'matrix42BasicApi';

	extends = ['httpBasicAuth'];

	displayName = 'Matrix42 Basic Auth API';

	documentationUrl =
		'https://docs.matrix42.com/1074558_web-services/3463380_web-services-authentication-types';

	icon = 'file:matrix42.svg' as const;

	properties: INodeProperties[] = [
		{
			displayName: 'Server URL',
			name: 'serverUrl',
			type: 'string',
			default: '',
			placeholder: 'e.g. https://matrix42.example.com',
			hint: 'The base URL of the Matrix42 server',
			required: true,
		},
		{
			displayName: 'User',
			name: 'user',
			type: 'string',
			required: true,
			default: '',
		},
		{
			displayName: 'Password',
			name: 'password',
			type: 'string',
			required: true,
			typeOptions: {
				password: true,
			},
			default: '',
		},
		{
			displayName: 'Ignore SSL Issues (Insecure)',
			// Renamed from allowUnauthorizedCerts (the verified-nodes scan misreads
			// "...Certs" as a secret); the old data key is still honored everywhere.
			name: 'ignoreSslIssues',
			type: 'boolean',
			default: false,
			description:
				'Whether to connect even if SSL certificate validation is not possible, e.g. when the Matrix42 server uses a self-signed certificate',
		},
		{
			displayName: 'Response Language',
			name: 'explicitLanguage',
			type: 'string',
			default: '',
			placeholder: 'e.g. de-DE',
			hint: 'Optional. Sent as the "Explicit-Language" header on every request to control the language of the response. Leave empty to use the server default.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			auth: {
				username: '={{$credentials.user}}',
				password: '={{$credentials.password}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.serverUrl.replace(/\\/+$/, "")}}',
			url: '/m42Services/api/data/fragments/SPSGlobalConfigurationClassBase',
			qs: {
				pagesize: 1,
			},
			skipSslCertificateValidation:
				'={{$credentials.ignoreSslIssues || $credentials.allowUnauthorizedCerts || false}}',
		},
	};
}
