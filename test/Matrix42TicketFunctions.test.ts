import { beforeEach, describe, expect, it, test, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { IExecuteFunctions, IHttpRequestOptions } from 'n8n-workflow';

import {
	addJournalEntry,
	closeTicket,
	createTicket,
	transformTicket,
} from '../nodes/Matrix42/Matrix42TicketFunctions';

const SERVER_URL = 'https://m42.example.com';
const BASE_URL = `${SERVER_URL}/m42Services/api`;

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
 * getNodeParameter('authentication', 0), awaits getCredentials(<credentialType>)
 * for { serverUrl } and finally calls helpers.httpRequestWithAuthentication.
 */
function buildMockThis(params: ParamMap): MockContext {
	const mockThis: IExecuteFunctions = mock<IExecuteFunctions>();

	const getNodeParameter = vi.fn(
		(name: string, _index: number, fallback?: unknown): unknown => {
			if (Object.prototype.hasOwnProperty.call(params, name)) {
				return params[name];
			}
			return fallback;
		},
	);
	const getCredentials = vi.fn().mockResolvedValue({ serverUrl: SERVER_URL });
	const httpRequestWithAuthentication = vi.fn().mockResolvedValue({});

	mockThis.getNodeParameter =
		getNodeParameter as unknown as IExecuteFunctions['getNodeParameter'];
	mockThis.getCredentials =
		getCredentials as unknown as IExecuteFunctions['getCredentials'];
	mockThis.helpers = {
		httpRequestWithAuthentication,
	} as unknown as IExecuteFunctions['helpers'];

	return { mockThis, getNodeParameter, getCredentials, httpRequestWithAuthentication };
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe('createTicket', () => {
	const baseParams: ParamMap = {
		authentication: 'token',
		ticketType: 55,
		category: 'category-guid',
		subject: 'Printer is on fire',
		descriptionHTML: '<p>Flames everywhere</p>',
		impact: 2,
		urgency: 3,
		responsibleRole: 'role-guid',
		creator: 'creator-guid',
		user: 'user-guid',
		responsibleUser: 'responsible-user-guid',
		priority: 4,
		sla: 'sla-guid',
	};

	it('POSTs to /ticket/create with the ticket body, activityType query string and fixed state/EntryBy values', async () => {
		const { mockThis, httpRequestWithAuthentication } = buildMockThis(baseParams);
		httpRequestWithAuthentication.mockResolvedValue('new-ticket-eoid');

		const result = await createTicket.call(mockThis, 0);

		expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(1);
		const [credentialType, options] = httpRequestWithAuthentication.mock.calls[0] as [
			string,
			IHttpRequestOptions,
		];
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

	it('reads all ticket parameters for the given item index and resolves credentials for the token credential type', async () => {
		const { mockThis, getNodeParameter, getCredentials } = buildMockThis(baseParams);

		await createTicket.call(mockThis, 3);

		for (const name of [
			'ticketType',
			'category',
			'subject',
			'descriptionHTML',
			'impact',
			'urgency',
			'responsibleRole',
			'creator',
			'user',
			'responsibleUser',
			'priority',
			'sla',
		]) {
			expect(getNodeParameter).toHaveBeenCalledWith(name, 3);
		}
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
		expect(httpRequestWithAuthentication.mock.calls[0][0]).toBe('matrix42BasicApi');
	});

	it('looks up the priority mapping via GET (without a request body) when priority is -1 and uses the first mapped PriorityValue', async () => {
		const { mockThis, httpRequestWithAuthentication } = buildMockThis({
			...baseParams,
			priority: -1,
		});
		httpRequestWithAuthentication
			.mockResolvedValueOnce([{ PriorityValue: 1 }, { PriorityValue: 9 }])
			.mockResolvedValueOnce('created-eoid');

		const result = await createTicket.call(mockThis, 0);

		expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(2);

		const [lookupCredentialType, lookupOptions] = httpRequestWithAuthentication.mock
			.calls[0] as [string, IHttpRequestOptions];
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

		const createOptions = httpRequestWithAuthentication.mock.calls[1][1] as IHttpRequestOptions;
		expect(createOptions.method).toBe('POST');
		expect(createOptions.url).toBe(`${BASE_URL}/ticket/create`);
		expect((createOptions.body as { Priority: number }).Priority).toBe(1);

		expect(result).toEqual([{ ticketEoid: 'created-eoid' }]);
	});

	it('falls back to Priority 2 when priority is -1 and the mapping lookup returns a falsy response', async () => {
		const { mockThis, httpRequestWithAuthentication } = buildMockThis({
			...baseParams,
			priority: -1,
		});
		httpRequestWithAuthentication
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce('created-eoid');

		await createTicket.call(mockThis, 0);

		const createOptions = httpRequestWithAuthentication.mock.calls[1][1] as IHttpRequestOptions;
		expect((createOptions.body as { Priority: number }).Priority).toBe(2);
	});

	// BUG: createTicket only falls back to Priority 2 when the lookup response is
	// falsy. An empty array is truthy, so `calculatedPriority[0].PriorityValue`
	// throws "TypeError: Cannot read properties of undefined" instead of
	// defaulting when no mapping rows match the given impact/urgency.
	test.todo(
		'should fall back to Priority 2 when the priority mapping lookup returns an empty array (currently throws a TypeError)',
	);
});

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
		const [credentialType, options] = httpRequestWithAuthentication.mock.calls[0] as [
			string,
			IHttpRequestOptions,
		];
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

describe('transformTicket', () => {
	const baseParams: ParamMap = {
		authentication: 'token',
		ticketEoid: 'ticket-eoid-2',
		sourceTypeName: 'SPSActivityTypeIncident',
		targetTypeName: 'SPSActivityTypeServiceRequest',
		category: 'category-guid',
		sla: 'sla-guid',
		ola: 'ola-guid',
		recipientRole: 'recipient-role-guid',
	};

	it('POSTs to /ticket/transform with the transformation body and an empty query string', async () => {
		const { mockThis, httpRequestWithAuthentication } = buildMockThis(baseParams);

		await transformTicket.call(mockThis, 0);

		expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(1);
		const [credentialType, options] = httpRequestWithAuthentication.mock.calls[0] as [
			string,
			IHttpRequestOptions,
		];
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

	it('returns [{ Message: "Success" }] regardless of the API response payload', async () => {
		const { mockThis, httpRequestWithAuthentication } = buildMockThis(baseParams);
		httpRequestWithAuthentication.mockResolvedValue('ignored');

		const result = await transformTicket.call(mockThis, 2);

		expect(result).toEqual([{ Message: 'Success' }]);
	});
});

describe('addJournalEntry', () => {
	const baseParams: ParamMap = {
		authentication: 'token',
		ticketEoid: 'ticket-eoid-3',
		comments: 'A journal comment',
		entryType: 1,
		creator: 'creator-guid',
		visibleInPortal: true,
	};

	it('POSTs to /journal/Add including TypeId and FileIds when all additionalFields are provided', async () => {
		const { mockThis, httpRequestWithAuthentication } = buildMockThis({
			...baseParams,
			additionalFields: {
				typeId: 'type-guid',
				publish: true,
				fileIds: 'file-1,file-2',
				parameters: '{"key":"value"}',
				isFormEditDialog: false,
			},
		});

		await addJournalEntry.call(mockThis, 0);

		expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(1);
		const [credentialType, options] = httpRequestWithAuthentication.mock.calls[0] as [
			string,
			IHttpRequestOptions,
		];
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
				Parameters: '{"key":"value"}',
				IsFormEditDialog: false,
				TypeId: 'type-guid',
				FileIds: 'file-1,file-2',
			},
			qs: {},
			url: `${BASE_URL}/journal/Add`,
			json: true,
			skipSslCertificateValidation: false,
		});
	});

	it('defaults additionalFields to {} and omits TypeId/FileIds while still sending undefined Publish/Parameters/IsFormEditDialog keys', async () => {
		const { mockThis, getNodeParameter, httpRequestWithAuthentication } =
			buildMockThis(baseParams);

		await addJournalEntry.call(mockThis, 5);

		expect(getNodeParameter).toHaveBeenCalledWith('additionalFields', 5, {});

		const options = httpRequestWithAuthentication.mock.calls[0][1] as IHttpRequestOptions;
		const body = options.body as Record<string, unknown>;

		// conditionally-spread keys are absent entirely
		expect('TypeId' in body).toBe(false);
		expect('FileIds' in body).toBe(false);
		// these keys are always present, but hold undefined when additionalFields is empty
		expect('Publish' in body).toBe(true);
		expect(body.Publish).toBeUndefined();
		expect('Parameters' in body).toBe(true);
		expect(body.Parameters).toBeUndefined();
		expect('IsFormEditDialog' in body).toBe(true);
		expect(body.IsFormEditDialog).toBeUndefined();

		expect(body.ObjectId).toBe('ticket-eoid-3');
		expect(body.Comments).toBe('A journal comment');
		expect(body.EntryType).toBe(1);
		expect(body.Creator).toBe('creator-guid');
		expect(body.VisibleInPortal).toBe(true);
	});

	it('includes only TypeId when typeId is set without fileIds', async () => {
		const { mockThis, httpRequestWithAuthentication } = buildMockThis({
			...baseParams,
			additionalFields: {
				typeId: 'only-type-guid',
				publish: false,
				parameters: '',
				isFormEditDialog: true,
			},
		});

		await addJournalEntry.call(mockThis, 0);

		const options = httpRequestWithAuthentication.mock.calls[0][1] as IHttpRequestOptions;
		const body = options.body as Record<string, unknown>;
		expect(body.TypeId).toBe('only-type-guid');
		expect('FileIds' in body).toBe(false);
	});

	it('returns [{ Message: "Success" }] regardless of the API response payload', async () => {
		const { mockThis, httpRequestWithAuthentication } = buildMockThis(baseParams);
		httpRequestWithAuthentication.mockResolvedValue({ Id: 'journal-entry-id' });

		const result = await addJournalEntry.call(mockThis, 0);

		expect(result).toEqual([{ Message: 'Success' }]);
	});
});
