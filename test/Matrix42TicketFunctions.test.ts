import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { NodeOperationError } from 'n8n-workflow';
import type { IExecuteFunctions, IHttpRequestOptions, INode } from 'n8n-workflow';

import {
	addJournalEntry,
	closeTicket,
	createTicket,
	transformTicket,
} from '../nodes/Matrix42/Matrix42TicketFunctions';

const SERVER_URL = 'https://m42.example.com';
const BASE_URL = `${SERVER_URL}/m42Services/api`;
const NIL_GUID = '00000000-0000-0000-0000-000000000000';

const testNode: INode = {
	id: 'test-node-id',
	name: 'Matrix42 Test',
	type: 'n8n-nodes-matrix42.matrix42',
	typeVersion: 2,
	position: [0, 0],
	parameters: {},
};

type ParamMap = Record<string, unknown>;

interface MockContext {
	mockThis: IExecuteFunctions;
	getNodeParameter: ReturnType<typeof vi.fn>;
	getCredentials: ReturnType<typeof vi.fn>;
	httpRequestWithAuthentication: ReturnType<typeof vi.fn>;
	httpRequest: ReturnType<typeof vi.fn>;
}

/**
 * Builds an IExecuteFunctions mock. The ticket functions delegate to
 * matrix42ApiRequest (GenericFunctions.ts), which additionally reads
 * getNodeParameter('authentication', 0), awaits
 * getCredentials(<credentialType>) for { serverUrl, allowUnauthorizedCerts }
 * and finally calls helpers.httpRequestWithAuthentication.
 *
 * The getNodeParameter mock respects the (name, index, fallback?) signature the
 * source relies on: additionalFields is read with a `{}` fallback, so callers
 * that omit it from `params` characterise the "no optional fields" path.
 */
function buildMockThis(
	params: ParamMap,
	credentials: Record<string, unknown> = { serverUrl: SERVER_URL, allowUnauthorizedCerts: false },
): MockContext {
	const mockThis: IExecuteFunctions = mock<IExecuteFunctions>();

	const getNodeParameter = vi.fn((name: string, _index: number, fallback?: unknown): unknown => {
		if (Object.prototype.hasOwnProperty.call(params, name)) {
			return params[name];
		}
		return fallback;
	});
	const getCredentials = vi.fn().mockResolvedValue(credentials);
	const httpRequestWithAuthentication = vi.fn().mockResolvedValue({});
	// Token-path helper: serves the access-token exchange, succeeds for data calls.
	const httpRequest = vi.fn(async (options: { url?: unknown }) => {
		if (String(options.url).endsWith('/ApiToken/GenerateAccessTokenFromApiToken')) {
			return { statusCode: 200, body: { RawToken: 'minted-access-token' } };
		}
		return { statusCode: 200, body: {} };
	});

	const writable = mockThis as unknown as Record<string, unknown>;
	writable.getNodeParameter = getNodeParameter;
	writable.getCredentials = getCredentials;
	writable.getNode = vi.fn(() => testNode);
	writable.helpers = { httpRequestWithAuthentication, httpRequest };

	return { mockThis, getNodeParameter, getCredentials, httpRequestWithAuthentication, httpRequest };
}

/** Returns the (credentialType, options) tuple recorded for the Nth request. */
function callArgs(
	httpRequestWithAuthentication: ReturnType<typeof vi.fn>,
	n = 0,
): [string, IHttpRequestOptions] {
	return httpRequestWithAuthentication.mock.calls[n] as [string, IHttpRequestOptions];
}

