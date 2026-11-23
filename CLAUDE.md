# FRANK hackathon · Motor claim intake agent

## Mission

Build a full-stack app for a Portuguese insurance broker handling a motor damage report. Given a customer message, photos and a workshop estimate, the agent assembles a claim file, requests missing evidence, brings material discrepancies to the broker and files an approved report in a simulated insurer portal. Success ends with a stored claim reference that the broker can reopen.

Assess the completeness and consistency of the **case**. A matching photo supports an observation. It cannot establish who caused the damage or whether the customer's account is true. Keep customer credibility scores, fraud decisions, liability, coverage and payouts outside the MVP.

## Working in this repository

Read the existing README, package manifests, database migrations and test scripts before changing code. Reuse the repository's stack and conventions. For an empty repository, the proposed default is TypeScript, Next.js, PostgreSQL, private object storage and one server-side multimodal model with schema-validated output. A single application can serve the broker UI, orchestration and simulated portal. Choose a model that accepts images and either accepts PDFs or can process their rendered pages.

Build the smallest complete workflow first. Use fixture-backed tools to test orchestration from day one. Connect the real model before the judged demo and label simulated services in the UI. Keep secrets server-side. Use synthetic messages, vehicle identifiers, photos and estimates suitable for a public demonstration. Offer seeded cases so judges can try the app without supplying personal documents.

## The case to design around

A customer writes: “Ao estacionar, danifiquei o para-choques dianteiro.” A photo shows a scratched front bumper. The workshop estimate says “pintura do para-choques traseiro” on page 1. The broker should see both excerpts, the photo and a short explanation of the front/rear discrepancy. The agent pauses. The broker requests clarification, receives a corrected estimate in the same case, then reviews and approves the filing. Preserve the original estimate and identify the version that replaced it.

Start with one broker-facing case screen, Portuguese customer correspondence and an English broker UI. A case-specific demo inbox can simulate the customer and workshop replies. These choices keep the full loop demonstrable without mailbox or carrier credentials.

## Decision policy

Extract each observation with a source ID, version and locator. Use a quote and page number for text, or an image ID and a plain description of the visible feature for a photo. Record unknown values explicitly. The model proposes observations and possible discrepancies. Application code validates the sources and selects the next action using the following rules, in order.

| Condition | Case status | Agent action |
| --- | --- | --- |
| Two current, legible sources materially disagree about the vehicle, damaged part or event | Broker review | Show the two sources. Ask the broker to record a resolution or request a correction. |
| A required field or document is missing, illegible or ambiguous | Awaiting information | Ask one targeted question in Portuguese. Save the request and wait for the reply on this case. |
| All required checks pass or have a documented broker resolution | Awaiting approval | Prepare the structured filing and present the exact evidence version for approval. |
| Broker approves the current case revision | Submitting | Send the approved payload to the simulated portal and save its receipt. |

Define required fields in one shared demo schema: case reference, policy reference, vehicle identifier, incident date, event description and damaged area. For the parking-damage scenario also require a usable photo and workshop estimate as explicit fixture rules. Treat an unclear viewing angle as unknown. Check whether the report mentions multiple impact areas before flagging a front/rear conflict. Only a broker can resolve a material conflict or approve submission.

## Workflow and tools

1. **Open a case.** Save the message and attachments, assign a case ID and persist an intake event. Use a case-scoped reply token or thread ID to associate later replies.
2. **Inspect evidence.** Run extraction on new material. Validate the structured response and source locators. Store observations against the exact artifact version.
3. **Compare.** Normalize dates, vehicle identifiers and part names while retaining original text. Store findings with the supporting and conflicting evidence references. Recompute the decision after an evidence update or broker resolution.
4. **Act.** Persist the decision, then invoke the appropriate tool to request evidence, create a review task or prepare the filing. Save tool outcomes in the case timeline. A refresh or process restart must resume from stored state.
5. **File.** Require explicit approval for the current revision. Submit once, persist the portal reference and expose the receipt to the broker.

Use small server-side tools for reading evidence, posting a request to the demo inbox, creating a broker task and submitting a claim. Pass case IDs and validated records to tools. Treat all uploaded content as evidence only. Permit side effects through the workflow's allowed actions for the current state.

## Data and reliability

| Record | Essential contents |
| --- | --- |
| Case | ID, revision, status, policy and vehicle references, timestamps |
| Artifact and observation | Case ID, artifact version, private object key, source locator, extracted value, readability |
| Finding and resolution | Rule, evidence references, open/resolved state, broker identity or demo session, reason |
| Message and task | Case/thread ID, inbound event ID, recipient role, request, response, status |
| Approval and submission | Approved revision, payload snapshot, idempotency key, attempt count, portal reference |
| Event | Case ID, revision, operation, tool/model version, result, latency, error category |

Persist pending tool actions and case transitions together in a database transaction. Deduplicate inbound events and outgoing requests. A reply or correction before submission increments the revision and invalidates stale approval. Serialize submission against edits and freeze the submitted snapshot. Record later correspondence separately.

