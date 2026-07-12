import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { ICredentialDataDecryptedObject, IHttpRequestHelper } from 'n8n-workflow';

import { Matrix42TokenApi } from '../credentials/Matrix42TokenApi.credentials';
import { Matrix42BasicApi } from '../credentials/Matrix42BasicApi.credentials';

const DOCUMENTATION_URL =
	'https://docs.matrix42.com/1074558_web-services/3463380_web-services-authentication-types';
const FRAGMENTS_TEST_URL = '/m42Services/api/data/fragments/SPSGlobalConfigurationClassBase';
// The source strips trailing slashes with the literal regex /\/+$/ written as /\\/+$/ inside a
// single-quoted TS string, so the runtime baseURL expression contains a single backslash.
const BASE_URL_EXPRESSION = '={{$credentials.serverUrl.replace(/\\/+$/, "")}}';

describe('Matrix42TokenApi credential', () => {
	const credential = new Matrix42TokenApi();

	describe('class metadata', () => {
		it('should have the correct name', () => {
			expect(credential.name).toBe('matrix42TokenApi');
		});

		it('should have the correct displayName', () => {
			expect(credential.displayName).toBe('Matrix42 Webservice Token Auth API');
		});

		it('should have the correct documentationUrl', () => {
			expect(credential.documentationUrl).toBe(DOCUMENTATION_URL);
		});

		it('should use the matrix42.svg icon', () => {
			expect(credential.icon).toBe('file:matrix42.svg');
		});

		it('should not extend any other credential type', () => {
			expect((credential as unknown as { extends?: string[] }).extends).toBeUndefined();
		});
	});

	describe('properties', () => {
		it('should define exactly five properties in order', () => {
			expect(credential.properties.map((p) => p.name)).toEqual([
				'serverUrl',
				'webserviceToken',
				'allowUnauthorizedCerts',
				'explicitLanguage',
				'accessToken',
			]);
		});

		it('should define serverUrl as a required string with empty default', () => {
			const serverUrl = credential.properties.find((p) => p.name === 'serverUrl');
			expect(serverUrl).toEqual({
				displayName: 'Server URL',
				name: 'serverUrl',
				type: 'string',
				default: '',
				placeholder: 'e.g. https://matrix42.example.com',
				hint: 'The base URL of the Matrix42 server',
				required: true,
			});
		});

		it('should define webserviceToken as a required string masked as password', () => {
			const token = credential.properties.find((p) => p.name === 'webserviceToken');
			expect(token).toEqual({
				displayName: 'Webservice Token',
				name: 'webserviceToken',
				type: 'string',
				typeOptions: {
					password: true,
				},
				default: '',
				hint: 'The API Token generated in Matrix42. It is exchanged for a short-lived access token on each run',
				required: true,
			});
		});

		it('should define allowUnauthorizedCerts as a boolean defaulting to false', () => {
			const allow = credential.properties.find((p) => p.name === 'allowUnauthorizedCerts');
			expect(allow).toEqual({
				displayName: 'Ignore SSL Issues (Insecure)',
				name: 'allowUnauthorizedCerts',
				type: 'boolean',
				default: false,
				description:
					'Whether to connect even if SSL certificate validation is not possible, e.g. when the Matrix42 server uses a self-signed certificate',
			});
		});

		it('should define explicitLanguage as an optional string defaulting to empty', () => {
			const lang = credential.properties.find((p) => p.name === 'explicitLanguage');
			expect(lang?.type).toBe('string');
			expect(lang?.default).toBe('');
		});

		it('should define accessToken as a hidden expirable field', () => {
			const accessToken = credential.properties.find((p) => p.name === 'accessToken');
			expect(accessToken).toEqual({
				displayName: 'Access Token',
				name: 'accessToken',
				type: 'hidden',
				typeOptions: {
					expirable: true,
				},
				default: '',
			});
		});
	});

	describe('authenticate', () => {
		it('should use the generic authentication type', () => {
			expect(credential.authenticate.type).toBe('generic');
		});

		it('should set a Bearer Authorization header from the access token', () => {
			expect(credential.authenticate.properties).toEqual({
				headers: {
					Authorization: '=Bearer {{$credentials.accessToken}}',
				},
			});
		});
	});

	describe('test request', () => {
		it('should use the trailing-slash-stripped serverUrl expression as baseURL', () => {
			expect(credential.test.request.baseURL).toBe(BASE_URL_EXPRESSION);
		});

		it('should target the SPSGlobalConfigurationClassBase fragments endpoint', () => {
			expect(credential.test.request.url).toBe(FRAGMENTS_TEST_URL);
		});

		it('should request a single row via pagesize qs', () => {
			expect(credential.test.request.qs).toEqual({ pagesize: 1 });
		});

		it('should skip SSL validation based on the allowUnauthorizedCerts expression', () => {
			expect(credential.test.request.skipSslCertificateValidation).toBe(
				'={{$credentials.allowUnauthorizedCerts}}',
			);
		});
	});

	describe('preAuthentication', () => {
		it('should exchange the webservice token for an access token', async () => {
			const mockThis = mock<IHttpRequestHelper>();
			mockThis.helpers.httpRequest = vi.fn().mockResolvedValue({ RawToken: 'x' });

			const credentials: ICredentialDataDecryptedObject = {
				serverUrl: 'https://matrix42.example.com/',
				webserviceToken: 'my-webservice-token',
				allowUnauthorizedCerts: true,
			};

			const result = await credential.preAuthentication!.call(mockThis, credentials);

			expect(result).toEqual({ accessToken: 'x' });
			expect(mockThis.helpers.httpRequest).toHaveBeenCalledTimes(1);
			expect(mockThis.helpers.httpRequest).toHaveBeenCalledWith({
				method: 'POST',
				url: 'https://matrix42.example.com/m42Services/api/ApiToken/GenerateAccessTokenFromApiToken',
				skipSslCertificateValidation: true,
				headers: {
					'Content-Type': 'application/json',
					Authorization: 'Bearer my-webservice-token',
				},
				body: {},
				json: true,
			});
		});

		it('should not skip SSL when allowUnauthorizedCerts is not exactly true and keep the untrimmed host', async () => {
			const mockThis = mock<IHttpRequestHelper>();
			mockThis.helpers.httpRequest = vi.fn().mockResolvedValue({ RawToken: 'another-token' });

			const credentials: ICredentialDataDecryptedObject = {
				serverUrl: 'https://matrix42.example.com',
				webserviceToken: 'token-2',
			};

			const result = await credential.preAuthentication!.call(mockThis, credentials);

			expect(result).toEqual({ accessToken: 'another-token' });
			expect(mockThis.helpers.httpRequest).toHaveBeenCalledWith({
				method: 'POST',
				url: 'https://matrix42.example.com/m42Services/api/ApiToken/GenerateAccessTokenFromApiToken',
				skipSslCertificateValidation: false,
				headers: {
					'Content-Type': 'application/json',
					Authorization: 'Bearer token-2',
				},
				body: {},
				json: true,
			});
		});
	});
});

