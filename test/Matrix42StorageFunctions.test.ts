import { afterEach, beforeEach, describe, expect, it, test, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { IBinaryData, IDataObject, IExecuteFunctions } from 'n8n-workflow';

import { uploadFileToCI } from '../nodes/Matrix42/Matrix42StorageFunctions';

const SERVER_URL = 'https://m42.example.com';
const API_BASE = `${SERVER_URL}/m42Services/api`;

// With Math.random mocked to always return 0.5, the hand-rolled uuidv4() in
// GenericFunctions.ts deterministically produces this value:
// r = (0.5 * 16) | 0 = 8; 'x' -> 8, 'y' -> (8 & 0x3) | 0x8 = 8.
const FIXED_UUID = '88888888-8888-4888-8888-888888888888';

const BASE_PARAMS: Record<string, unknown> = {
	authentication: 'basic',
	filename: 'report.pdf',
	storageId: 'storage-1',
	objectId: 'obj-1',
	binaryPropertyName: 'data',
};

interface SetupOptions {
	params?: Record<string, unknown>;
	buffer?: Buffer;
	typeIdResponse?: unknown;
}

function buildMockThis(options: SetupOptions = {}) {
	const {
		params = {},
		buffer = Buffer.from('binary-file-content'),
		typeIdResponse = [{ typeId: 'type-123' }],
	} = options;

	const parameterMap: Record<string, unknown> = { ...BASE_PARAMS, ...params };

	const mockThis = mock<IExecuteFunctions>();

	const getNodeParameter = vi.fn((name: string, _index?: number, fallback?: unknown) =>
		Object.prototype.hasOwnProperty.call(parameterMap, name) ? parameterMap[name] : fallback,
	);
	mockThis.getNodeParameter = getNodeParameter as unknown as IExecuteFunctions['getNodeParameter'];

	const getCredentials = vi.fn().mockResolvedValue({ serverUrl: SERVER_URL });
	mockThis.getCredentials = getCredentials as unknown as IExecuteFunctions['getCredentials'];

	// First request (GET typeId lookup) resolves with the fragment rows; every
	// later request resolves with an ignored empty object.
	const httpRequestWithAuthentication = vi.fn().mockResolvedValue({});
	httpRequestWithAuthentication.mockResolvedValueOnce(typeIdResponse);

	const assertBinaryData = vi.fn().mockReturnValue({
		data: '',
		mimeType: 'application/pdf',
		fileName: 'report.pdf',
	} as IBinaryData);
	const getBinaryDataBuffer = vi.fn().mockResolvedValue(buffer);

	mockThis.helpers = {
		httpRequestWithAuthentication,
		assertBinaryData,
		getBinaryDataBuffer,
	} as unknown as IExecuteFunctions['helpers'];

	return {
		mockThis,
		getNodeParameter,
		getCredentials,
		httpRequestWithAuthentication,
		assertBinaryData,
		getBinaryDataBuffer,
		buffer,
	};
}

describe('uploadFileToCI', () => {
	let randomSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('reads its node parameters at the given item index (authentication always at index 0)', async () => {
		const { mockThis, getNodeParameter } = buildMockThis();

		await uploadFileToCI.call(mockThis, 2);

		expect(getNodeParameter).toHaveBeenCalledWith('filename', 2);
		expect(getNodeParameter).toHaveBeenCalledWith('storageId', 2);
		expect(getNodeParameter).toHaveBeenCalledWith('objectId', 2);
		expect(getNodeParameter).toHaveBeenCalledWith('additionalFields', 2, {});
		expect(getNodeParameter).toHaveBeenCalledWith('binaryPropertyName', 2);
		// matrix42ApiRequest re-reads 'authentication' at index 0 for each of the
		// four API calls (typeId lookup, getuploadurl, upload, finishUploading;
		// no comment configured here).
		expect(
			getNodeParameter.mock.calls.filter((call) => call[0] === 'authentication'),
		).toEqual([
			['authentication', 0],
			['authentication', 0],
			['authentication', 0],
			['authentication', 0],
		]);
	});

	it('asserts binary data exists, then reads the buffer for the configured binary property', async () => {
		const { mockThis, assertBinaryData, getBinaryDataBuffer } = buildMockThis({
			params: { binaryPropertyName: 'attachment' },
		});

		await uploadFileToCI.call(mockThis, 1);

		expect(assertBinaryData).toHaveBeenCalledTimes(1);
		expect(assertBinaryData).toHaveBeenCalledWith(1, 'attachment');
		expect(getBinaryDataBuffer).toHaveBeenCalledTimes(1);
		expect(getBinaryDataBuffer).toHaveBeenCalledWith(1, 'attachment');
		expect(assertBinaryData.mock.invocationCallOrder[0]).toBeLessThan(
			getBinaryDataBuffer.mock.invocationCallOrder[0],
		);
	});

	it('first resolves the TypeId via GET /data/fragments/SPSCommonClassBase filtered by ObjectID', async () => {
		const { mockThis, httpRequestWithAuthentication } = buildMockThis();

		await uploadFileToCI.call(mockThis, 0);

		const [credentialType, requestOptions] = httpRequestWithAuthentication.mock.calls[0];
		expect(credentialType).toBe('matrix42BasicApi');
		expect(requestOptions).toEqual({
			headers: { 'Content-Type': 'application/json' },
			method: 'GET',
			qs: {
				where: "[Expression-ObjectID] = 'obj-1'",
				columns: 'TypeID as typeId',
			},
			url: `${API_BASE}/data/fragments/SPSCommonClassBase`,
			json: true,
			skipSslCertificateValidation: false,
		});
		// GET requests have their body removed entirely, not set to null/undefined.
		expect(requestOptions).not.toHaveProperty('body');
	});

	it('requests an upload URL with the file metadata, buffer size, and a generated v4 UUID', async () => {
		const buffer = Buffer.from('0123456789');
		const { mockThis, httpRequestWithAuthentication } = buildMockThis({ buffer });

		await uploadFileToCI.call(mockThis, 0);

		const [credentialType, requestOptions] = httpRequestWithAuthentication.mock.calls[1];
		expect(credentialType).toBe('matrix42BasicApi');
		expect(requestOptions).toEqual({
			headers: { 'Content-Type': 'application/json' },
			method: 'POST',
			body: {
				Name: 'report.pdf',
				StorageId: 'storage-1',
				TypeId: 'type-123',
				ObjectId: 'obj-1',
				UniqueFileId: FIXED_UUID,
				Size: 10,
			},
			qs: {},
			url: `${API_BASE}/filestorage/getuploadurl`,
			json: true,
			skipSslCertificateValidation: false,
		});
	});

	it('uploads the raw buffer as application/octet-stream with the fileid query parameter', async () => {
		const buffer = Buffer.from('binary payload');
		const { mockThis, httpRequestWithAuthentication } = buildMockThis({ buffer });

		await uploadFileToCI.call(mockThis, 0);

		const [credentialType, requestOptions] = httpRequestWithAuthentication.mock.calls[2];
		expect(credentialType).toBe('matrix42BasicApi');
		// The exact same Buffer instance is passed through as the request body;
		// there is no multipart/form-data wrapping, boundary, or filename here.
		expect((requestOptions as { body: unknown }).body).toBe(buffer);
		expect(requestOptions).toEqual({
			headers: { 'Content-Type': 'application/octet-stream' },
			method: 'POST',
			body: buffer,
			qs: { fileid: FIXED_UUID },
			url: `${API_BASE}/filestorage/upload`,
			json: false,
			skipSslCertificateValidation: false,
		});
	});

	it('finishes the upload via POST /commonStorage/finishUploading/{fileId} with an empty object body', async () => {
		const { mockThis, httpRequestWithAuthentication } = buildMockThis();

		await uploadFileToCI.call(mockThis, 0);

		const [credentialType, requestOptions] = httpRequestWithAuthentication.mock.calls[3];
		expect(credentialType).toBe('matrix42BasicApi');
		expect(requestOptions).toEqual({
			headers: { 'Content-Type': 'application/json' },
			method: 'POST',
			body: {},
			qs: {},
			url: `${API_BASE}/commonStorage/finishUploading/${FIXED_UUID}`,
			json: true,
			skipSslCertificateValidation: false,
		});
	});

	it('performs the four requests in order: typeId lookup, getuploadurl, upload, finish', async () => {
		const { mockThis, httpRequestWithAuthentication } = buildMockThis();

		await uploadFileToCI.call(mockThis, 0);

		expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(4);
		const urls = httpRequestWithAuthentication.mock.calls.map(
			(call) => (call[1] as { url: string }).url,
		);
		expect(urls).toEqual([
			`${API_BASE}/data/fragments/SPSCommonClassBase`,
			`${API_BASE}/filestorage/getuploadurl`,
			`${API_BASE}/filestorage/upload`,
			`${API_BASE}/commonStorage/finishUploading/${FIXED_UUID}`,
		]);
	});

	it('uses the hand-rolled uuidv4 (v4 shape) consistently across upload-url body, upload query, and finish URL', async () => {
		// Use the real Math.random so we exercise the actual uuidv4 implementation.
		randomSpy.mockRestore();
		const { mockThis, httpRequestWithAuthentication } = buildMockThis();

		await uploadFileToCI.call(mockThis, 0);

		const uploadUrlBody = (httpRequestWithAuthentication.mock.calls[1][1] as { body: IDataObject })
			.body;
		const uniqueFileId = uploadUrlBody.UniqueFileId as string;
		expect(uniqueFileId).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
		);

		const uploadOptions = httpRequestWithAuthentication.mock.calls[2][1] as { qs: IDataObject };
		expect(uploadOptions.qs).toEqual({ fileid: uniqueFileId });

		const finishOptions = httpRequestWithAuthentication.mock.calls[3][1] as { url: string };
		expect(finishOptions.url).toBe(`${API_BASE}/commonStorage/finishUploading/${uniqueFileId}`);
	});

	it('posts the comment string as the request body when additionalFields.comment is set', async () => {
		const { mockThis, httpRequestWithAuthentication } = buildMockThis({
			params: { additionalFields: { comment: 'uploaded by n8n' } },
		});

		await uploadFileToCI.call(mockThis, 0);

		expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(5);
		const [credentialType, requestOptions] = httpRequestWithAuthentication.mock.calls[4];
		expect(credentialType).toBe('matrix42BasicApi');
		expect(requestOptions).toEqual({
			headers: { 'Content-Type': 'application/json' },
			method: 'POST',
			// The raw comment string (not an object wrapper) is used as the body.
			body: 'uploaded by n8n',
			qs: {},
			url: `${API_BASE}/filestorage/comment/${FIXED_UUID}`,
			json: true,
			skipSslCertificateValidation: false,
		});
	});

	it('skips the comment request when additionalFields is not set (fallback {})', async () => {
		const { mockThis, httpRequestWithAuthentication } = buildMockThis();

		await uploadFileToCI.call(mockThis, 0);

		expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(4);
		const urls = httpRequestWithAuthentication.mock.calls.map(
			(call) => (call[1] as { url: string }).url,
		);
		expect(urls.some((url) => url.includes('/filestorage/comment/'))).toBe(false);
	});

	it('skips the comment request when comment is an empty string', async () => {
		const { mockThis, httpRequestWithAuthentication } = buildMockThis({
			params: { additionalFields: { comment: '' } },
		});

		await uploadFileToCI.call(mockThis, 0);

		expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(4);
	});

	it('returns [{ Message: "Success" }] regardless of the API responses', async () => {
		const { mockThis } = buildMockThis();

		const result = await uploadFileToCI.call(mockThis, 0);

		expect(result).toEqual([{ Message: 'Success' }]);
	});

	it('uses matrix42TokenApi credentials when authentication is not "basic"', async () => {
		const { mockThis, getCredentials, httpRequestWithAuthentication } = buildMockThis({
			params: { authentication: 'token' },
		});

		await uploadFileToCI.call(mockThis, 0);

		expect(getCredentials).toHaveBeenCalledWith('matrix42TokenApi');
		expect(getCredentials).not.toHaveBeenCalledWith('matrix42BasicApi');
		for (const call of httpRequestWithAuthentication.mock.calls) {
			expect(call[0]).toBe('matrix42TokenApi');
		}
	});

	it('still uploads with TypeId undefined when the fragment lookup returns no rows (current behavior)', async () => {
		const { mockThis, httpRequestWithAuthentication } = buildMockThis({ typeIdResponse: [] });

		await uploadFileToCI.call(mockThis, 0);

		expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(4);
		const uploadUrlBody = (httpRequestWithAuthentication.mock.calls[1][1] as { body: IDataObject })
			.body;
		expect(Object.keys(uploadUrlBody)).toContain('TypeId');
		expect(uploadUrlBody.TypeId).toBeUndefined();
	});

	it('interpolates the objectId verbatim into the where clause of the typeId lookup', async () => {
		const { mockThis, httpRequestWithAuthentication } = buildMockThis({
			params: { objectId: "o'brien" },
		});

		await uploadFileToCI.call(mockThis, 0);

		const requestOptions = httpRequestWithAuthentication.mock.calls[0][1] as { qs: IDataObject };
		// Characterization: the objectId is embedded without any escaping, so a
		// single quote in the value breaks (or injects into) the where expression.
		expect(requestOptions.qs.where).toBe("[Expression-ObjectID] = 'o'brien'");
	});

	// The typeId lookup response is not validated: if the object does not exist,
	// the function silently proceeds and sends TypeId: undefined (which JSON
	// serialization drops) instead of failing with a clear error.
	test.todo('should throw a descriptive error when no CI is found for the given objectId');
});