beforeEach(() => {
	vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// createTicket
// ---------------------------------------------------------------------------

describe('createTicket', () => {
	const baseParams: ParamMap = {
		authentication: 'basic',
		ticketType: 55,
		category: 'category-guid',
		subject: 'Printer is on fire',
		descriptionHTML: '<p>Flames everywhere</p>',
		impact: 2,
		urgency: 3,
		priority: 4,
		state: 200,
		additionalFields: {
			responsibleRole: 'role-guid',
			creator: 'creator-guid',
			user: 'user-guid',
			responsibleUser: 'responsible-user-guid',
			sla: 'sla-guid',
		},
	};

	it('POSTs to /ticket/create with the ticket body, activityType query string and fixed state/EntryBy values', async () => {
		const { mockThis, httpRequestWithAuthentication } = buildMockThis(baseParams);
		httpRequestWithAuthentication.mockResolvedValue('new-ticket-eoid');

		const result = await createTicket.call(mockThis, 0);

		expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(1);
		const [credentialType, options] = callArgs(httpRequestWithAuthentication);
		expect(credentialType).toBe('matrix42BasicApi');
		expect(options).toEqual({
			headers: { 'Content-Type': 'application/json' },
			method: 'POST',
			body: {
				Category: 'category-guid',
				Subject: 'Printer is on fire',
				state: 200,
				DescriptionHTML: '<p>Flames everywhere</p>',
				Impact: 2,
				Urgency: 3,
				Priority: 4,
				EntryBy: 4,
				ResponsibleUser: 'responsible-user-guid',
				ResponsibleRole: 'role-guid',
				Creator: 'creator-guid',
				User: 'user-guid',
				Sla: 'sla-guid',
			},
			qs: { activityType: 55 },
			url: `${BASE_URL}/ticket/create`,
			json: true,
			skipSslCertificateValidation: false,
		});

		expect(result).toEqual([{ ticketEoid: 'new-ticket-eoid' }]);
	});

	it('reads the ticket parameters for the given item index (additionalFields with a {} fallback) and resolves the token credential', async () => {
		const { mockThis, getNodeParameter, getCredentials } = buildMockThis(baseParams);

		await createTicket.call(mockThis, 3);

		for (const name of ['ticketType', 'category', 'subject', 'descriptionHTML', 'impact', 'urgency', 'priority']) {
			expect(getNodeParameter).toHaveBeenCalledWith(name, 3);
		}
		expect(getNodeParameter).toHaveBeenCalledWith('additionalFields', 3, {});
		// read inside matrix42ApiRequest, always at index 0
		expect(getNodeParameter).toHaveBeenCalledWith('authentication', 0);
		expect(getCredentials).toHaveBeenCalledWith('matrix42BasicApi');
	});

	it('uses the matrix42TokenApi credential and the node-managed token flow for token auth', async () => {
		const { mockThis, getCredentials, httpRequestWithAuthentication, httpRequest } = buildMockThis({
			...baseParams,
			authentication: 'webserviceToken',
		});

		await createTicket.call(mockThis, 0);

		expect(getCredentials).toHaveBeenCalledWith('matrix42TokenApi');
		// exchange + create request, both through the plain httpRequest helper
		expect(httpRequestWithAuthentication).not.toHaveBeenCalled();
		expect(httpRequest).toHaveBeenCalledTimes(2);
		const createOptions = httpRequest.mock.calls[1][0] as {
			url: string;
			headers: Record<string, string>;
		};
		expect(createOptions.url).toBe(`${BASE_URL}/ticket/create`);
		expect(createOptions.headers.Authorization).toBe('Bearer minted-access-token');
	});

	it('propagates skipSslCertificateValidation from allowUnauthorizedCerts', async () => {
		const { mockThis, httpRequestWithAuthentication } = buildMockThis(baseParams, {
			serverUrl: SERVER_URL,
			allowUnauthorizedCerts: true,
		});

		await createTicket.call(mockThis, 0);

		expect(callArgs(httpRequestWithAuthentication)[1].skipSslCertificateValidation).toBe(true);
	});

	describe('toNumber coercion of Impact/Urgency', () => {
		it('coerces numeric strings to real numbers in the body', async () => {
			const { mockThis, httpRequestWithAuthentication } = buildMockThis({
				...baseParams,
				impact: '2',
				urgency: '3',
			});

			await createTicket.call(mockThis, 0);

			const body = callArgs(httpRequestWithAuthentication)[1].body as Record<string, unknown>;
			expect(body.Impact).toBe(2);
			expect(body.Urgency).toBe(3);
		});

		it('throws a NodeOperationError for a non-numeric Impact and never issues a request', async () => {
			const { mockThis, httpRequestWithAuthentication } = buildMockThis({
				...baseParams,
				impact: 'abc',
			});

			await expect(createTicket.call(mockThis, 0)).rejects.toBeInstanceOf(NodeOperationError);
			await expect(createTicket.call(mockThis, 0)).rejects.toThrow(
				'The "Impact" field must be a number',
			);
			expect(httpRequestWithAuthentication).not.toHaveBeenCalled();
		});

		it('throws a NodeOperationError for an empty-string Urgency', async () => {
			const { mockThis } = buildMockThis({ ...baseParams, urgency: '' });

			await expect(createTicket.call(mockThis, 0)).rejects.toThrow(
				'The "Urgency" field must be a number',
			);
		});
	});

	describe('priority Auto (-1)', () => {
		it('looks up the priority mapping via GET (no request body) and uses the first mapped PriorityValue', async () => {
			const { mockThis, httpRequestWithAuthentication } = buildMockThis({
				...baseParams,
				priority: -1,
			});
			httpRequestWithAuthentication
				.mockResolvedValueOnce([{ PriorityValue: 1 }, { PriorityValue: 9 }])
				.mockResolvedValueOnce('created-eoid');

			const result = await createTicket.call(mockThis, 0);

			expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(2);

			const [lookupCredentialType, lookupOptions] = callArgs(httpRequestWithAuthentication, 0);
			expect(lookupCredentialType).toBe('matrix42BasicApi');
			expect(lookupOptions.method).toBe('GET');
			expect(lookupOptions.url).toBe(`${BASE_URL}/data/fragments/SVMActivityPickupPriorityMapping`);
			expect(lookupOptions.qs).toEqual({
				where: 'ImpactValue = 2 AND UrgencyValue = 3',
				columns: 'PriorityValue',
			});
			// GET requests have their body removed entirely by matrix42ApiRequest
			expect('body' in lookupOptions).toBe(false);
			expect(lookupOptions.json).toBe(true);

			const createOptions = callArgs(httpRequestWithAuthentication, 1)[1];
			expect(createOptions.method).toBe('POST');
			expect(createOptions.url).toBe(`${BASE_URL}/ticket/create`);
			expect((createOptions.body as { Priority: number }).Priority).toBe(1);

			expect(result).toEqual([{ ticketEoid: 'created-eoid' }]);
		});

		it('falls back to Priority 2 when the mapping lookup returns an empty array', async () => {
			const { mockThis, httpRequestWithAuthentication } = buildMockThis({
				...baseParams,
				priority: -1,
			});
			httpRequestWithAuthentication.mockResolvedValueOnce([]).mockResolvedValueOnce('created-eoid');

			await createTicket.call(mockThis, 0);

			const createOptions = callArgs(httpRequestWithAuthentication, 1)[1];
			expect((createOptions.body as { Priority: number }).Priority).toBe(2);
		});

		it('falls back to Priority 2 when the mapping lookup returns a non-array (null) response', async () => {
			const { mockThis, httpRequestWithAuthentication } = buildMockThis({
				...baseParams,
				priority: -1,
			});
			httpRequestWithAuthentication
				.mockResolvedValueOnce(null)
				.mockResolvedValueOnce('created-eoid');

			await createTicket.call(mockThis, 0);

			const createOptions = callArgs(httpRequestWithAuthentication, 1)[1];
			expect((createOptions.body as { Priority: number }).Priority).toBe(2);
		});
	});

	describe('optional relations from additionalFields', () => {
		it('omits every relation when additionalFields defaults to {}', async () => {
			const params = { ...baseParams };
			delete (params as Record<string, unknown>).additionalFields;
			const { mockThis, getNodeParameter, httpRequestWithAuthentication } = buildMockThis(params);

			await createTicket.call(mockThis, 0);

			expect(getNodeParameter).toHaveBeenCalledWith('additionalFields', 0, {});
			const body = callArgs(httpRequestWithAuthentication)[1].body as Record<string, unknown>;
			for (const key of ['ResponsibleUser', 'ResponsibleRole', 'Creator', 'User', 'Sla']) {
				expect(key in body).toBe(false);
			}
			// mandatory keys still present
			expect(body.Category).toBe('category-guid');
			expect(body.EntryBy).toBe(4);
			expect(body.state).toBe(200);
		});

		it('omits relations that are blank ("") or the nil GUID but keeps populated ones', async () => {
			const { mockThis, httpRequestWithAuthentication } = buildMockThis({
				...baseParams,
				additionalFields: {
					responsibleRole: '',
					creator: NIL_GUID,
					user: 'user-guid',
					responsibleUser: undefined,
					sla: NIL_GUID,
				},
			});

			await createTicket.call(mockThis, 0);

			const body = callArgs(httpRequestWithAuthentication)[1].body as Record<string, unknown>;
			expect('ResponsibleRole' in body).toBe(false);
			expect('Creator' in body).toBe(false);
			expect('ResponsibleUser' in body).toBe(false);
			expect('Sla' in body).toBe(false);
			expect(body.User).toBe('user-guid');
		});
	});

	describe('extraProperties', () => {
		it('maps the extra-properties collection to an ExtraProperties Name/Value array', async () => {
			const { mockThis, httpRequestWithAuthentication } = buildMockThis({
				...baseParams,
				additionalFields: {
					extraProperties: {
						property: [
							{ name: 'Solution', value: 'done' },
							{ name: 'Callback', value: '555' },
						],
					},
				},
			});

			await createTicket.call(mockThis, 0);

			const body = callArgs(httpRequestWithAuthentication)[1].body as Record<string, unknown>;
			expect(body.ExtraProperties).toEqual([
				{ Name: 'Solution', Value: 'done' },
				{ Name: 'Callback', Value: '555' },
			]);
		});

		it('drops entries without a name and omits ExtraProperties when none are given', async () => {
			const { mockThis, httpRequestWithAuthentication } = buildMockThis({
				...baseParams,
				additionalFields: { extraProperties: { property: [{ name: '', value: 'x' }] } },
			});

			await createTicket.call(mockThis, 0);

			const body = callArgs(httpRequestWithAuthentication)[1].body as Record<string, unknown>;
			expect(body.ExtraProperties).toEqual([]);
		});
	});
});

// ---------------------------------------------------------------------------
// closeTicket
// ---------------------------------------------------------------------------

describe('closeTicket', () => {
	const baseParams: ParamMap = {
		authentication: 'basic',
		ticketEoid: 'ticket-eoid-1',
		closeRelatedIncidents: true,
		reason: 7,
		errorType: 3,
		comments: 'Closing this ticket',
		servicesAvailability: 1,
		assetsAvailability: 0,
		sendMailToInitiator: true,
		notifyResponsible: false,
		sendMailToUsers: true,
		sendMailToRelatedResponsibleUsers: false,
	};

	it('POSTs to /ticket/close with the EOID wrapped in ObjectIds and all close options, using an empty query string', async () => {
		const { mockThis, httpRequestWithAuthentication } = buildMockThis(baseParams);

		await closeTicket.call(mockThis, 0);

		expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(1);
		const [credentialType, options] = callArgs(httpRequestWithAuthentication);
		expect(credentialType).toBe('matrix42BasicApi');
		expect(options).toEqual({
			headers: { 'Content-Type': 'application/json' },
			method: 'POST',
			body: {
				ObjectIds: ['ticket-eoid-1'],
				CloseRelatedIncidents: true,
				Reason: 7,
				Comments: 'Closing this ticket',
				ServicesAvailability: 1,
				AssetsAvailability: 0,
				SendMailToUsers: true,
				ErrorType: 3,
				SendMailToInitiator: true,
				NotifyResponsible: false,
				SendMailToRelatedResponsibleUsers: false,
			},
			qs: {},
			url: `${BASE_URL}/ticket/close`,
			json: true,
			skipSslCertificateValidation: false,
		});
	});

	it('returns [{ Message: "Success" }] regardless of the API response payload', async () => {
		const { mockThis, httpRequestWithAuthentication } = buildMockThis(baseParams);
		httpRequestWithAuthentication.mockResolvedValue({ anything: 'else' });

		const result = await closeTicket.call(mockThis, 1);

		expect(result).toEqual([{ Message: 'Success' }]);
	});
});

// ---------------------------------------------------------------------------
// transformTicket
// ---------------------------------------------------------------------------

describe('transformTicket', () => {
	const baseParams: ParamMap = {
		authentication: 'basic',
		ticketEoid: 'ticket-eoid-2',
		sourceTypeName: 'SPSActivityTypeIncident',
		targetTypeName: 'SPSActivityTypeServiceRequest',
		category: 'category-guid',
		additionalFields: {
			sla: 'sla-guid',
			ola: 'ola-guid',
			recipientRole: 'recipient-role-guid',
		},
	};

	it('POSTs to /ticket/transform with the transformation body plus optional Sla/Ola/RecipientRole and an empty query string', async () => {
		const { mockThis, httpRequestWithAuthentication } = buildMockThis(baseParams);

		await transformTicket.call(mockThis, 0);

		expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(1);
		const [credentialType, options] = callArgs(httpRequestWithAuthentication);
		expect(credentialType).toBe('matrix42BasicApi');
		expect(options).toEqual({
			headers: { 'Content-Type': 'application/json' },
			method: 'POST',
			body: {
				ObjectIds: ['ticket-eoid-2'],
				SourceTypeName: 'SPSActivityTypeIncident',
				TargetTypeName: 'SPSActivityTypeServiceRequest',
				Category: 'category-guid',
				Sla: 'sla-guid',
				Ola: 'ola-guid',
				RecipientRole: 'recipient-role-guid',
			},
			qs: {},
			url: `${BASE_URL}/ticket/transform`,
			json: true,
			skipSslCertificateValidation: false,
		});
	});

	it('reads additionalFields with a {} fallback and omits Sla/Ola/RecipientRole entirely when unset', async () => {
		const params = { ...baseParams };
		delete (params as Record<string, unknown>).additionalFields;
		const { mockThis, getNodeParameter, httpRequestWithAuthentication } = buildMockThis(params);

		await transformTicket.call(mockThis, 4);

		expect(getNodeParameter).toHaveBeenCalledWith('additionalFields', 4, {});
		const body = callArgs(httpRequestWithAuthentication)[1].body as Record<string, unknown>;
		expect(body).toEqual({
			ObjectIds: ['ticket-eoid-2'],
			SourceTypeName: 'SPSActivityTypeIncident',
			TargetTypeName: 'SPSActivityTypeServiceRequest',
			Category: 'category-guid',
		});
	});

	it('omits Sla/Ola/RecipientRole that are blank ("") or the nil GUID', async () => {
		const { mockThis, httpRequestWithAuthentication } = buildMockThis({
			...baseParams,
			additionalFields: { sla: '', ola: NIL_GUID, recipientRole: 'recipient-role-guid' },
		});

		await transformTicket.call(mockThis, 0);

		const body = callArgs(httpRequestWithAuthentication)[1].body as Record<string, unknown>;
		expect('Sla' in body).toBe(false);
		expect('Ola' in body).toBe(false);
		expect(body.RecipientRole).toBe('recipient-role-guid');
	});

	it('returns [{ Message: "Success" }] regardless of the API response payload', async () => {
		const { mockThis, httpRequestWithAuthentication } = buildMockThis(baseParams);
		httpRequestWithAuthentication.mockResolvedValue('ignored');

		const result = await transformTicket.call(mockThis, 2);

		expect(result).toEqual([{ Message: 'Success' }]);
	});
});

// ---------------------------------------------------------------------------
// addJournalEntry
// ---------------------------------------------------------------------------

describe('addJournalEntry', () => {
	const baseParams: ParamMap = {
		authentication: 'basic',
		ticketEoid: 'ticket-eoid-3',
		comments: 'A journal comment',
		entryType: 1,
		creator: 'creator-guid',
		visibleInPortal: true,
	};

	it('POSTs to /journal/Add with parsed Parameters/FileIds, a GUID TypeId and IsFromEditDialog (corrected spelling)', async () => {
		const { mockThis, httpRequestWithAuthentication } = buildMockThis({
			...baseParams,
			additionalFields: {
				typeId: '019f8b52-9a05-e711-1010-e2edb1eae152',
				publish: true,
				fileIds: '["file-1","file-2"]',
				parameters: '[{"Name":"Priority","Value":"High"}]',
				isFromEditDialog: true,
			},
		});

		await addJournalEntry.call(mockThis, 0);

		expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(1);
		const [credentialType, options] = callArgs(httpRequestWithAuthentication);
		expect(credentialType).toBe('matrix42BasicApi');
		expect(options).toEqual({
			headers: { 'Content-Type': 'application/json' },
			method: 'POST',
			body: {
				ObjectId: 'ticket-eoid-3',
				Publish: true,
				Comments: 'A journal comment',
				EntryType: 1,
				Creator: 'creator-guid',
				VisibleInPortal: true,
				Parameters: [{ Name: 'Priority', Value: 'High' }],
				IsFromEditDialog: true,
				TypeId: '019f8b52-9a05-e711-1010-e2edb1eae152',
				FileIds: ['file-1', 'file-2'],
			},
			qs: {},
			url: `${BASE_URL}/journal/Add`,
			json: true,
			skipSslCertificateValidation: false,
		});
	});

	it('uses the corrected "IsFromEditDialog" key and never the old misspelling "IsFormEditDialog"', async () => {
		const { mockThis, httpRequestWithAuthentication } = buildMockThis({
			...baseParams,
			additionalFields: { isFromEditDialog: true },
		});

		await addJournalEntry.call(mockThis, 0);

		const body = callArgs(httpRequestWithAuthentication)[1].body as Record<string, unknown>;
		expect(body.IsFromEditDialog).toBe(true);
		expect('IsFormEditDialog' in body).toBe(false);
	});

	it('defaults additionalFields to {}: Publish/IsFromEditDialog false, empty Parameters array, no TypeId/FileIds', async () => {
		const { mockThis, getNodeParameter, httpRequestWithAuthentication } = buildMockThis(baseParams);

		await addJournalEntry.call(mockThis, 5);

		expect(getNodeParameter).toHaveBeenCalledWith('additionalFields', 5, {});

		const body = callArgs(httpRequestWithAuthentication)[1].body as Record<string, unknown>;
		expect(body).toEqual({
			ObjectId: 'ticket-eoid-3',
			Publish: false,
			Comments: 'A journal comment',
			EntryType: 1,
			Creator: 'creator-guid',
			VisibleInPortal: true,
			Parameters: [],
			IsFromEditDialog: false,
		});
		expect('TypeId' in body).toBe(false);
		expect('FileIds' in body).toBe(false);
	});

	it('coerces a numeric-string entryType via toNumber', async () => {
		const { mockThis, httpRequestWithAuthentication } = buildMockThis({
			...baseParams,
			entryType: '7',
		});

		await addJournalEntry.call(mockThis, 0);

		const body = callArgs(httpRequestWithAuthentication)[1].body as Record<string, unknown>;
		expect(body.EntryType).toBe(7);
	});

	it('throws a NodeOperationError when entryType is not a number and never issues a request', async () => {
		const { mockThis, httpRequestWithAuthentication } = buildMockThis({
			...baseParams,
			entryType: 'not-a-number',
		});

		await expect(addJournalEntry.call(mockThis, 0)).rejects.toBeInstanceOf(NodeOperationError);
		await expect(addJournalEntry.call(mockThis, 0)).rejects.toThrow(
			'The "Type" field must be a number',
		);
		expect(httpRequestWithAuthentication).not.toHaveBeenCalled();
	});

	it('keeps an explicit false Publish (nullish-coalescing does not override false)', async () => {
		const { mockThis, httpRequestWithAuthentication } = buildMockThis({
			...baseParams,
			additionalFields: { publish: false },
		});

		await addJournalEntry.call(mockThis, 0);

		const body = callArgs(httpRequestWithAuthentication)[1].body as Record<string, unknown>;
		expect(body.Publish).toBe(false);
	});

	it('includes only TypeId when typeId is set without fileIds', async () => {
		const { mockThis, httpRequestWithAuthentication } = buildMockThis({
			...baseParams,
			additionalFields: {
				typeId: '019f8b52-9a05-e711-1010-e2edb1eae152',
				publish: false,
				parameters: '',
			},
		});

		await addJournalEntry.call(mockThis, 0);

		const body = callArgs(httpRequestWithAuthentication)[1].body as Record<string, unknown>;
		expect(body.TypeId).toBe('019f8b52-9a05-e711-1010-e2edb1eae152');
		expect('FileIds' in body).toBe(false);
		// parameters '' parses to []
		expect(body.Parameters).toEqual([]);
	});

	it('throws a descriptive NodeOperationError for a non-GUID Type ID and never issues a request', async () => {
		const { mockThis, httpRequestWithAuthentication } = buildMockThis({
			...baseParams,
			additionalFields: { typeId: 'not-a-guid' },
		});

		await expect(addJournalEntry.call(mockThis, 0)).rejects.toThrow(
			'The "Type ID" field must be a GUID, got: not-a-guid',
		);
		expect(httpRequestWithAuthentication).not.toHaveBeenCalled();
	});

	it('omits TypeId when typeId is an empty string', async () => {
		const { mockThis, httpRequestWithAuthentication } = buildMockThis({
			...baseParams,
			additionalFields: { typeId: '' },
		});

		await addJournalEntry.call(mockThis, 0);

		const body = callArgs(httpRequestWithAuthentication)[1].body as Record<string, unknown>;
		expect('TypeId' in body).toBe(false);
	});

	it('omits Creator when it is blank ("" or nil GUID) and keeps a real one', async () => {
		const { mockThis, httpRequestWithAuthentication } = buildMockThis({
			...baseParams,
			creator: '',
		});

		await addJournalEntry.call(mockThis, 0);

		const body = callArgs(httpRequestWithAuthentication)[1].body as Record<string, unknown>;
		expect('Creator' in body).toBe(false);

		const nilCtx = buildMockThis({ ...baseParams, creator: NIL_GUID });
		await addJournalEntry.call(nilCtx.mockThis, 0);
		const nilBody = callArgs(nilCtx.httpRequestWithAuthentication)[1].body as Record<
			string,
			unknown
		>;
		expect('Creator' in nilBody).toBe(false);

		const setCtx = buildMockThis({ ...baseParams, creator: 'creator-guid' });
		await addJournalEntry.call(setCtx.mockThis, 0);
		const setBody = callArgs(setCtx.httpRequestWithAuthentication)[1].body as Record<
			string,
			unknown
		>;
		expect(setBody.Creator).toBe('creator-guid');
	});

	describe('journal parameters', () => {
		it('maps the Parameters fixedCollection to {Name, Value, Format} objects, dropping an empty Format', async () => {
			const { mockThis, httpRequestWithAuthentication } = buildMockThis({
				...baseParams,
				additionalFields: {
					journalParameters: {
						parameter: [
							{ name: 'TestParam', value: 'hello', format: '' },
							{ name: 'Amount', value: '42', format: 'N2' },
						],
					},
				},
			});

			await addJournalEntry.call(mockThis, 0);

			const body = callArgs(httpRequestWithAuthentication)[1].body as Record<string, unknown>;
			expect(body.Parameters).toEqual([
				{ Name: 'TestParam', Value: 'hello' },
				{ Name: 'Amount', Value: '42', Format: 'N2' },
			]);
		});

		it('skips entirely blank collection rows (accidental "Add Parameter" clicks)', async () => {
			const { mockThis, httpRequestWithAuthentication } = buildMockThis({
				...baseParams,
				additionalFields: {
					journalParameters: {
						parameter: [
							{ name: '', value: '', format: '' },
							{ name: 'Kept', value: 'yes' },
						],
					},
				},
			});

			await addJournalEntry.call(mockThis, 0);

			const body = callArgs(httpRequestWithAuthentication)[1].body as Record<string, unknown>;
			expect(body.Parameters).toEqual([{ Name: 'Kept', Value: 'yes' }]);
		});

		it('throws when a row has a value but no name (the API would store nameless junk)', async () => {
			const { mockThis, httpRequestWithAuthentication } = buildMockThis({
				...baseParams,
				additionalFields: {
					journalParameters: { parameter: [{ name: '', value: 'orphan' }] },
				},
			});

			await expect(addJournalEntry.call(mockThis, 0)).rejects.toThrow(
				'Journal parameter 1 needs a non-empty "Name"',
			);
			expect(httpRequestWithAuthentication).not.toHaveBeenCalled();
		});

		it('still accepts the legacy raw-JSON parameters field, normalizing lowercase keys', async () => {
			const { mockThis, httpRequestWithAuthentication } = buildMockThis({
				...baseParams,
				additionalFields: {
					parameters: '[{"Name":"A","Value":"1"},{"name":"B","value":"2","format":"N0"}]',
				},
			});

			await addJournalEntry.call(mockThis, 0);

			const body = callArgs(httpRequestWithAuthentication)[1].body as Record<string, unknown>;
			expect(body.Parameters).toEqual([
				{ Name: 'A', Value: '1' },
				{ Name: 'B', Value: '2', Format: 'N0' },
			]);
		});

		it('combines fixedCollection rows with legacy JSON parameters', async () => {
			const { mockThis, httpRequestWithAuthentication } = buildMockThis({
				...baseParams,
				additionalFields: {
					journalParameters: { parameter: [{ name: 'FromUi', value: 'x' }] },
					parameters: '[{"Name":"FromJson","Value":"y"}]',
				},
			});

			await addJournalEntry.call(mockThis, 0);

			const body = callArgs(httpRequestWithAuthentication)[1].body as Record<string, unknown>;
			expect(body.Parameters).toEqual([
				{ Name: 'FromUi', Value: 'x' },
				{ Name: 'FromJson', Value: 'y' },
			]);
		});

		it('rejects legacy JSON whose elements are not objects with a Name', async () => {
			const wrongKeys = buildMockThis({
				...baseParams,
				additionalFields: { parameters: '[{"someKey":"v"}]' },
			});
			await expect(addJournalEntry.call(wrongKeys.mockThis, 0)).rejects.toThrow(
				'Journal parameter 1 needs a non-empty "Name"',
			);

			const notObjects = buildMockThis({
				...baseParams,
				additionalFields: { parameters: '["a","b"]' },
			});
			await expect(addJournalEntry.call(notObjects.mockThis, 0)).rejects.toThrow(
				'Journal parameter 1 must be an object with "Name" and "Value" keys',
			);
		});

		it('throws a descriptive error when the legacy Parameters value is a non-JSON string', async () => {
			const { mockThis } = buildMockThis({
				...baseParams,
				additionalFields: { parameters: 'file-1,file-2' },
			});

			await expect(addJournalEntry.call(mockThis, 0)).rejects.toThrow(
				'The "Parameters" field does not contain valid JSON',
			);
		});

		it('throws a descriptive error when File IDs is a non-JSON string', async () => {
			const { mockThis } = buildMockThis({
				...baseParams,
				additionalFields: { fileIds: 'not json' },
			});

			await expect(addJournalEntry.call(mockThis, 0)).rejects.toThrow(
				'The "File IDs" field does not contain valid JSON',
			);
		});
	});

	it('returns [{ Message: "Success" }] regardless of the API response payload', async () => {
		const { mockThis, httpRequestWithAuthentication } = buildMockThis(baseParams);
		httpRequestWithAuthentication.mockResolvedValue({ Id: 'journal-entry-id' });

		const result = await addJournalEntry.call(mockThis, 0);

		expect(result).toEqual([{ Message: 'Success' }]);
	});
});
