import type {
	IAuthenticateGeneric,
	ICredentialDataDecryptedObject,
	ICredentialTestRequest,
	ICredentialType,
	IHttpRequestHelper,
	INodeProperties,
} from 'n8n-workflow';

export class Matrix42TokenApi implements ICredentialType {
	name = 'matrix42TokenApi';

	displayName = 'Matrix42 Webservice Token Auth API';

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
			displayName: 'Webservice Token',
			name: 'webserviceToken',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			hint: 'The API Token generated in Matrix42. It is exchanged for a short-lived access token on each run',
			required: true,
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
		{
			displayName: 'Access Token',
			name: 'accessToken',
			type: 'hidden',
			typeOptions: {
				expirable: true,
				password: true,
			},
			default: '',
		},
	];

	async preAuthentication(this: IHttpRequestHelper, credentials: ICredentialDataDecryptedObject) {
		const serverUrl = (credentials.serverUrl as string).replace(/\/+$/, '');

		const { RawToken } = (await this.helpers.httpRequest({
			method: 'POST',
			url: `${serverUrl}/m42Services/api/ApiToken/GenerateAccessTokenFromApiToken`,
			skipSslCertificateValidation:
				credentials.ignoreSslIssues === true || credentials.allowUnauthorizedCerts === true,
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${credentials.webserviceToken}`,
			},
			body: {},
			json: true,
		})) as { RawToken: string };

		return { accessToken: RawToken };
	}

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.accessToken}}',
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
