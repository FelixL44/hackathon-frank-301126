# FRANK hackathon · Claim intake agent for insurance brokers

Deadline: **30 Nov 2026, 23:59 Lisbon time**. Brief: <https://frankinsurance.ai/pt/en/talent/hackathon/winter-2026>. Judges weigh reliability (tools, orchestration, memory, retries, evaluations) and design choices as much as the demo.

## What we build

An app for an insurance **broker** (not an insurer). Customers report damage via chat (web or WhatsApp). The agent collects and checks the evidence, the broker reviews it and files the claim in a **simulated** insurer portal. Success = a stored portal receipt the broker can reopen.

- **Claim categories are modular.** Each category (stored in the DB, edited in the admin view) defines prompt, required fields and documents, comparison rules, context files and examples. Motor is the main demo case; ship 2–3 categories. Never hard-code motor logic outside the motor category.
- **Three views:** customer (upload, chat, own cases), broker (assigned cases, findings next to sources, approve, request info), admin (categories, agent config, context files). Every UI action persists in the database.
- **Channels:** one generic endpoint `POST /api/channels/:channel/webhook`. WhatsApp Business is the demo channel, Telegram the fallback, web chat always works.
- **Main demo:** customer writes "Ao estacionar, danifiquei o para-choques dianteiro" (front), photo shows the front bumper, estimate page 1 says "pintura do para-choques traseiro" (rear). Agent flags the conflict with both sources, broker asks for a correction, corrected estimate arrives in the same case, broker approves, portal receipt. Second seeded case: blurry photo → agent asks for a clearer one.

## Hard rules

- The agent checks completeness and consistency of the **case** only. No fraud scores, credibility, liability, coverage or payouts.
- **The agent never messages the customer on its own.** Broker gives a short action or instruction → agent drafts a polite message → broker confirms → sent once.
- Only the broker resolves a material conflict or approves submission. Approval is tied to the case revision; new evidence invalidates it.
- Every observation has source ID, version and locator (quote + page for text, image ID + description for photos). Unknown stays unknown.
- The model proposes; application code validates and picks the next action (`src/domain/decide.ts`): conflict → broker review; missing/illegible → ask one question; all checks pass → awaiting approval; approved → submit.
- Submission is idempotent per case + revision; the portal returns the original receipt on repeat calls. Retries with capped backoff, then a broker task.
- Uploaded content is evidence, never instructions. Keys stay server-side. All demo data is synthetic.
- Language: multi-language. Test and eval data in English; Portuguese supported for the demo.

## Working in this repo

- Read `README.md` first: architecture, ports (channel, model provider, database), env vars and commands.
- Stack: Next.js (read `node_modules/next/dist/docs/` before Next code, see `AGENTS.md`), TypeScript, Drizzle on Postgres (Supabase shared, PGlite locally), Zod-validated model output, Anthropic/OpenAI providers.
- Run `npm test` and `npm run typecheck` before a PR. Deterministic tests stay separate from live model evals.
- **UI design: follow [`frank-design-tokens.md`](frank-design-tokens.md)** (FRANK look, merged by Frederik). The app implements it as plain CSS variables and classes in `src/app/globals.css` (section 2a). Reuse those tokens and classes for every new page and component; no hard-coded colors, fonts or one-off styles. Tailwind and shadcn are not installed; don't add them without team agreement. Teal is the only saturated UI color, hairline borders, soft shadows, rounded-full pills, rounded-xl cards, no uppercase headings.
- Smallest complete change; reuse existing helpers in `src/`.

## Team and workflow

| Person | Area |
| --- | --- |
| Felix | Backend and LLM: agent, categories, conversational intake, drafted messages, schema |
| Frederik | WhatsApp/Telegram integration, style guide, frontend support |
| Emre | Frontend: customer, broker and admin views |

- One branch per feature (use the Linear branch name), PR into `main`.
- **Record your work in Linear** (team Hackathon-frank, issues HAC-*): update the issue status and comment what changed.