describe('Matrix42BasicApi credential', () => {
	const credential = new Matrix42BasicApi();

	describe('class metadata', () => {
		it('should have the correct name', () => {
			expect(credential.name).toBe('matrix42BasicApi');
		});

		it('should have the correct displayName', () => {
			expect(credential.displayName).toBe('Matrix42 Basic Auth API');
		});

		it('should have the correct documentationUrl', () => {
			expect(credential.documentationUrl).toBe(DOCUMENTATION_URL);
		});

		it('should use the matrix42.svg icon', () => {
			expect(credential.icon).toBe('file:matrix42.svg');
		});

		it('should extend httpBasicAuth', () => {
			expect(credential.extends).toEqual(['httpBasicAuth']);
		});
	});

	describe('properties', () => {
		it('should define exactly five properties in order', () => {
			expect(credential.properties.map((p) => p.name)).toEqual([
				'serverUrl',
				'user',
				'password',
				'allowUnauthorizedCerts',
				'explicitLanguage',
			]);
		});

		it('should define serverUrl as a required string with empty default', () => {
			const serverUrl = credential.properties.find((p) => p.name === 'serverUrl');
			expect(serverUrl).toEqual({
				displayName: 'Server URL',
				name: 'serverUrl',
				type: 'string',
				default: '',
				placeholder: 'e.g. https://matrix42.example.com',
				hint: 'The base URL of the Matrix42 server',
				required: true,
			});
		});

		it('should define user as a required string with empty default', () => {
			const user = credential.properties.find((p) => p.name === 'user');
			expect(user).toEqual({
				displayName: 'User',
				name: 'user',
				type: 'string',
				required: true,
				default: '',
			});
		});

		it('should define password as a required string masked as password', () => {
			const password = credential.properties.find((p) => p.name === 'password');
			expect(password).toEqual({
				displayName: 'Password',
				name: 'password',
				type: 'string',
				required: true,
				typeOptions: {
					password: true,
				},
				default: '',
			});
		});

		it('should define allowUnauthorizedCerts as a boolean defaulting to false', () => {
			const allow = credential.properties.find((p) => p.name === 'allowUnauthorizedCerts');
			expect(allow).toEqual({
				displayName: 'Ignore SSL Issues (Insecure)',
				name: 'allowUnauthorizedCerts',
				type: 'boolean',
				default: false,
				description:
					'Whether to connect even if SSL certificate validation is not possible, e.g. when the Matrix42 server uses a self-signed certificate',
			});
		});
	});

	describe('authenticate', () => {
		it('should use the generic authentication type', () => {
			expect(credential.authenticate.type).toBe('generic');
		});

		it('should map basic auth username/password expressions from the credential fields', () => {
			expect(credential.authenticate.properties).toEqual({
				auth: {
					username: '={{$credentials.user}}',
					password: '={{$credentials.password}}',
				},
			});
		});
	});

	describe('test request', () => {
		it('should use the trailing-slash-stripped serverUrl expression as baseURL', () => {
			expect(credential.test.request.baseURL).toBe(BASE_URL_EXPRESSION);
		});

		it('should target the SPSGlobalConfigurationClassBase fragments endpoint', () => {
			expect(credential.test.request.url).toBe(FRAGMENTS_TEST_URL);
		});

		it('should request a single row via pagesize qs', () => {
			expect(credential.test.request.qs).toEqual({ pagesize: 1 });
		});

		it('should skip SSL validation based on the allowUnauthorizedCerts expression', () => {
			expect(credential.test.request.skipSslCertificateValidation).toBe(
				'={{$credentials.allowUnauthorizedCerts}}',
			);
		});
	});
});
