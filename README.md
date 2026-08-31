# n8n-nodes-matrix42

[![CI](https://github.com/sus-tech-gmbh/n8n-nodes-matrix42/actions/workflows/ci.yml/badge.svg)](https://github.com/sus-tech-gmbh/n8n-nodes-matrix42/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/n8n-nodes-matrix42.svg)](https://www.npmjs.com/package/n8n-nodes-matrix42)
[![npm downloads](https://img.shields.io/npm/dm/n8n-nodes-matrix42.svg)](https://www.npmjs.com/package/n8n-nodes-matrix42)
[![node](https://img.shields.io/node/v/n8n-nodes-matrix42.svg)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE.md)
[![n8n](https://img.shields.io/badge/n8n-community_node-EA4B71.svg)](https://docs.n8n.io/integrations/community-nodes/)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

This is an n8n community node that integrates with the Matrix42 ESMP Web Services API. It allows you to retrieve and work with Data Fragments from Matrix42 Data Definitions directly in your n8n workflows.

Matrix42’s ESMP API exposes CRUD‑style endpoints for data fragments, supporting OData‑like filtering, column selection, paging, sorting, and more.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

| Contents | |
| --- | --- |
| [Installation](#installation) | Install as an n8n community node |
| [Operations](#operations) | Every resource and operation of the Matrix42 node |
| [Matrix42 Trigger](#matrix42-trigger) | The polling trigger node and its events |
| [Credentials](#credentials) | Webservice Token and Basic auth setup |
| [Compatibility](#compatibility) | Supported n8n, Node.js and Matrix42 versions |
| [Resources](#resources) | Documentation links |
| [Version History](#version-history) | What changed in each release |
| [Project](#project) | Contributing, code of conduct, security policy, releases |
| [Legal & Disclaimer](#legal--disclaimer) | Trademark and API-usage notes |

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

## Operations

This node supports multiple operations across different resources:

### Data Fragment

-   **Get Many** (`getAll`): Retrieve data fragments matching a search expression, with Return All / Limit paging.

-   **Create** (`create`): Create a new data fragment in the specified Data Definition.

-   **Update** (`update`): Update an existing data fragment.

-   **Delete** (`delete`): Delete a data fragment by its ID.


### Data Object

-   **Create** (`create`): Create a new object for a Configuration Item.

-   **Get** (`get`): Retrieve a single object by its ID.

-   **Update** (`update`): Update an existing object.

-   **Delete** (`delete`): Delete an object by its ID.


### Data Query

-   **Get Data** (`getData`): Read the list items of a data query, with Return All / paging (zero-based pages). Uses the `POST` variant so a structured **User Filters** group (`QueryFilterGroup`) can be passed in the body for ad-hoc filtering.

### Ticket

-   **Create** (`create`): Open a new ticket in the Service Desk (with a selectable initial **State**).

-   **Close** (`close`): Close an Incident or Service Request.

-   **Transform** (`transform`): Transform a ticket into another type.

-   **Add Journal Entry** (`addJournalEntry`): Add a journal entry (comment) to a ticket. **Creator** is optional — left empty, the entry is attributed to the API user. Optional template **Parameters** are entered as Name/Value/Format rows; note that Matrix42 only renders such parameters through the localized templates of system-generated entry types, so they have no visible effect on a plain comment entry.

### Storage

-   **Upload** (`upload`): Upload a file and attach it to a Configuration Item.

### Import

-   **Execute** (`execute`): Run a predefined import definition to ingest data.

## Matrix42 Trigger

The package also ships a **Matrix42 Trigger** node — a polling trigger that starts a workflow when objects are created (or created/updated) in Matrix42. It works against any data definition, so "on new ticket" is just the default configuration (`SPSActivityClassBase`), and the same node covers users, assets, or custom classes.

-   **Event**
    -   *Ticket Created* (default) — the common case as a preset: fires for every new Service Desk ticket (`SPSActivityClassBase` via `CreatedDate`, both hardcoded), leaving only the ticket-type filter and the additional fields to configure.
    -   *Object Created* — watches any data definition through a creation-date attribute (default `CreatedDate`; configurable, since not every class has one).
    -   *Object Created or Updated* — watches the universal `TimeStamp` rowversion column, which exists on every data definition and changes on every write. Exactly-once, no configuration needed.
-   **Data Definition** — the watched class, picked from the instance's schema.
-   **Type Filter** — optionally narrow to specific configuration-item types (e.g. only Incidents); filtered server-side, and the dropdown only offers types composed of the selected data definition.
-   **Additional fields** — an ASQL filter (AND-ed server-side), extra output columns, a per-poll limit, and *Fetch Full Object* to attach the complete object (all fragments) to each result.

Behavior notes:

-   Output rows always include the fragment `ID`, the object ID as `ObjectID` (what the ticket operations expect as EOID), the watermark attribute, `DisplayString` and `Expression-TypeID`.
-   On activation the trigger baselines on the newest existing record — historic records never fire.
-   The watermark comes from values the API itself returned (never the local clock), and boundary duplicates are deduplicated by ID, so events are neither lost nor duplicated — including rows created in the same millisecond and backlogs larger than the per-poll limit (they carry over to the next poll).
-   "Fetch Test Event" in the editor returns the newest matching record without touching the trigger's state.
-   A failing configuration (e.g. a missing created-date attribute) fails visibly in the editor and on activation. On an active workflow, a failing poll produces a regular failed execution (feeding any configured error workflow) and polling simply continues — the trigger never dies silently.
-   Known limitation: a row committed by a long-running database transaction (or written by a clock-skewed server) can become visible *below* an already-advanced watermark and is then not picked up. Under normal Service Desk load this does not occur; it can matter next to heavy concurrent imports.

## Credentials

> **Prerequisite:** You must have access to a running Matrix42 instance with appropriate API permissions.

This node supports two authentication methods. Configure these under **Workflow → Credentials**.

### Matrix42 Webservice Token Auth

1.  **Server URL** — Your Matrix42 server URL (e.g. `https://matrix42.example.com`).

2.  **Webservice Token** — Your Matrix42 API Token.

3.  **Ignore SSL Issues (Insecure)** — Enable when the server uses a self‑signed certificate.


On execution, the node:

-   Exchanges the API Token for a short‑lived Bearer (JWT) access token via `GenerateAccessTokenFromApiToken` once per workflow execution, caches it for the duration of the run, and re‑exchanges it automatically shortly before it expires or when the server rejects it (Matrix42 signals a rejected token with HTTP 406, which n8n's built‑in credential refresh does not handle — the node therefore manages the exchange itself).

-   Uses the access token in the `Authorization` header for all subsequent calls.


> **Self‑signed certificates**: enable **Ignore SSL Issues (Insecure)** on the credential, or add the server's CA certificate to n8n's trusted store (see https://docs.n8n.io/hosting/configuration/configuration-examples/custom-certificate-authority/).

### Matrix42 Basic Auth

1.  **Server URL** — As above.

2.  **User** and **Password** — Your Matrix42 user credentials.

3.  **Ignore SSL Issues (Insecure)** — As above.

## Compatibility

-   **n8n**: Node API version 1; built and tested against `n8n-workflow` 2.x. Requires n8n 1.85 or later (uses `NodeConnectionTypes`). Last tested with n8n 2.36.9.

-   **Node.js**: v22 or higher.

-   **Matrix42 ESMP API**: Last tested against Matrix42 26.1.0.1390.

## Resources

* [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
* [Matrix42 Web Services](https://help.matrix42.com/030_ESMP/030_INT/Business_Processes_and_API_Integrations/Matrix42_Web_Services_API#Public_API)

## Version History

**0.3.0:**
- **New: Matrix42 Trigger node** — a polling trigger that starts workflows on Matrix42 changes. Events: **Ticket Created** (default preset — new Service Desk tickets, with a ticket-type filter), **Object Created** (any data definition, watched through a configurable creation-date attribute) and **Object Created or Updated** (the universal `TimeStamp` rowversion; works on every class, exactly-once). Server-side type/ASQL filtering, optional full-object fetch, and watermark semantics built on live-verified API behavior (tick-exact date comparisons, boundary dedup, baseline-on-activation so historic records never fire).
- **Fixed: Webservice Token auth no longer fails after the access token expires** (reported as "auth invalidates itself after one day"). Matrix42 rejects an expired token with HTTP 406 — which n8n's built-in credential refresh (401-only) never picks up — so the node now performs the API-token → access-token exchange itself: once per execution, cached for the run, refreshed shortly before expiry and retried once on 401/406 (also covers server-side token revocation). Other failures are never retried.
- **Add Journal Entry** reworked: **Parameters** is now a Name/Value/Format collection instead of a raw JSON field (the legacy JSON field of saved workflows is still read and validated); **Creator** is optional and, when empty, the entry is attributed to the API user; **Type ID** is validated as a GUID before sending. Documented that template parameters only render on system-generated entry types, not on plain comments.
- Matrix42 validation rejections (400 with empty messages) now name the rejected fields in the error description instead of a bare "Bad request".
- Last tested with n8n 2.36.9.

**0.2.1:**
- Wrap runtime execution errors in `NodeApiError` so HTTP status codes and response context surface in the n8n UI.
- Set the codex `nodeVersion` to `1.0` (schema value, independent of the node's runtime version).

**0.2.0:**
- **Breaking (node v2):** the `ASQL` resource was split into **Data Fragment** and **Data Object**, and operations were renamed to the standard CRUD set (`Get Many`, `Create`, `Update`, `Delete`, `Get`, `Transform`, `Close`, `Add Journal Entry`, `Upload`, `Execute`). Existing workflows using the node must reselect the resource/operation.
- Token auth now performs the documented API‑token → access‑token exchange
- Added an **Ignore SSL Issues (Insecure)** toggle to both credentials.
- Added a **Data Query** resource with **Get Data** (POST-based, paged, with Return All and a structured **User Filters** body).
- Ticket **Create** gained a selectable **State** field (loaded from the instance's activity states; defaults to New/200) and an **Extra Properties** collection for setting arbitrary/custom ticket attributes as name/value pairs.
- Added an optional **Response Language** credential field, sent as the `Explicit-Language` header on every request.
- `Get Many` (fragments) gained **Return All / Limit** paging.

**0.1.3:**
- Added Operations:
	-   Tickets: `addJournalEntry`

**0.1.2:**
- Added Operations:
	-   Storage Operations: `uploadFile`

**0.1.1:**
- Bug Fixes

**0.1.0:**
  - Initial release supporting operations across multiple resources:
    -   Data Fragments: `getFragments`, `addFragment`, `updateFragment`, `deleteFragment`
    -   Data Objects: `addObject`, `getObject`, `updateObject`, `deleteObject`
    -   Tickets: `createTicket`, `closeTicket`, `transformTicket`
    -   Import: `executeImportDefinition`

  - Authentication methods:
    -   Matrix42 Token API (API Token ↔︎ Bearer JWT exchange)
    -   Matrix42 Basic API (HTTP Basic Authentication)
   

## Project

| | |
| --- | --- |
| **Contributing** | [CONTRIBUTING.md](CONTRIBUTING.md) |
| **Code of conduct** | [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) |
| **Security policy** | [SECURITY.md](SECURITY.md) |
| **Releases** | [GitHub releases](https://github.com/sus-tech-gmbh/n8n-nodes-matrix42/releases) · published to npm from CI |

## Legal & Disclaimer

This project is an **unofficial, community-maintained integration** for the Matrix42 ESMP **Public API**.  
It uses only documented, publicly available endpoints as described in the official
[Matrix42 Web Services API documentation](https://help.matrix42.com/030_ESMP/030_INT/Business_Processes_and_API_Integrations/Matrix42_Web_Services_API).

Matrix42 **explicitly provides** a Public API and token-based authentication mechanism to support
third-party integrations. This node simply wraps those endpoints for easier use within n8n.
There is **no violation** of Matrix42’s licensing or terms of service in doing so.

> **No Affiliation:**  
> This project is **not affiliated with, endorsed, or sponsored by Matrix42 GmbH**.  
> *MATRIX42* and related marks are trademarks of Matrix42 GmbH, used here for identification purposes only.
