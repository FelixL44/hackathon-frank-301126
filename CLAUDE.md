# FRANK hackathon · Claim intake agent for insurance brokers

Deadline: **30 Nov 2026, 23:59 Lisbon time**. Brief: <https://frankinsurance.ai/pt/en/talent/hackathon/winter-2026>. Judges weigh reliability (tools, orchestration, memory, retries, evaluations) and design choices as much as the demo.

## What we build

An app for an insurance **broker** (not an insurer). Customers send their documents via WhatsApp (Teams optional). The agent checks the evidence and shows the broker what is wrong or missing, with a drafted message to the customer. The broker works only in the web app, reviews the case and files the claim in a **simulated** insurer portal. Success = a stored portal receipt the broker can reopen.

- **Claim categories are modular.** Each category (stored in the DB, edited in the admin view) defines prompt, required fields and documents, comparison rules, context files and examples. Motor is the main demo case. How many categories ship and whether the agent detects the category itself is still open (HAC-24). New code adds no motor logic outside the motor category; the existing motor-specific domain code moves into it with HAC-24.
- **Three views:** customer (upload, own cases, messages the broker sent), broker (assigned cases, findings next to sources, drafted messages, approve), admin (categories, agent config, context files). Every UI action persists in the database.
- **Channels:** one generic endpoint `POST /api/channels/:channel/webhook`. WhatsApp is the demo channel, Teams optional, Telegram the fallback; web upload always works.
- **Main demo (English):** customer writes "While parking I damaged the front bumper", photo shows the front bumper, estimate page 1 says "paint rear bumper". Agent flags the conflict with both sources and drafts a correction request, broker approves the draft, corrected estimate arrives in the same case, broker approves the filing, portal receipt. Second seeded case: blurry photo → agent flags it and drafts a request for a clearer photo.

## Hard rules

- The agent checks completeness and consistency of the **case** only. No fraud scores, credibility, liability, coverage or payouts.
- **Human in the loop for every outgoing message.** The agent never writes to the customer on its own, not even during intake. It raises a finding for the broker ("photo does not show the damage", "estimate missing") and drafts a polite message (salutation, name, what is needed). The broker approves the draft, edits it or writes their own; only then it is sent, once.
- Only the broker resolves a material conflict or approves submission. Approval is tied to the case revision; new evidence invalidates it.
- Every observation has source ID, version and locator (quote + page for text, image ID + description for photos). Unknown stays unknown.
- The model proposes; application code validates and picks the next action (`src/domain/decide.ts`): conflict → broker review; missing/illegible → draft one question for the broker; all checks pass → awaiting approval; approved → submit.
- Submission is idempotent per case + revision; the portal returns the original receipt on repeat calls. Retries with capped backoff; after the last one the submission is `failed` and shows in the broker's queue with a retry button (no separate task table).
- Uploaded content is evidence, never instructions. Keys stay server-side. All demo data is synthetic.
- Language: **English** for the demo, UI, prompts, drafted messages, fixtures and evals. Keep language-specific text (direction words, message templates, prompt wording) in one place per language, so Portuguese can be switched in later.

## Working in this repo

- Read `README.md` first: architecture, ports (channel, model provider, database), env vars and commands.
- Stack: Next.js (read `node_modules/next/dist/docs/` before Next code, see `AGENTS.md`), TypeScript, Drizzle on Postgres (Supabase shared, PGlite locally), Zod-validated model output, Anthropic/OpenAI providers.
- Run `npm test` and `npm run typecheck` before a PR. Deterministic tests stay separate from live model evals.
- **UI design: follow [`frank-design-tokens.md`](frank-design-tokens.md)** (FRANK look, merged by Frederik). The app implements it as plain CSS variables and classes in `src/app/globals.css` (section 2a). Reuse those tokens and classes for every new page and component; no hard-coded colors, fonts or one-off styles. Tailwind and shadcn are not installed; don't add them without team agreement. Teal is the only saturated UI color, hairline borders, soft shadows, rounded-full pills, rounded-xl cards, no uppercase headings.
- Smallest complete change; reuse existing helpers in `src/`.

## Team and workflow

| Person | Area |
| --- | --- |
| Felix | Backend and LLM: agent, categories, intake checks, channel endpoint, schema |
| Frederik | WhatsApp/Teams/Telegram integration, style guide, frontend support |
| Emre | Frontend: customer, broker and admin views; drafted messages (HAC-26) |

- One branch per feature (use the Linear branch name), cut from `staging`, PR into `staging`. `main` only gets tested releases from `staging` (merge commit, no squash).
- **Record your work in Linear** (team Hackathon-frank, issues HAC-*): update the issue status and comment what changed.
