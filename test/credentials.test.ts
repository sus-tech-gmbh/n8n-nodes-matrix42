import { describe, expect, it } from 'vitest';

import { Matrix42TokenApi } from '../credentials/Matrix42TokenApi.credentials';
import { Matrix42BasicApi } from '../credentials/Matrix42BasicApi.credentials';

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
			expect(credential.documentationUrl).toBe(
				'https://help.matrix42.com/030_ESMP/030_INT/Business_Processes_and_API_Integrations/Web_Services%3A_Authentication_types',
			);
		});

		it('should not extend any other credential type', () => {
			expect(
				(credential as unknown as { extends?: string[] }).extends,
			).toBeUndefined();
		});
	});

	describe('properties', () => {
		it('should define exactly two properties in order: serverUrl, webserviceToken', () => {
			expect(credential.properties.map((p) => p.name)).toEqual([
				'serverUrl',
				'webserviceToken',
			]);
		});

		it('should define serverUrl as a required string with empty default', () => {
			const serverUrl = credential.properties.find((p) => p.name === 'serverUrl');
			expect(serverUrl).toEqual({
				displayName: 'Server URL',
				name: 'serverUrl',
				type: 'string',
				default: '',
				hint: 'The URL of the Matrix42 server. (https://www.example-matrix42.com)',
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
				hint: 'The Webservice token of the Matrix42 server.',
				required: true,
			});
		});
	});

	describe('authenticate', () => {
		it('should use the generic authentication type', () => {
			expect(credential.authenticate.type).toBe('generic');
		});

		it('should set a Bearer Authorization header expression from the webservice token', () => {
			expect(credential.authenticate.properties).toEqual({
				headers: {
					Authorization: '=Bearer {{$credentials.webserviceToken}}',
				},
			});
		});
	});

	describe('test request', () => {
		it('should use the credential serverUrl expression as baseURL', () => {
			expect(credential.test.request.baseURL).toBe('={{$credentials?.serverUrl}}');
		});

		it('should target the SPSGlobalConfigurationClassBase fragments endpoint', () => {
			expect(credential.test.request.url).toBe(
				'/m42Services/api/data/fragments/SPSGlobalConfigurationClassBase',
			);
		});

		it('should not skip SSL certificate validation', () => {
			expect(credential.test.request.skipSslCertificateValidation).toBe(false);
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
			expect(credential.documentationUrl).toBe(
				'https://help.matrix42.com/030_ESMP/030_INT/Business_Processes_and_API_Integrations/Web_Services%3A_Authentication_types',
			);
		});

		it('should extend httpBasicAuth', () => {
			expect(credential.extends).toEqual(['httpBasicAuth']);
		});
	});

	describe('properties', () => {
		it('should define exactly three properties in order: serverUrl, user, password', () => {
			expect(credential.properties.map((p) => p.name)).toEqual([
				'serverUrl',
				'user',
				'password',
			]);
		});

		it('should define serverUrl as a required string with empty default', () => {
			const serverUrl = credential.properties.find((p) => p.name === 'serverUrl');
			expect(serverUrl).toEqual({
				displayName: 'Server URL',
				name: 'serverUrl',
				type: 'string',
				default: '',
				hint: 'The URL of the Matrix42 server. (https://www.example-matrix42.com)',
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
		it('should use the credential serverUrl expression as baseURL', () => {
			expect(credential.test.request.baseURL).toBe('={{$credentials?.serverUrl}}');
		});

		it('should target the SPSGlobalConfigurationClassBase fragments endpoint', () => {
			expect(credential.test.request.url).toBe(
				'/m42Services/api/data/fragments/SPSGlobalConfigurationClassBase',
			);
		});

		it('should not skip SSL certificate validation', () => {
			expect(credential.test.request.skipSslCertificateValidation).toBe(false);
		});
	});
});
