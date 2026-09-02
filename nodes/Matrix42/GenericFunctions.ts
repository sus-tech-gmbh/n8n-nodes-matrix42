import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	IPollFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

interface Matrix42Credentials {
	serverUrl: string;
	webserviceToken?: string;
	allowUnauthorizedCerts?: boolean;
	explicitLanguage?: string;
}

type Matrix42Context = IHookFunctions | IExecuteFunctions | ILoadOptionsFunctions | IPollFunctions;

interface CachedAccessToken {
	accessToken: string;
	/** Epoch ms after which the token must not be reused. */
	expiresAt: number;
}

/** Refresh the access token this long before its actual expiry. */
const EXPIRY_BUFFER_MS = 60_000;

/** Fallback lifetime when the token's expiry cannot be read from the JWT. */
const FALLBACK_LIFETIME_MS = 5 * 60_000;

/**
 * Per-execution access-token cache, keyed on the execution context itself.
 *
 * Matrix42 rejects an expired or invalid Bearer token with HTTP 406 — never 401 —
 * so n8n's built-in `expirable` credential refresh (which only reacts to 401)
 * cannot renew the token stored by the credential's preAuthentication. The node
 * therefore performs the documented API-token → access-token exchange itself.
 * The WeakMap scopes each token to one execution (or loadOptions call) and is
 * garbage-collected with the context, so no token outlives the run that minted it.
 */
const accessTokenCache = new WeakMap<object, CachedAccessToken>();

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

/** Reads the `exp` claim of a JWT as epoch ms, or undefined when it cannot be parsed. */
function decodeJwtExpiryMs(token: string): number | undefined {
	try {
		const payload = JSON.parse(
			Buffer.from(token.split('.')[1], 'base64url').toString('utf8'),
		) as { exp?: unknown };
		if (typeof payload.exp === 'number' && Number.isFinite(payload.exp)) {
			return payload.exp * 1000;
		}
	} catch {
		// fall through to undefined — caller applies the fallback lifetime
	}
	return undefined;
}

interface Matrix42Response {
	statusCode: number;
	body: unknown;
	/** The thrown error, when the runtime surfaced the status as a throw. */
	raw?: JsonObject;
}

/**
 * Sends a request and always resolves with `{ statusCode, body }`, whether the
 * runtime supports `ignoreHttpStatusErrors` (returns non-2xx as data) or is an
 * older n8n that throws on non-2xx (the status is then read from the error).
 * Errors without an HTTP status (network, DNS, TLS) are wrapped in NodeApiError.
 */
async function matrix42RawRequest(
	this: Matrix42Context,
	options: IHttpRequestOptions,
): Promise<Matrix42Response> {
	try {
		const response = (await this.helpers.httpRequest({
			...options,
			returnFullResponse: true,
			ignoreHttpStatusErrors: true,
		})) as { statusCode: number; body: unknown };
		return { statusCode: response.statusCode, body: response.body };
	} catch (error) {
		const thrown = error as {
			response?: { status?: number; data?: unknown };
			httpCode?: string | number;
		};
		const statusCode = Number(thrown?.response?.status ?? thrown?.httpCode);
		if (Number.isFinite(statusCode) && statusCode > 0) {
			return { statusCode, body: thrown?.response?.data, raw: error as JsonObject };
		}
		throw new NodeApiError(this.getNode(), error as JsonObject);
	}
}

/**
 * Returns a valid access token for the given credentials, minting one through
 * `GenerateAccessTokenFromApiToken` when the context has none cached (or on
 * `forceRefresh`, used after the server rejected the current token).
 */
