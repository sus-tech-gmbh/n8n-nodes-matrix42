# n8n-nodes-matrix42

[![CI](https://github.com/sus-tech-gmbh/n8n-nodes-matrix42/actions/workflows/ci.yml/badge.svg)](https://github.com/sus-tech-gmbh/n8n-nodes-matrix42/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/n8n-nodes-matrix42.svg)](https://www.npmjs.com/package/n8n-nodes-matrix42)
[![npm downloads](https://img.shields.io/npm/dm/n8n-nodes-matrix42.svg)](https://www.npmjs.com/package/n8n-nodes-matrix42)
[![node](https://img.shields.io/node/v/n8n-nodes-matrix42.svg)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE.md)
[![n8n](https://img.shields.io/badge/n8n-community_node-EA4B71.svg)](https://docs.n8n.io/integrations/community-nodes/)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

This is an n8n community node that integrates with the Matrix42 ESMP Web Services API: tickets, data fragments and objects, data queries, imports, file storage, and a polling trigger.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

| Contents | |
| --- | --- |
| [Installation](#installation) | Install as an n8n community node |
| [Operations](#operations) | All resources, operations and the trigger node |
| [Credentials](#credentials) | Webservice Token and Basic auth setup |
| [Compatibility](#compatibility) | Supported n8n, Node.js and Matrix42 versions |
| [Resources](#resources) | Documentation links |
| [Version History](#version-history) | What changed in each release |
| [Project](#project) | Contributing, code of conduct, security policy, releases |
| [Legal & Disclaimer](#legal--disclaimer) | Trademark and API-usage notes |

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

## Operations

### Data Fragment

- **Get Many** (`getAll`): Retrieve data fragments matching a search expression, with Return All / Limit paging.
- **Create** (`create`): Create a new data fragment in the specified Data Definition.
- **Update** (`update`): Update an existing data fragment.
- **Delete** (`delete`): Delete a data fragment by its ID.

### Data Object

- **Create** (`create`): Create a new object for a Configuration Item.
- **Get** (`get`): Retrieve a single object by its ID.
- **Update** (`update`): Update an existing object.
- **Delete** (`delete`): Delete an object by its ID.

### Data Query

- **Get Data** (`getData`): Read the list items of a data query, with paging and an optional structured **User Filters** body.

### Ticket

- **Create** (`create`): Open a new ticket in the Service Desk, with a selectable initial State.
- **Close** (`close`): Close an Incident or Service Request.
- **Transform** (`transform`): Transform a ticket into another type.
- **Add Journal Entry** (`addJournalEntry`): Add a comment to a ticket, optionally with template parameters (Name/Value/Format rows) and a custom creator.

### Storage

- **Upload** (`upload`): Upload a file and attach it to a Configuration Item.

### Import

- **Execute** (`execute`): Run a predefined import definition to ingest data.

### Matrix42 Trigger

The package also ships a **Matrix42 Trigger** node - a polling trigger that starts workflows when records appear in Matrix42:

- **Ticket Created** (default): fires for every new Service Desk ticket, with an optional ticket-type filter (e.g. only Incidents).
- **Object Created**: same for any data definition, watched through a configurable creation-date attribute.
- **Object Created or Updated**: fires for new and changed records of any class, via the universal `TimeStamp` column.

An ASQL filter, extra output columns, a per-poll limit and a Fetch Full Object option are available under Additional Fields. Output rows include the object ID as `ObjectID`, ready for the ticket operations. On activation the trigger starts from the newest existing record, so historic records never fire; "Fetch Test Event" just returns the newest matching record as a sample.

## Credentials

> **Prerequisite:** You must have access to a running Matrix42 instance with appropriate API permissions.

This node supports two authentication methods. Configure these under **Workflow -> Credentials**.

### Matrix42 Webservice Token Auth

1. **Server URL** - Your Matrix42 server URL (e.g. `https://matrix42.example.com`).
2. **Webservice Token** - Your Matrix42 API Token.
3. **Ignore SSL Issues (Insecure)** - Enable when the server uses a self-signed certificate.

The node exchanges the API Token for a short-lived access token and refreshes it automatically before it expires, then sends it as the Bearer token on every request.

> **Self-signed certificates**: enable **Ignore SSL Issues (Insecure)** on the credential, or add the server's CA certificate to n8n's trusted store (see https://docs.n8n.io/hosting/configuration/configuration-examples/custom-certificate-authority/).

### Matrix42 Basic Auth

1. **Server URL** - As above.
2. **User** and **Password** - Your Matrix42 user credentials.
3. **Ignore SSL Issues (Insecure)** - As above.

## Compatibility

- **n8n**: Node API version 1; built and tested against `n8n-workflow` 2.x. Requires n8n 1.85 or later. Last tested with n8n 2.36.9.
- **Node.js**: v22 or higher.
- **Matrix42 ESMP API**: Last tested against Matrix42 26.1.

## Resources

* [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
* [Matrix42 Web Services](https://help.matrix42.com/030_ESMP/030_INT/Business_Processes_and_API_Integrations/Matrix42_Web_Services_API#Public_API)

## Version History

**0.3.0:**
- New **Matrix42 Trigger** node: polling trigger with Ticket Created (default), Object Created and Object Created or Updated events, server-side type/ASQL filtering and an optional full-object fetch.
- Fixed Webservice Token auth failing once the access token expired (Matrix42 answers HTTP 406, which n8n's built-in refresh never reacts to); the node now refreshes the token itself.
- **Add Journal Entry** reworked: Parameters as Name/Value/Format rows, Creator optional (empty = API user), Type ID validated.
- Matrix42 validation rejections now name the rejected fields instead of a bare "Bad request".

**0.2.1:**
- Wrap runtime execution errors in `NodeApiError` so HTTP status codes surface in the n8n UI.
- Set the codex `nodeVersion` to `1.0`.

**0.2.0:**
- **Breaking (node v2):** the `ASQL` resource was split into **Data Fragment** and **Data Object**, and operations were renamed to the standard CRUD set. Existing workflows must reselect the resource/operation.
- Token auth now performs the documented API-token -> access-token exchange.
- New **Data Query** resource (Get Data with paging and User Filters).
- Ticket **Create**: selectable **State** field and an **Extra Properties** collection for custom attributes.
- **Ignore SSL Issues (Insecure)** toggle and optional **Response Language** field on the credentials.
- **Get Many** (fragments) gained Return All / Limit paging.

**0.1.3:**
- Added Ticket: `addJournalEntry`.

**0.1.2:**
- Added Storage: `uploadFile`.

**0.1.1:**
- Bug fixes.

**0.1.0:**
- Initial release: Data Fragment and Data Object CRUD, Ticket create/close/transform, Import execute; Token and Basic authentication.

## Project

| | |
| --- | --- |
| **Contributing** | [CONTRIBUTING.md](CONTRIBUTING.md) |
| **Code of conduct** | [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) |
| **Security policy** | [SECURITY.md](SECURITY.md) |
| **Releases** | [GitHub releases](https://github.com/sus-tech-gmbh/n8n-nodes-matrix42/releases), published to npm from CI |

## Legal & Disclaimer

This project is an **unofficial, community-maintained integration** for the Matrix42 ESMP **Public API**.  
It uses only documented, publicly available endpoints as described in the official
[Matrix42 Web Services API documentation](https://help.matrix42.com/030_ESMP/030_INT/Business_Processes_and_API_Integrations/Matrix42_Web_Services_API).

Matrix42 **explicitly provides** a Public API and token-based authentication mechanism to support
third-party integrations. This node simply wraps those endpoints for easier use within n8n.
There is **no violation** of Matrix42's licensing or terms of service in doing so.

> **No Affiliation:**  
> This project is **not affiliated with, endorsed, or sponsored by Matrix42 GmbH**.  
> *MATRIX42* and related marks are trademarks of Matrix42 GmbH, used here for identification purposes only.
