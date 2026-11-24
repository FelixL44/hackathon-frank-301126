# Motor claim intake agent

FRANK Software Engineer hackathon, winter 2026 (deadline: 30 Nov 2026, 23:59 Lisbon time).

A broker-facing app for a Portuguese insurance broker. It takes a customer's motor damage report (message, photos, workshop estimate) and builds a claim file. It asks for missing evidence, shows material discrepancies to the broker and files an approved report in a simulated insurer portal. The run finishes with a stored claim reference that the broker can reopen.

The agent checks whether the **case** is complete and consistent. It does not score customer credibility, decide on fraud, liability or coverage, or calculate payouts.

> **Status:** vertical slice (HAC-7): a seeded consistent claim goes from intake to approval to a simulated portal receipt, with fixture-backed extraction (no model yet). Commands marked *(planned)* do not work yet.

## Demo scenario

1. The customer writes: "Ao estacionar, danifiquei o para-choques dianteiro." A photo shows a scratched **front** bumper.
2. Page 1 of the workshop estimate says "pintura do para-choques **traseiro**" (rear).
3. The agent flags the front/rear conflict, cites both sources and pauses.
4. The broker requests clarification, and a corrected estimate arrives in the same case. The original estimate is kept.
5. The broker approves the current revision. The simulated portal returns a receipt.

A second seeded case with a blurry photo shows how ambiguity changes the next action: the agent asks for a clearer photo.

## Architecture

### Current flow diagram

An interactive diagram of what is built so far: components, the numbered happy path, guards and open issues. Every box links to its source lines.

- With the app running (`npm run dev`): **<http://localhost:3000/architecture.html>**
- Without it: open [`public/architecture.html`](public/architecture.html) in a browser (`open public/architecture.html` on macOS). GitHub shows only its source.

The file is regenerated with Archify after each larger change; the working files in `.archify/` are not committed.

### Design

One Next.js application serves the broker UI, the orchestration and the simulated portal. The core workflow depends only on three **ports** (interfaces). Each integration is an adapter behind one of them, so a new channel, model or database host does not touch the decision logic.

```
                 ┌────────────── ports ──────────────┐
 Slack / Teams ─▶│ Channel   (inbound + outbound)    │
 Email/Outlook ─▶│                                   │──▶ workflow + decision policy
 Demo inbox    ─▶│ ModelProvider (extraction)        │      (pure, fixture-tested)
                 │ Database / ObjectStorage          │
                 └───────────────────────────────────┘
```

### 1. Channels: customer, workshop and broker messaging

There are two kinds of traffic:

| Traffic | Who | Channels |
| --- | --- | --- |
| Correspondence | Customer, workshop | Demo inbox (MVP), email/Outlook (next) |
| Notifications and actions | Broker | In-app inbox (MVP), Slack, Teams (next) |

Every channel implements the same port:

```ts
interface Channel {
  id: "demo" | "email" | "slack" | "teams";
  // Verify the provider signature, then normalize the payload. Never trust the payload.
  parseInbound(req: Request): Promise<InboundEvent[]>;
  send(msg: OutboundMessage): Promise<{ externalId: string }>;
}
```

- **One inbound endpoint:** `POST /api/channels/:channel/webhook`. The adapter verifies the signature, the event is deduplicated on `(channel, externalEventId)`, and a case-scoped reply token links it to its case. Possible tokens are an email plus-address, a Slack `thread_ts` or a Teams conversation ID. The workflow then recomputes the decision.
- **Outbound through an outbox:** the state change and the pending message are written in one transaction. A worker sends the message, keyed by request ID, so a retry never sends it twice.
- **Inbound content is evidence only.** Text in a message or attachment is never treated as an instruction to the agent.

### 2. Model provider: bring your own AI

The extractor talks to one small port (`src/model/provider.ts`) with two adapters:

| `MODEL_PROVIDER` | Adapter | Covers |
| --- | --- | --- |
| `anthropic` | official `@anthropic-ai/sdk`, structured outputs | Claude (default `claude-opus-5-5`); PDFs as documents, photos as images |
| `openai` | `openai` SDK, JSON-schema response format | OpenAI models |
| `openai-compatible` | same adapter with `MODEL_BASE_URL` | Local or self-hosted servers: Ollama, LM Studio, vLLM, Azure OpenAI |

- The model returns one flat JSON shape; the app validates it with Zod and maps it onto the domain observation.
- **Grounding check:** every quote must occur on the page it names in the PDF's text layer (extracted with `unpdf`, pure JS). Photos need a visual description instead.
- Rejected output goes back to the model with the reasons, at most 3 attempts. After that, or on a refusal or missing file, the case gets an `invalid_extraction` finding and goes to broker review.
- PDFs: Claude receives the file itself plus its text layer; OpenAI-compatible servers receive the text layer only. Scanned PDFs without a text layer therefore need Claude.
- Every extraction event records provider, model, prompt version, attempts and latency. The UI header shows which extractor is active.
- Without `MODEL_PROVIDER` the app uses the fixtures' pre-extracted observations, so it runs without any key.
- Claude requests opt into server-side refusal fallback (`fallbacks: "default"`). Events record the model that actually answered.
- **Daily budget** (`MODEL_DAILY_BUDGET_EUR`, default 1 €): every extraction event stores its cost. Before a new case starts, the app sums today's spend (Lisbon day). Once the budget is reached it uses fixture data and says so in the header. Claude prices are built in, local models cost 0, and OpenAI needs `MODEL_PRICE_USD_PER_MTOK`. The budget is counted per database, so each local PGlite has its own. `npm run model:smoke` is not counted.
- Keys stay on the server. One model configuration per deployment; per-tenant keys come later.

### Comparison rules (`src/domain/compare.ts`)

