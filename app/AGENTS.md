# AGENTS.md — catalog app

Guidance for an Agentic IDE working inside `app/`.

## Stack

- TypeScript (ES2022, NodeNext modules), Node 22+
- vitest for tests, colocated as `*.test.ts`
- No framework, no runtime dependencies — this is a plain domain library

## Commands

```bash
npm install
npm test          # vitest run
npm run typecheck # tsc, no emit
npm run build     # tsc -> dist/  (needed before mcp-server/ can import it)
```

## Architecture

- `data/catalog.json` — the seeded product data (synthetic, 24 items).
- `src/catalog.ts` — **pure** functions over a `Product[]` passed in. No I/O.
- `src/loader.ts` — the only file that touches the filesystem (`loadCatalog`).
- `src/index.ts` — public surface; everything external imports from here.

The split is deliberate: pure logic stays trivially testable, and the MCP
server in `mcp-server/` imports the same functions rather than reimplementing
them.

## Conventions

- Named exports only, no default exports.
- No `any`. Prefer `unknown` plus narrowing if a type is genuinely open.
- Keep `src/catalog.ts` free of imports from `node:*` — it must stay pure.
- Every exported function gets a colocated test case in `src/catalog.test.ts`.
- Import paths carry the `.js` extension (NodeNext), even from `.ts` sources.

## Guardrails

- **Do not change the signatures** of the exported catalog functions —
  `mcp-server/` depends on them, and so does the graded homework.
- **Do not edit `data/catalog.json`.** The A/B exercise in Task D compares
  against the seeded numbers; changing the data invalidates it.
- Never add real business data, PII, or secrets here. Everything is synthetic
  on purpose.

## MCPs

`.mcp.json` (repo root) connects three MCP servers — two public, one our own:

- **filesystem** (public, `@modelcontextprotocol/server-filesystem`) — read the
  catalog files. Configured for `app/data`, but Claude Code's roots widen it to
  the repo root. Its write tools are denied in `.claude/settings.json`; never
  use it to modify `data/catalog.json`.
- **memory** (public, `@modelcontextprotocol/server-memory`) — knowledge-graph
  notes, persisted in `<repo>/.mcp-memory.jsonl` (gitignored), so they survive
  across sessions. Delete the file to reset.
- **catalog** (own, `mcp-server/`) — read-only tools `search_inventory`,
  `check_stock`, `low_stock`, `catalog_summary` and resource
  `catalog://summary`, built on this library's exported functions. Prefer it
  for catalog questions; it needs `npm run build` here first.

See `docs/mcp/servers.md` for scope rationale and `docs/mcp/SECURITY.md` for
the threat model.
