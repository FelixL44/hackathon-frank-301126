# Motor claim intake agent

FRANK Software Engineer hackathon, winter 2026 (deadline: 30 Nov 2026, 23:59 Lisbon time).

A broker-facing app for a Portuguese insurance broker. It takes a customer's motor damage report (message, photos, workshop estimate) and builds a claim file. It asks for missing evidence, shows material discrepancies to the broker and files an approved report in a simulated insurer portal. The run finishes with a stored claim reference that the broker can reopen.

The agent checks whether the **case** is complete and consistent. It does not score customer credibility, decide on fraud, liability or coverage, or calculate payouts.

> **Status:** pre-implementation. Commands below marked *(planned)* do not work yet. They are verified and the marker is removed as each part lands.

## Demo scenario

1. The customer writes: "Ao estacionar, danifiquei o para-choques dianteiro." A photo shows a scratched **front** bumper.
2. Page 1 of the workshop estimate says "pintura do para-choques **traseiro**" (rear).
3. The agent flags the front/rear conflict, cites both sources and pauses.
4. The broker requests clarification, and a corrected estimate arrives in the same case. The original estimate is kept.
5. The broker approves the current revision. The simulated portal returns a receipt.

A second seeded case with a blurry photo shows how ambiguity changes the next action: the agent asks for a clearer photo.

## Architecture

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

Extraction goes through the [Vercel AI SDK](https://ai-sdk.dev) with `generateObject` and a Zod schema, so every provider returns the same validated structure:

| `MODEL_PROVIDER` | Covers |
| --- | --- |
| `anthropic` | Claude models |
| `openai` | OpenAI models |
| `openai-compatible` | Local or self-hosted models through `MODEL_BASE_URL` (Ollama, LM Studio, vLLM, Azure OpenAI and others) |

- PDFs are rendered to page images, and their text layer is extracted on the server. This works for any model that accepts images, and every quote gets a stable page locator.
- Every model call records the provider, model ID and prompt version on the case event.
- The evaluation suite can be run per provider to compare routing and evidence-link accuracy.
- Keys stay on the server. For the hackathon there is one model configuration per deployment. Per-tenant keys stored encrypted in the database come later.

### 3. Database and storage

- **PostgreSQL** is the only SQL dialect, configured through `DATABASE_URL`. It runs on any Postgres host: local Docker, Supabase, Neon, AWS RDS, Azure.
- If `DATABASE_URL` is not set, the app uses in-process **PGlite** for tests and zero-setup local runs.
- The ORM and migrations are **Drizzle**. All queries live in `src/db/`.
- Several dialects (MySQL, SQLite, MongoDB) are deliberately not supported. Reliability depends on transactions, unique constraints, row locks and JSONB, and every extra dialect would multiply the test matrix. Swapping the repository layer later stays possible.
- **Object storage** is selected through `STORAGE_DRIVER=local|s3`. Any S3-compatible service works: AWS S3, Cloudflare R2, MinIO, Supabase Storage.

### Simulated services

The demo inbox and the insurer portal are **simulated** and labeled as simulated in the UI. The portal stores a receipt per idempotency key and returns the original receipt when the same call is repeated.

## Planned layout

```
src/
  app/                         Next.js pages and API routes
  app/api/channels/[channel]/  inbound webhook endpoint
  app/portal/                  simulated insurer portal
  domain/                      case schema, required fields, decision policy (pure)
  workflow/                    orchestration, outbox, retries
  ports/                       Channel, ModelProvider, ObjectStorage interfaces
  adapters/                    demo-inbox, email, slack, teams, model registry, storage
  db/                          Drizzle schema, migrations, queries
fixtures/                      versioned synthetic cases with expected findings
evals/                         live model evaluation runner and results
```

## Environment variables

| Name | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | no (PGlite fallback) | Postgres connection string |
| `MODEL_PROVIDER` | yes | `anthropic`, `openai` or `openai-compatible` |
| `MODEL_ID` | yes | Model name at that provider |
| `MODEL_BASE_URL` | for `openai-compatible` | For example `http://localhost:11434/v1` for Ollama |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | for that provider | Server-side only |
| `STORAGE_DRIVER` | no (default `local`) | `local` or `s3` |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | for `s3` | Private bucket |
| `SLACK_SIGNING_SECRET`, `SLACK_BOT_TOKEN` | for Slack | Broker notifications |

## Commands *(planned)*

```bash
npm install
npm run db:migrate        # apply Drizzle migrations
npm run db:seed           # load synthetic demo cases
npm run dev               # http://localhost:3000
npm test                  # deterministic workflow tests (fixture-backed, no model)
npm run eval              # live model evaluation on seeded evidence
```

## Evaluation

Deterministic workflow tests run separately from live model evaluations. The fixture list and the acceptance criteria are in [CLAUDE.md](CLAUDE.md#evaluation-and-acceptance). Results with counts and denominators will be recorded in `evals/`.

## Demo

- Deployed app: *TBD*
- Video: *TBD*
- Model used: *TBD*
- Known limitations: *TBD*

All messages, vehicle identifiers, photos and estimates are synthetic.
