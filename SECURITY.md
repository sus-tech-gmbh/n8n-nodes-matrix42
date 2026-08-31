# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for a security problem.

Report it through
[GitHub's private vulnerability reporting](https://github.com/sus-tech-gmbh/n8n-nodes-matrix42/security/advisories/new),
which notifies the maintainers privately. If that is unavailable to you, contact
[S&S Technologies GmbH](https://sus-tech.com/en) and mention `n8n-nodes-matrix42` in the subject.

Please include what you can: affected version, configuration, a reproduction, and the impact you
believe it has. We will acknowledge your report, keep you updated while we work on it, and credit
you in the release notes unless you prefer otherwise.

This is a volunteer-maintained community project, so we cannot promise a fixed response time — but
security reports go to the front of the queue.

## Supported versions

The latest published release on npm is the supported one. Fixes are released forward; there are no
long-term support branches.

## What this node is, in security terms

**It is a credentialed integration.** Anything the configured Matrix42 account can do through the
Web Services API, a workflow using this node can do too. The relevant boundary is the account you
configure, not the node:

- Use a Matrix42 account scoped to what your workflows actually need.
- Credentials are stored and encrypted by n8n; this node never logs or returns them.
- **Ignore SSL Issues** disables certificate verification — use it only for self-signed development
  instances, never against production.
