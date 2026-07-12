import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { type IDataObject, type IExecuteFunctions, NodeOperationError } from 'n8n-workflow';

import { uploadFileToCI } from '../nodes/Matrix42/Matrix42StorageFunctions';

const SERVER_URL = 'https://m42.example.com';
const API_BASE = `${SERVER_URL}/m42Services/api`;

// The current source generates its UniqueFileId with randomUUID() from
// 'node:crypto', so the value is not deterministic. Tests read the actual
// generated id out of the first upload request and assert it is a real v4 UUID
// that is reused verbatim across the remaining calls.
const V4_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

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
	credentials?: Record<string, unknown>;
}

function buildMockThis(options: SetupOptions = {}) {
	const {
		params = {},
		buffer = Buffer.from('binary-file-content'),
		typeIdResponse = [{ typeId: 'type-123' }],
		credentials = { serverUrl: SERVER_URL },
	} = options;

	const parameterMap: Record<string, unknown> = { ...BASE_PARAMS, ...params };

	const mockThis = mock<IExecuteFunctions>();

	const getNodeParameter = vi.fn((name: string, _index?: number, fallback?: unknown) =>
		Object.prototype.hasOwnProperty.call(parameterMap, name) ? parameterMap[name] : fallback,
	);
	mockThis.getNodeParameter = getNodeParameter as unknown as IExecuteFunctions['getNodeParameter'];

	const getCredentials = vi.fn().mockResolvedValue(credentials);
	mockThis.getCredentials = getCredentials as unknown as IExecuteFunctions['getCredentials'];

	mockThis.getNode = vi.fn().mockReturnValue({
		id: 'test-node',
		name: 'Matrix42',
		type: 'n8n-nodes-matrix42.matrix42',
		typeVersion: 2,
		position: [0, 0],
		parameters: {},
	}) as unknown as IExecuteFunctions['getNode'];

	// First request (GET typeId lookup) resolves with the fragment rows; every
	// later request resolves with an ignored empty object.
	const httpRequestWithAuthentication = vi.fn().mockResolvedValue({});
	httpRequestWithAuthentication.mockResolvedValueOnce(typeIdResponse);

	const assertBinaryData = vi.fn().mockReturnValue({
		data: '',
		mimeType: 'application/pdf',
		fileName: 'report.pdf',
	});
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

/** Reads the UniqueFileId the source generated, out of the getuploadurl body. */
function generatedUuid(httpMock: ReturnType<typeof vi.fn>): string {
	return (httpMock.mock.calls[1][1] as { body: IDataObject }).body.UniqueFileId as string;
}

describe('uploadFileToCI', () => {
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
		expect(getNodeParameter.mock.calls.filter((call) => call[0] === 'authentication')).toEqual([
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

	it('first resolves the TypeId via GET /data/fragments/SPSCommonClassBase filtered by escaped ObjectID', async () => {
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

	it('escapes single quotes in the objectId with escapeAsqlString in the typeId where clause', async () => {
		const { mockThis, httpRequestWithAuthentication } = buildMockThis({
			params: { objectId: "o'brien" },
		});

		await uploadFileToCI.call(mockThis, 0);

		const requestOptions = httpRequestWithAuthentication.mock.calls[0][1] as { qs: IDataObject };
		// The single quote is doubled so it stays a literal inside the ASQL string.
		expect(requestOptions.qs.where).toBe("[Expression-ObjectID] = 'o''brien'");
	});

	it('requests an upload URL with the file metadata, buffer size, and the generated v4 UUID', async () => {
		const buffer = Buffer.from('0123456789');
		const { mockThis, httpRequestWithAuthentication } = buildMockThis({ buffer });

		await uploadFileToCI.call(mockThis, 0);

		const uuid = generatedUuid(httpRequestWithAuthentication);
		expect(uuid).toMatch(V4_UUID);

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
				UniqueFileId: uuid,
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

		const uuid = generatedUuid(httpRequestWithAuthentication);
		const [credentialType, requestOptions] = httpRequestWithAuthentication.mock.calls[2];
		expect(credentialType).toBe('matrix42BasicApi');
		// The exact same Buffer instance is passed through as the request body;
		// there is no multipart/form-data wrapping, boundary, or filename here.
		expect((requestOptions as { body: unknown }).body).toBe(buffer);
		expect(requestOptions).toEqual({
			headers: { 'Content-Type': 'application/octet-stream' },
			method: 'POST',
			body: buffer,
			qs: { fileid: uuid },
			url: `${API_BASE}/filestorage/upload`,
			json: false,
			skipSslCertificateValidation: false,
		});
	});

	it('finishes the upload via POST /commonStorage/finishUploading/{fileId} with an empty object body', async () => {
		const { mockThis, httpRequestWithAuthentication } = buildMockThis();

		await uploadFileToCI.call(mockThis, 0);

		const uuid = generatedUuid(httpRequestWithAuthentication);
		const [credentialType, requestOptions] = httpRequestWithAuthentication.mock.calls[3];
		expect(credentialType).toBe('matrix42BasicApi');
		// The empty {} body has no keys, so matrix42ApiRequest omits the body property.
		expect(requestOptions).toEqual({
			headers: { 'Content-Type': 'application/json' },
			method: 'POST',
			qs: {},
			url: `${API_BASE}/commonStorage/finishUploading/${uuid}`,
			json: true,
			skipSslCertificateValidation: false,
		});
		expect(requestOptions).not.toHaveProperty('body');
	});

	it('performs the four requests in order: typeId lookup, getuploadurl, upload, finish', async () => {
		const { mockThis, httpRequestWithAuthentication } = buildMockThis();

		await uploadFileToCI.call(mockThis, 0);

		expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(4);
		const uuid = generatedUuid(httpRequestWithAuthentication);
		const urls = httpRequestWithAuthentication.mock.calls.map(
			(call) => (call[1] as { url: string }).url,
		);
		expect(urls).toEqual([
			`${API_BASE}/data/fragments/SPSCommonClassBase`,
			`${API_BASE}/filestorage/getuploadurl`,
			`${API_BASE}/filestorage/upload`,
			`${API_BASE}/commonStorage/finishUploading/${uuid}`,
		]);
	});

	it('generates the UniqueFileId once and reuses the same v4 UUID across body, upload query, and finish URL', async () => {
		const { mockThis, httpRequestWithAuthentication } = buildMockThis();

		await uploadFileToCI.call(mockThis, 0);

		const uuid = generatedUuid(httpRequestWithAuthentication);
		expect(uuid).toMatch(V4_UUID);

		const uploadOptions = httpRequestWithAuthentication.mock.calls[2][1] as { qs: IDataObject };
		expect(uploadOptions.qs).toEqual({ fileid: uuid });

		const finishOptions = httpRequestWithAuthentication.mock.calls[3][1] as { url: string };
		expect(finishOptions.url).toBe(`${API_BASE}/commonStorage/finishUploading/${uuid}`);
	});

	it('posts the comment JSON-encoded as the request body when additionalFields.comment is set', async () => {
		const { mockThis, httpRequestWithAuthentication } = buildMockThis({
			params: { additionalFields: { comment: 'uploaded by n8n' } },
		});

		await uploadFileToCI.call(mockThis, 0);

		expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(5);
		const uuid = generatedUuid(httpRequestWithAuthentication);
		const [credentialType, requestOptions] = httpRequestWithAuthentication.mock.calls[4];
		expect(credentialType).toBe('matrix42BasicApi');
		expect(requestOptions).toEqual({
			headers: { 'Content-Type': 'application/json' },
			method: 'POST',
			// The comment is JSON.stringify'd, so the body is the quoted string.
			body: JSON.stringify('uploaded by n8n'),
			qs: {},
			url: `${API_BASE}/filestorage/comment/${uuid}`,
			json: true,
			skipSslCertificateValidation: false,
		});
		expect((requestOptions as { body: string }).body).toBe('"uploaded by n8n"');
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

	it('sets skipSslCertificateValidation from the credential allowUnauthorizedCerts flag', async () => {
		const { mockThis, httpRequestWithAuthentication } = buildMockThis({
			credentials: { serverUrl: SERVER_URL, allowUnauthorizedCerts: true },
		});

		await uploadFileToCI.call(mockThis, 0);

		for (const call of httpRequestWithAuthentication.mock.calls) {
			expect((call[1] as { skipSslCertificateValidation: boolean }).skipSslCertificateValidation).toBe(
				true,
			);
		}
	});

	it('throws a NodeOperationError and stops before uploading when the fragment lookup returns no rows', async () => {
		const { mockThis, httpRequestWithAuthentication } = buildMockThis({ typeIdResponse: [] });

		await expect(uploadFileToCI.call(mockThis, 0)).rejects.toBeInstanceOf(NodeOperationError);

		// Only the typeId lookup ran; no upload URL / upload / finish requests.
		expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(1);
	});

	it('reports the offending objectId in the missing-CI error message', async () => {
		const { mockThis } = buildMockThis({ typeIdResponse: [], params: { objectId: 'missing-obj' } });

		await expect(uploadFileToCI.call(mockThis, 0)).rejects.toThrow(
			'No configuration item was found for Object ID "missing-obj"',
		);
	});

	it('throws when the fragment row is present but its typeId is empty', async () => {
		const { mockThis, httpRequestWithAuthentication } = buildMockThis({
			typeIdResponse: [{ typeId: '' }],
		});

		await expect(uploadFileToCI.call(mockThis, 0)).rejects.toBeInstanceOf(NodeOperationError);
		expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(1);
	});
});