Only current versions and legible values count. A conflict sends the case to broker review and cites every source involved.

- **Vehicle:** different plates conflict. Case and separators are ignored, so `aa 12bc` equals `AA-12-BC`.
- **Incident date:** different dates conflict.
- **Damaged area:** every area in a photo or estimate must overlap an area in the customer's report (each position is a set of directions: `front_left` overlaps `front` and `left`). A report naming both ends supports either. An `unknown` angle never conflicts. Without areas in the report, the photo is the reference.
- The free-text event description and the policy number are not compared.
- **Resolution:** the broker gives a reason and can name the source that is right (`acceptedSourceId`); only that source's values go into the filing. A resolved conflict stays resolved until its evidence changes version.
- **Grounding:** a quote that names a direction (`dianteiro`, `traseiro`, …) must match the normalized position, or the model must retry.

### Interrupted extraction

Each file's observations, findings and `extract` event are written in one transaction, and the files are extracted in parallel. If the request dies halfway (timeout, restart, redeploy), the case stays in `intake` with the finished files kept. After 3 minutes without activity, the case page offers **Resume extraction**, which reads only the missing files. Two resumes at once still store each file once.

### 3. Database and storage

- **PostgreSQL** is the only SQL dialect, configured through `DATABASE_URL`. It runs on any Postgres host: local Docker, Supabase, Neon, AWS RDS, Azure.
- If `DATABASE_URL` is not set, the app uses in-process **PGlite** for tests and zero-setup local runs.
- The ORM and migrations are **Drizzle**. All queries live in `src/db/`.
- Several dialects (MySQL, SQLite, MongoDB) are deliberately not supported. Reliability depends on transactions, unique constraints, row locks and JSONB, and every extra dialect would multiply the test matrix. Swapping the repository layer later stays possible.
- **Object storage** (`src/storage/objects.ts`): local files now (`fixtures/files/` for synthetic evidence, `.data/objects/` otherwise). An S3-compatible driver (AWS S3, Cloudflare R2, MinIO, Supabase Storage) comes with deployment.

### Simulated services

The demo inbox and the insurer portal are **simulated** and labeled as simulated in the UI. The portal stores a receipt per idempotency key and returns the original receipt when the same call is repeated.

## Layout

```
src/
  app/                         Next.js pages and server actions (inbox, case view, portal receipt)
  domain/                      case schema, decision table, filing preparation (pure, no I/O)
  workflow/                    orchestration: open case, recompute, approve, dispatch
  portal/                      simulated insurer portal (idempotent receipts)
  db/                          Drizzle schema, client, migrate and seed scripts
  extraction/                  prompt, grounding check, model-backed extractor with retry budget
  model/                       provider port + Anthropic and OpenAI(-compatible) adapters, smoke script
  storage/                     evidence file access
  server/                      per-process database handle and extractor selection for Next.js
  app/api/channels/[channel]/  (planned, HAC-11) inbound webhook endpoint
drizzle/                       SQL migrations
fixtures/                      fixture manifest, fixture-backed observations, synthetic evidence files (files/)
evals/                         (planned, HAC-14) live model evaluation runner and results
```

## Environment variables

| Name | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | no (PGlite fallback) | Postgres connection string |
| `PGLITE_DIR` | no (default `.data/pglite`) | PGlite data directory when `DATABASE_URL` is unset; `memory://` for a throwaway DB |
| `MODEL_PROVIDER` | no (fixture data) | `anthropic`, `openai` or `openai-compatible` |
| `MODEL_ID` | for `openai*` | Model name at that provider; Anthropic defaults to `claude-opus-5-5` |
| `MODEL_BASE_URL` | for `openai-compatible` | For example `http://localhost:11434/v1` for Ollama |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | for that provider | Server-side only |
| `MODEL_DAILY_BUDGET_EUR` | no (default `1`) | Model spend per Lisbon day before the app falls back to fixture data |
| `MODEL_PRICE_USD_PER_MTOK` | for `openai` | `<input>,<output>` USD per million tokens from the provider's price list; overrides built-in prices |
| `STORAGE_DRIVER`, `S3_*` | (planned, deployment) | S3-compatible private bucket |
| `SLACK_SIGNING_SECRET`, `SLACK_BOT_TOKEN` | for Slack | Broker notifications |

## Commands

Requires Node.js 24 or newer. Without `DATABASE_URL` everything runs on embedded PGlite, so no database setup is needed.

```bash
npm install
npm run dev               # applies migrations, then http://localhost:3000; start a demo case from the inbox
npm run db:seed           # optional: create the demo cases from the command line
npm test                  # deterministic tests (schema, database, workflow; fixture-backed, no model)
npm run typecheck
npm run build && npm start   # production build
npm run db:migrate        # apply migrations to PGlite or DATABASE_URL
npm run db:generate       # after editing src/db/schema.ts: write a new SQL migration
npm run db:studio         # browse tables at https://local.drizzle.studio (stop the dev server first when on PGlite)
npm run model:smoke -- fixtures/F3/estimate-1.pdf   # live extraction of one evidence file with the configured model (costs tokens)
npm run fixtures:generate # rewrite the synthetic message and estimate files in fixtures/files/
npm run eval              # (planned) live model evaluation on seeded evidence
```

Reset local data with `rm -rf .data`.

## Evaluation

Deterministic workflow tests run separately from live model evaluations. The fixture list and the acceptance criteria are in [CLAUDE.md](CLAUDE.md#evaluation-and-acceptance). Results with counts and denominators will be recorded in `evals/`.

## Demo

- Deployed app: *TBD*
- Video: *TBD*
- Model used: *TBD*
- Known limitations: *TBD*

All messages, vehicle identifiers, photos and estimates are synthetic.
