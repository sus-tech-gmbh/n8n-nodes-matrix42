# Contributing

Thanks for considering a contribution. This is a community project: Matrix42 instances differ
enormously (modules, customizations, versions), and the fastest way this node improves is people
reporting what their instance actually does.

## The two hard rules

**1. Never guess an attribute or endpoint.** Verify against a live instance — the schema endpoints
(`/m42Services/api/Schema/classes`, `/Schema/types`) report what actually exists, and attribute sets
differ per instance. A hardcoded assumption fails with an opaque `500` on the first instance that
lacks it.

**2. Never reproduce Matrix42's copyrighted material.** No Matrix42 source code and no copied
documentation text — link to [docs.matrix42.com](https://docs.matrix42.com) instead. Data read from
a live instance at runtime is fine; it is the user's own data, not something we ship.

## Development

```bash
npm install
npm run build      # clean dist/, compile, copy icons
npm run dev        # tsc --watch
npm run lint
npm test           # vitest unit tests (test/)
```

All of `npm run lint`, `npm test` and `npm run build` must pass before a pull request — CI runs them
on Node 22 and 24 (the dev toolchain needs Node 22+; `n8n-workflow` 2.x pulls in a native module
that does not build on older Node versions).

Unit tests need no Matrix42 instance. For end-to-end testing the repository's parent workspace runs
a local n8n in Docker with the freshly built node auto-loaded; any n8n with
`N8N_CUSTOM_EXTENSIONS` pointing at the built `dist/` works the same way. Test workflow JSON lives
**outside** this repository on purpose — the repo ships only unit tests.

## Branch workflow

Never commit directly to `main` or `dev`. Branch from `dev` (`feature/<topic>` or `fix/<topic>`),
do the work there, and open the pull request against `dev`. `main` only receives release merges.

## Adding an operation

1. Add the operation option and its fields (with `displayOptions`) in the resource's
   `Matrix42<Resource>Operations.ts`.
2. Implement the function in `Matrix42<Resource>Functions.ts`, using `matrix42ApiRequest`.
3. Wire it into the dispatch map in `Matrix42.node.ts`.
4. Add unit tests, and update the Operations list and Version History in `README.md`.

## Reporting a bug well

Include:

- The resource/operation (or trigger event) and the parameters you set.
- The **exact request** the node sent and the **exact response body** — n8n shows both in the
  failed node's output.
- Your Matrix42 version and your n8n version.

Please **redact tokens, hostnames and personal data** before pasting. An API token in a public
issue must be treated as compromised and rotated.
