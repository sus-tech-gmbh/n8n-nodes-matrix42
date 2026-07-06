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

	const writable = mockThis as unknown as Record<string, unknown>;
	writable.getNodeParameter = getNodeParameter;
	writable.getCredentials = getCredentials;
	writable.getNode = vi.fn(() => testNode);
	writable.helpers = { httpRequestWithAuthentication };

	return { mockThis, getNodeParameter, getCredentials, httpRequestWithAuthentication };
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
		authentication: 'token',
		ticketType: 55,
		category: 'category-guid',
		subject: 'Printer is on fire',
		descriptionHTML: '<p>Flames everywhere</p>',
		impact: 2,
		urgency: 3,
		priority: 4,
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
		expect(credentialType).toBe('matrix42TokenApi');
		expect(options).toEqual({
			headers: { 'Content-Type': 'application/json' },
			method: 'POST',
			body: {
				Category: 'category-guid',
				Subject: 'Printer is on fire',
				state: 100,
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
		expect(getCredentials).toHaveBeenCalledWith('matrix42TokenApi');
	});

	it('uses the matrix42BasicApi credential type when authentication is "basic"', async () => {
		const { mockThis, getCredentials, httpRequestWithAuthentication } = buildMockThis({
			...baseParams,
			authentication: 'basic',
		});

		await createTicket.call(mockThis, 0);

		expect(getCredentials).toHaveBeenCalledWith('matrix42BasicApi');
		expect(callArgs(httpRequestWithAuthentication)[0]).toBe('matrix42BasicApi');
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
			expect(lookupCredentialType).toBe('matrix42TokenApi');
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
			expect(body.state).toBe(100);
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
});

// ---------------------------------------------------------------------------
// closeTicket
// ---------------------------------------------------------------------------

describe('closeTicket', () => {
	const baseParams: ParamMap = {
		authentication: 'token',
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
		expect(credentialType).toBe('matrix42TokenApi');
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
		authentication: 'token',
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
		expect(credentialType).toBe('matrix42TokenApi');
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
		authentication: 'token',
		ticketEoid: 'ticket-eoid-3',
		comments: 'A journal comment',
		entryType: 1,
		creator: 'creator-guid',
		visibleInPortal: true,
	};

	it('POSTs to /journal/Add, parsing Parameters/FileIds to arrays and sending IsFromEditDialog (corrected spelling)', async () => {
		const { mockThis, httpRequestWithAuthentication } = buildMockThis({
			...baseParams,
			additionalFields: {
				typeId: 'type-guid',
				publish: true,
				fileIds: '["file-1","file-2"]',
				parameters: '[{"Name":"Priority","Value":"High"}]',
				isFromEditDialog: true,
			},
		});

		await addJournalEntry.call(mockThis, 0);

		expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(1);
		const [credentialType, options] = callArgs(httpRequestWithAuthentication);
		expect(credentialType).toBe('matrix42TokenApi');
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
				TypeId: 'type-guid',
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
			additionalFields: { typeId: 'only-type-guid', publish: false, parameters: '' },
		});

		await addJournalEntry.call(mockThis, 0);

		const body = callArgs(httpRequestWithAuthentication)[1].body as Record<string, unknown>;
		expect(body.TypeId).toBe('only-type-guid');
		expect('FileIds' in body).toBe(false);
		// parameters '' parses to []
		expect(body.Parameters).toEqual([]);
	});

	describe('parseJsonArray branches for Parameters/FileIds', () => {
		it('wraps a JSON object string into a single-element array', async () => {
			const { mockThis, httpRequestWithAuthentication } = buildMockThis({
				...baseParams,
				additionalFields: { parameters: '{"key":"value"}' },
			});

			await addJournalEntry.call(mockThis, 0);

			const body = callArgs(httpRequestWithAuthentication)[1].body as Record<string, unknown>;
			expect(body.Parameters).toEqual([{ key: 'value' }]);
		});

		it('passes an already-array value through unchanged', async () => {
			const { mockThis, httpRequestWithAuthentication } = buildMockThis({
				...baseParams,
				additionalFields: { parameters: [1, 2, 3], fileIds: ['a', 'b'] },
			});

			await addJournalEntry.call(mockThis, 0);

			const body = callArgs(httpRequestWithAuthentication)[1].body as Record<string, unknown>;
			expect(body.Parameters).toEqual([1, 2, 3]);
			expect(body.FileIds).toEqual(['a', 'b']);
		});

		it('wraps a non-array object value into a single-element array', async () => {
			const { mockThis, httpRequestWithAuthentication } = buildMockThis({
				...baseParams,
				additionalFields: { parameters: { a: 1 } },
			});

			await addJournalEntry.call(mockThis, 0);

			const body = callArgs(httpRequestWithAuthentication)[1].body as Record<string, unknown>;
			expect(body.Parameters).toEqual([{ a: 1 }]);
		});

		it('throws a descriptive error when Parameters is a non-JSON string', async () => {
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
