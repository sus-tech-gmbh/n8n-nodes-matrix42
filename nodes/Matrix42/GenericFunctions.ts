import {
	IDataObject,
	IExecuteFunctions, IHookFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions, ILoadOptionsFunctions,
} from 'n8n-workflow';

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
	const { serverUrl } = await this.getCredentials<{ serverUrl: string }>(credentialType);

	const isJson = contentType?.toLowerCase().includes('application/json');

	const options: IHttpRequestOptions = {
		headers: {
			'Content-Type': contentType,
		},
		method,
		body: method === 'GET' || method === 'HEAD' || method === 'DELETE' ? null : body,
		qs: query,
		url: uri || `${serverUrl}/m42Services/api${endpoint}`,
		json: isJson,
		skipSslCertificateValidation: false
	};

	if (options.body === null) {
		delete options.body;
	}

	return await this.helpers.httpRequestWithAuthentication.call(this, credentialType, options);
}

export function uuidv4() {
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
		const r = (Math.random() * 16) | 0;               // random integer 0–15
		const v = c === 'x' ? r : (r & 0x3) | 0x8;        // version bits
		return v.toString(16);
	});
}
