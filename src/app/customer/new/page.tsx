import { ArrowLeft, ArrowRight, Check, FileText, Paperclip, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentCustomer } from "../../../server/customer-session.ts";
import { getDb } from "../../../server/db.ts";
import { ACCEPTED_UPLOADS, MAX_UPLOADS, MAX_UPLOAD_BYTES, activeAgents } from "../../../workflow/customer-intake.ts";
import { ActionButton } from "../../action-button.tsx";
import { chooseAgent, describeIncident } from "../actions.ts";
import { errorText } from "../errors.ts";

export const dynamic = "force-dynamic";

const ACCEPT = ACCEPTED_UPLOADS.join(",");
const MB = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024));

type SearchParams = Record<string, string | string[] | undefined>;

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? (value[0] ?? "") : (value ?? ""));

function reviewHref(step: 2 | 3, input: { agent: string; message?: string; date?: string }) {
  const query = new URLSearchParams({ step: String(step), agent: input.agent });
  if (input.message) query.set("message", input.message);
  if (input.date) query.set("date", input.date);
  return `/customer/new?${query.toString()}`;
}

export default async function NewClaimPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const search = await searchParams;
  const db = await getDb();
  const customer = await currentCustomer(db);
  if (!customer) redirect("/customer?error=session");

  const agents = await activeAgents(db);
  const requested = Number(one(search.step)) || 1;
  const agentId = one(search.agent);
  const agent = agents.find((row) => row.id === agentId) ?? null;
  const message = one(search.message);
  const date = one(search.date);
  const notice = errorText(search.error);

  // A step without its prerequisites falls back to the step that can be completed.
  const step = !agent ? 1 : requested === 3 && !message ? 2 : requested === 2 ? 2 : requested === 3 ? 3 : 1;

  const labels = ["Claim type", "What happened", "Photos & review"];

  return (
    <>
      <Link className="customer-back" href="/customer">
        <ArrowLeft size={15} aria-hidden="true" /> All claims
      </Link>

      <header className="customer-page-head">
        <div>
          <p className="customer-eyebrow">New claim</p>
          <h1>Report damage</h1>
          <p className="customer-lede">Three short steps. You can add more documents later.</p>
        </div>
      </header>

      <ol className="customer-progress" aria-label="Claim steps">
        {labels.map((label, index) => {
          const number = index + 1;
          const state = number === step ? "current" : number < step ? "done" : "next";
          return (
            <li key={label} data-state={state} aria-current={state === "current" ? "step" : undefined}>
              <span className="customer-progress-number">{state === "done" ? <Check size={13} aria-hidden="true" /> : number}</span>
              <span>{label}</span>
            </li>
          );
        })}
      </ol>

      {notice && <p className="notice error" role="alert">{notice}</p>}

      {step === 1 && (
        <section className="card customer-step-panel" aria-labelledby="step-1">
          <h2 id="step-1">What kind of claim is this?</h2>
          <p className="muted">Choose the closest match. Our broker can change it later if needed.</p>

          {agents.length ? (
            <form action={chooseAgent} className="customer-form">
              <div className="customer-agent-list">
                {agents.map((row) => (
                  <label key={row.id} className="customer-agent-card">
                    <input type="radio" name="agent" value={row.id} required defaultChecked={row.id === agent?.id} />
                    <span className="customer-agent-body">
                      <span className="customer-agent-title">
                        {row.name}
                        <span className="customer-agent-check" aria-hidden="true">
                          <Check size={12} />
                        </span>
                      </span>
                      {row.description && <span className="customer-agent-desc">{row.description}</span>}
                      {row.requiredDocuments.length > 0 && (
                        <span className="customer-agent-docs">
                          {row.requiredDocuments.map((document) => (
                            <span key={document} className="customer-chip">
                              <Paperclip size={11} aria-hidden="true" /> {document}
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
              <div className="customer-form-actions">
                <ActionButton className="customer-submit" pendingLabel="Loading…">
                  Continue <ArrowRight size={16} aria-hidden="true" />
                </ActionButton>
              </div>
            </form>
          ) : (
            <p className="notice">
              No claim types are open right now. Please contact your broker — they can re-enable one for you.
            </p>
          )}
        </section>
      )}

      {step === 2 && agent && (
        <section className="card customer-step-panel" aria-labelledby="step-2">
          <h2 id="step-2">What happened?</h2>
          <p className="muted">
            Write it in your own words. Include the date, where it happened, your policy number and the vehicle or
            property details you know.
          </p>

          <div className="customer-selected">
            <FileText size={16} aria-hidden="true" />
            <span>
              Claim type <strong>{agent.name}</strong>
            </span>
            <Link className="customer-inline-link" href="/customer/new?step=1">
              Change
            </Link>
          </div>

          <form action={describeIncident} className="customer-form">
            <input type="hidden" name="agent" value={agent.id} />
            <label className="customer-field">
              <span>Description</span>
              <textarea
                name="message"
                rows={6}
                required
                minLength={10}
                maxLength={4000}
                defaultValue={message}
                placeholder="On 18 November, while parking at the supermarket, I hit a pillar and damaged the front bumper of my car, plate AA-12-BC. Policy no. POL-2026-000123."
              />
            </label>
            <label className="customer-field customer-field-date">
              <span>Incident date (optional)</span>
              <input type="date" name="date" defaultValue={date} />
            </label>
            <div className="customer-form-actions">
              <Link className="customer-back-link" href="/customer/new?step=1">
                <ArrowLeft size={15} aria-hidden="true" /> Back
              </Link>
              <ActionButton className="customer-submit" pendingLabel="Saving…">
                Continue <ArrowRight size={16} aria-hidden="true" />
              </ActionButton>
            </div>
          </form>
        </section>
      )}

      {step === 3 && agent && (
        <section className="card customer-step-panel" aria-labelledby="step-3">
          <h2 id="step-3">Add photos and check your claim</h2>
          <p className="muted">
            A clear photo of the damage is the most useful thing you can add. A workshop estimate or invoice helps our
            broker move faster.
          </p>

          <dl className="customer-summary">
            <div>
              <dt>Claim type</dt>
              <dd>{agent.name}</dd>
            </div>
            <div>
              <dt>Incident date</dt>
              <dd>{date || "Not provided"}</dd>
            </div>
          </dl>
          <blockquote className="customer-quote">{message}</blockquote>

          <form action="/customer/submit" method="post" encType="multipart/form-data" className="customer-form">
            <input type="hidden" name="intent" value="claim" />
            <input type="hidden" name="agent" value={agent.id} />
            <input type="hidden" name="message" value={message} />
            <input type="hidden" name="date" value={date} />

            <label className="customer-field customer-drop">
              <span>Photos and documents</span>
              <input type="file" name="files" multiple accept={ACCEPT} required />
              <small className="customer-hint">
                JPG, PNG, WebP, PDF or TXT · up to {MAX_UPLOADS} files · {MB} MB each.
              </small>
            </label>

            <div className="customer-form-actions">
              <Link className="customer-back-link" href={reviewHref(2, { agent: agent.id, message, date })}>
                <ArrowLeft size={15} aria-hidden="true" /> Back
              </Link>
              <ActionButton className="customer-submit" pendingLabel="Opening your claim…">
                Submit claim <ArrowRight size={16} aria-hidden="true" />
              </ActionButton>
            </div>
          </form>

          <p className="customer-fineprint">
            <ShieldCheck size={13} aria-hidden="true" /> Our broker reviews every file. You will see their reply in the
            claim room.
          </p>
        </section>
      )}
    </>
  );
}