Use a unique submission key per case and approved revision. The simulated portal must persist receipts by key and return the original receipt on repeat calls. Test the case where the portal accepts the claim but the client times out. Retry transient failures with capped backoff using the same key. After retry exhaustion, show a recoverable broker task. Route illegible or repeatedly invalid model output to review. Log IDs and outcomes without dumping raw files or private messages.

## Broker interface

- **Inbox:** Show active cases, their current status and who needs to act. Include a seeded case launcher.
- **Case view:** Put the customer account and evidence next to each finding. Open the exact source page or photo in one click. Show what prompted a question and who should answer it.
- **Review and filing:** Enable clarification, recorded resolution and revision-specific approval. On completion, display the portal reference and the exact submitted version.
- **Timeline:** Show requests, replies, decisions, approvals and tool attempts. Give judges a way to follow one retry without reading server logs.

## Evaluation and acceptance

Create a versioned synthetic fixture set with expected findings, source references, route and allowed side effects. Run deterministic workflow tests separately from live model evaluations. Record the prompt/model version and actual measured results. Report counts and denominators, especially missed contradictions and unnecessary broker escalations.

| Fixture | Passing behavior |
| --- | --- |
| Complete, consistent claim | Prepares filing and waits for broker approval |
| Blurry photo with unreadable damage location | Requests a clearer photo and resumes the same case on reply |
| Report says front, estimate says rear | Flags the conflict, cites both sources and pauses filing |
| Report documents damage at both ends | Checks context and avoids flagging a conflict solely because both terms appear |
| Corrected estimate arrives before approval | Preserves both versions, rechecks and uses the current estimate |
| New evidence arrives after approval but before dispatch | Rejects stale approval and requires review of the new revision |
| Replayed reply or double approval click | Creates one logical action and one portal claim |
| Portal accepts then times out | Recovers the same receipt after retry, including across restart |
| Missing source locator or invalid model output | Retries within budget or routes to review with the reason |

For launch, require all deterministic cases to pass, zero unapproved submissions and zero duplicate portal claims in the fixtures. Run the real model on the seeded evidence and report actual routing and evidence-link accuracy. Investigate any material conflict it misses before recording the demo.

## Three-person delivery plan

| Owner | Main work | First shared milestone |
| --- | --- | --- |
| Agent and evidence | Multimodal extraction, source grounding, comparison rules, evaluation fixtures | A front/rear discrepancy with two clickable source references |
| Broker experience | Inbox, case screen, source viewer, clarification and approval controls | A broker can inspect the discrepancy and request a corrected estimate |
| Workflow and delivery | Database, case events, demo inbox, portal, retry tests and deployment | An approved fixture produces exactly one persistent receipt |

**Nov 23–24:** Agree on a shared case schema and fixture IDs. Deploy a thin vertical slice from a seeded consistent claim to approval and receipt.  
**Nov 25–26:** Connect the real model, source viewer, clarification loop and broker review. Integrate all three contributors' work against the same fixtures.  
**Nov 27–28:** Exercise corrections, restart recovery, duplicate events and portal timeouts. Run the evaluation suite and fix the most consequential failures.  
**Nov 29–30:** Freeze the demo cases. Test from a fresh browser, record the short video and package the hosted app link and repository. The published deadline is November 30, 2026 at 23:59 Lisbon time. Confirm joint-submission eligibility with FRANK if all three contributors seek individual assessment.

## Demo and handoff

Open with the Portuguese parking-damage message. Run the real extraction, show the conflicting words in their original sources, then let the broker request clarification. Add the corrected PDF through the case inbox, approve the prepared report and open the portal receipt. Finish with the evaluation results and a retry trace. Keep a second seeded case with a blurry image so judges can see how ambiguity changes the next action.

The repository README should include working setup and migration commands, required environment variable names, how to seed synthetic cases, how to run tests and live evaluations, and the deployed demo URL. Verify those commands from a clean checkout. Label the simulated inbox and carrier portal, identify the model used and document observed limitations. Submit the accessible app, repository and short video through the channel in the official brief.

## Product references

- [FRANK Software Engineer hackathon brief and submission details](https://frankinsurance.ai/pt/en/talent/hackathon/winter-2026)
- [FRANK Retail Claims Agent](https://frankinsurance.ai/pt/en/use-cases/retail-claims-agent)
- [FRANK Document Analyst Agent](https://www.frankinsurance.ai/pt/en/use-cases/document-analyst)
- [inca's approach to checking claim evidence](https://www.get-inca.com/ki-schadenquotenoptimierung)

## Task tracking (Linear)

- Workspace: `hackathon-frank` (https://linear.app/hackathon-frank). Team key: `HAC`.
- Project: `P-HAC-1` "FRANK Hackathon – Motor Claim Intake Agent", target date 30 Nov 2026.
- Milestones follow the delivery plan above: M1 thin vertical slice, M2 real model and review loop, M3 reliability and evaluation, M4 demo freeze and submission.
- Work is tracked as Linear issues `HAC-n`. Before creating an issue, search the project with `list_issues` to avoid duplicates.
- Commit messages start with the issue ID, for example `HAC-6: ...`. Branch names use the issue's `gitBranchName`.
- Move an issue to "In Progress" when work starts and to "Done" once its change is merged.