async function getAccessToken(
	this: Matrix42Context,
	credentials: Matrix42Credentials,
	forceRefresh = false,
): Promise<string> {
	const cached = accessTokenCache.get(this);
	if (!forceRefresh && cached && cached.expiresAt - EXPIRY_BUFFER_MS > Date.now()) {
		return cached.accessToken;
	}

	const response = await matrix42RawRequest.call(this, {
		method: 'POST',
		url: `${normalizeServerUrl(credentials.serverUrl)}/m42Services/api/ApiToken/GenerateAccessTokenFromApiToken`,
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${credentials.webserviceToken}`,
		},
		body: {},
		json: true,
		skipSslCertificateValidation: credentials.allowUnauthorizedCerts === true,
	});

	const rawToken =
		response.statusCode >= 200 && response.statusCode < 300
			? (response.body as { RawToken?: string } | undefined)?.RawToken
			: undefined;
	if (!rawToken) {
		throw new NodeApiError(
			this.getNode(),
			(response.raw ?? (response.body as JsonObject) ?? {}) as JsonObject,
			{
				message: `Matrix42 rejected the access-token exchange (HTTP ${response.statusCode})`,
				description:
					'Check the Webservice Token and Server URL on the Matrix42 credential. The token may have been revoked or expired.',
				httpCode: String(response.statusCode),
			},
		);
	}

	accessTokenCache.set(this, {
		accessToken: rawToken,
		expiresAt: decodeJwtExpiryMs(rawToken) ?? Date.now() + FALLBACK_LIFETIME_MS,
	});
	return rawToken;
}

export async function matrix42ApiRequest(
	this: Matrix42Context,
	method: IHttpRequestMethods,
	endpoint: `/${string}`,
	body: object,
	query?: IDataObject,
	uri?: string,
	contentType: string = 'application/json',
): Promise<any> {
	const authenticationMethod = this.getNodeParameter('authentication', 0) as string;
	const credentialType = authenticationMethod === 'basic' ? 'matrix42BasicApi' : 'matrix42TokenApi';
	const credentials = await this.getCredentials<Matrix42Credentials>(credentialType);
	const { serverUrl, allowUnauthorizedCerts, explicitLanguage } = credentials;

	const isJson = contentType?.toLowerCase().includes('application/json');
	const hasBody =
		method !== 'GET' && method !== 'HEAD' && body != null && Object.keys(body).length > 0;

	const headers: IDataObject = {
		'Content-Type': contentType,
	};
	// Optional response-language header, configured on the credential (empty = not sent).
	if (explicitLanguage) {
		headers['Explicit-Language'] = explicitLanguage;
	}

	const options: IHttpRequestOptions = {
		headers,
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

	if (authenticationMethod === 'basic') {
		return await this.helpers.httpRequestWithAuthentication.call(this, credentialType, options);
	}

	// Token auth: the node manages the API-token → access-token exchange itself,
	// because Matrix42 signals a rejected token with 406 and n8n's credential
	// refresh only reacts to 401 (see accessTokenCache above).
	const sendWithToken = async (accessToken: string) =>
		await matrix42RawRequest.call(this, {
			...options,
			headers: { ...headers, Authorization: `Bearer ${accessToken}` },
		});

	let response = await sendWithToken(await getAccessToken.call(this, credentials));

	// One retry with a freshly minted token — covers a token that expired during a
	// long run and a token revoked server-side. Never retries other failures, so
	// non-idempotent operations (e.g. ticket create) are not replayed.
	if (response.statusCode === 401 || response.statusCode === 406) {
		response = await sendWithToken(await getAccessToken.call(this, credentials, true));
	}

	if (response.statusCode >= 200 && response.statusCode < 300) {
		return response.body;
	}

	const isAuthFailure = response.statusCode === 401 || response.statusCode === 406;
	throw new NodeApiError(
		this.getNode(),
		(response.raw ?? (response.body as JsonObject) ?? {}) as JsonObject,
		{
			message: `Matrix42 request failed (HTTP ${response.statusCode})`,
			description: isAuthFailure
				? 'Matrix42 rejected the access token even after refreshing it. Check that the Webservice Token is still valid and its account has API access.'
				: describeResponseBody(response.body),
			httpCode: String(response.statusCode),
		},
	);
}

/**
 * Renders an error-response body for the error description. Matrix42's model-binding
 * rejections come as `[{ "Name": "entryInfo.Creator", "Message": "" }]` — with the
 * messages usually empty — so the field names are the only usable diagnostic and are
 * called out explicitly instead of leaving the user with a bare "Bad request".
 */
function describeResponseBody(body: unknown): string | undefined {
	if (
		Array.isArray(body) &&
		body.length > 0 &&
		body.every((entry) => entry !== null && typeof entry === 'object' && 'Name' in entry)
	) {
		const fields = (body as Array<{ Name: unknown; Message?: unknown }>).map((entry) => {
			const message = String(entry.Message ?? '').trim();
			return message ? `${String(entry.Name)} (${message})` : String(entry.Name);
		});
		return `The server rejected the following field(s): ${fields.join(', ')}`;
	}
	if (typeof body === 'string') return body;
	if (body !== undefined && body !== null) return JSON.stringify(body);
	return undefined;
}
