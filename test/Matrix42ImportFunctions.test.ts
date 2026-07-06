import { afterEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';

import { executeImportDefinition } from '../nodes/Matrix42/Matrix42ImportFunctions';

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

interface MockContextOptions {
	parameters?: Record<string, unknown>;
	credentials?: IDataObject;
	response?: unknown;
}

interface MockContext {
	mockThis: IExecuteFunctions;
	getNodeParameter: ReturnType<typeof vi.fn>;
	getCredentials: ReturnType<typeof vi.fn>;
	httpRequestWithAuthentication: ReturnType<typeof vi.fn>;
}

function createMockContext(options: MockContextOptions = {}): MockContext {
	const {
		parameters = { authentication: 'token', sequenceEoid: 'sequence-eoid-1' },
		credentials = { serverUrl: 'https://m42.example.com' },
		response = { RunId: 'run-1' },
	} = options;

	const mockThis: IExecuteFunctions = mock<IExecuteFunctions>();

	const getNodeParameter = vi.fn(
		(parameterName: string, _itemIndex?: number, fallbackValue?: unknown) =>
			parameterName in parameters ? parameters[parameterName] : fallbackValue,
	);
	const getCredentials = vi.fn().mockResolvedValue(credentials);
	const httpRequestWithAuthentication = vi.fn().mockResolvedValue(response);

	mockThis.getNodeParameter = getNodeParameter as unknown as IExecuteFunctions['getNodeParameter'];
	mockThis.getCredentials = getCredentials as unknown as IExecuteFunctions['getCredentials'];
	mockThis.helpers = {
		httpRequestWithAuthentication,
	} as unknown as IExecuteFunctions['helpers'];

	return { mockThis, getNodeParameter, getCredentials, httpRequestWithAuthentication };
}

describe('executeImportDefinition', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('sends a POST request to <serverUrl>/m42Services/api/importdata/executeimportdefinition', async () => {
		const { mockThis, httpRequestWithAuthentication } = createMockContext({
			credentials: { serverUrl: 'https://m42.example.com' },
		});

		await executeImportDefinition.call(mockThis, 0);

		expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(1);
		const requestOptions = httpRequestWithAuthentication.mock.calls[0][1] as IDataObject;
		expect(requestOptions.method).toBe('POST');
		expect(requestOptions.url).toBe(
			'https://m42.example.com/m42Services/api/importdata/executeimportdefinition',
		);
	});

	it('builds the exact request options: JSON content type, empty qs, no SSL skip', async () => {
		const { mockThis, httpRequestWithAuthentication } = createMockContext();

		await executeImportDefinition.call(mockThis, 0);

		const requestOptions = httpRequestWithAuthentication.mock.calls[0][1] as IDataObject;
		expect(requestOptions).toEqual({
			headers: { 'Content-Type': 'application/json' },
			method: 'POST',
			body: expect.anything(),
			qs: {},
			url: 'https://m42.example.com/m42Services/api/importdata/executeimportdefinition',
			json: true,
			skipSslCertificateValidation: false,
		});
	});

	it('builds the body with empty Parameters, the sequenceEoid as SequenceId, ActionType 3 and a v4 UUID Token', async () => {
		const { mockThis, httpRequestWithAuthentication } = createMockContext({
			parameters: { authentication: 'token', sequenceEoid: 'abc-123-def' },
		});

		await executeImportDefinition.call(mockThis, 0);

		const body = (httpRequestWithAuthentication.mock.calls[0][1] as IDataObject)
			.body as IDataObject;
		expect(Object.keys(body).sort()).toEqual(['ActionType', 'Parameters', 'SequenceId', 'Token']);
		expect(body.Parameters).toEqual([]);
		expect(body.SequenceId).toBe('abc-123-def');
		expect(body.ActionType).toBe(3);
		expect(body.Token).toMatch(UUID_V4_RE);
	});

	it('generates the Token via the Math.random-based uuidv4 (deterministic when random is stubbed)', async () => {
		vi.spyOn(Math, 'random').mockReturnValue(0);
		const { mockThis, httpRequestWithAuthentication } = createMockContext();

		await executeImportDefinition.call(mockThis, 0);

		const body = (httpRequestWithAuthentication.mock.calls[0][1] as IDataObject)
			.body as IDataObject;
		// With Math.random() === 0: every 'x' -> 0, every 'y' -> 8.
		expect(body.Token).toBe('00000000-0000-4000-8000-000000000000');
	});

	it('generates a fresh Token for every invocation', async () => {
		const randomSpy = vi.spyOn(Math, 'random');
		randomSpy.mockReturnValue(0);
		const { mockThis, httpRequestWithAuthentication } = createMockContext();

		await executeImportDefinition.call(mockThis, 0);
		randomSpy.mockReturnValue(0.999);
		await executeImportDefinition.call(mockThis, 0);

		const firstBody = (httpRequestWithAuthentication.mock.calls[0][1] as IDataObject)
			.body as IDataObject;
		const secondBody = (httpRequestWithAuthentication.mock.calls[1][1] as IDataObject)
			.body as IDataObject;
		expect(firstBody.Token).not.toBe(secondBody.Token);
	});

	it('reads sequenceEoid at the given item index and authentication at index 0', async () => {
		const { mockThis, getNodeParameter } = createMockContext({
			parameters: { authentication: 'token', sequenceEoid: 'seq-at-index-2' },
		});

		await executeImportDefinition.call(mockThis, 2);

		expect(getNodeParameter).toHaveBeenCalledWith('sequenceEoid', 2);
		expect(getNodeParameter).toHaveBeenCalledWith('authentication', 0);
	});

	it('uses the matrix42BasicApi credential type when authentication is "basic"', async () => {
		const { mockThis, getCredentials, httpRequestWithAuthentication } = createMockContext({
			parameters: { authentication: 'basic', sequenceEoid: 'seq-1' },
		});

		await executeImportDefinition.call(mockThis, 0);

		expect(getCredentials).toHaveBeenCalledWith('matrix42BasicApi');
		expect(httpRequestWithAuthentication.mock.calls[0][0]).toBe('matrix42BasicApi');
	});

	it('uses the matrix42TokenApi credential type for any non-basic authentication', async () => {
		const { mockThis, getCredentials, httpRequestWithAuthentication } = createMockContext({
			parameters: { authentication: 'token', sequenceEoid: 'seq-1' },
		});

		await executeImportDefinition.call(mockThis, 0);

		expect(getCredentials).toHaveBeenCalledWith('matrix42TokenApi');
		expect(httpRequestWithAuthentication.mock.calls[0][0]).toBe('matrix42TokenApi');
	});

	it('invokes httpRequestWithAuthentication with the execute-functions context as `this`', async () => {
		const { mockThis, httpRequestWithAuthentication } = createMockContext();

		await executeImportDefinition.call(mockThis, 0);

		expect(httpRequestWithAuthentication.mock.contexts[0]).toBe(mockThis);
	});

	it('returns the raw API response wrapped in a single-element array (no polling)', async () => {
		const response = { RunId: 'run-42', State: 'Started' };
		const { mockThis, httpRequestWithAuthentication } = createMockContext({ response });

		const result = await executeImportDefinition.call(mockThis, 0);

		expect(result).toEqual([response]);
		expect(result[0]).toBe(response);
		// The function fires a single request and returns immediately - no status polling.
		expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(1);
	});

	it('propagates errors from the HTTP request unchanged', async () => {
		const { mockThis, httpRequestWithAuthentication } = createMockContext();
		const requestError = new Error('502 Bad Gateway');
		httpRequestWithAuthentication.mockRejectedValueOnce(requestError);

		await expect(executeImportDefinition.call(mockThis, 0)).rejects.toBe(requestError);
	});
});
