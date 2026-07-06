import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
} from 'n8n-workflow';

interface Matrix42Credentials {
	serverUrl: string;
	allowUnauthorizedCerts?: boolean;
}

/** Removes a trailing slash so `serverUrl + '/m42Services/...'` never produces a double slash. */
export function normalizeServerUrl(serverUrl: string): string {
	return serverUrl.replace(/\/+$/, '');
}

/**
 * Escapes a value for safe use inside an ASQL string literal (`... = '<value>'`).
 * ASQL, like SQL, escapes a single quote by doubling it.
 */
export function escapeAsqlString(value: string): string {
	return String(value ?? '').replace(/'/g, "''");
}

export async function matrix42ApiRequest(
	this: IHookFunctions | IExecuteFunctions | ILoadOptionsFunctions,
	method: IHttpRequestMethods,
	endpoint: `/${string}`,
	body: object,
	query?: IDataObject,
	uri?: string,
	contentType: string = 'application/json',
): Promise<any> {
	const authenticationMethod = this.getNodeParameter('authentication', 0) as string;
	const credentialType = authenticationMethod === 'basic' ? 'matrix42BasicApi' : 'matrix42TokenApi';
	const { serverUrl, allowUnauthorizedCerts } =
		await this.getCredentials<Matrix42Credentials>(credentialType);

	const isJson = contentType?.toLowerCase().includes('application/json');
	const hasBody =
		method !== 'GET' && method !== 'HEAD' && body != null && Object.keys(body).length > 0;

	const options: IHttpRequestOptions = {
		headers: {
			'Content-Type': contentType,
		},
		method,
		body: hasBody ? body : undefined,
		qs: query,
		url: uri || `${normalizeServerUrl(serverUrl)}/m42Services/api${endpoint}`,
		json: isJson,
		skipSslCertificateValidation: allowUnauthorizedCerts === true,
	};

	if (options.body === undefined) {
		delete options.body;
	}

	return await this.helpers.httpRequestWithAuthentication.call(this, credentialType, options);
}
