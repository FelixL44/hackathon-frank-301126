import { ArrowRight, ArrowUpRight, ClipboardCheck, FileText, MessageSquareText, Paperclip, RotateCcw } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { draftKey, REQUEST_TOPICS, sentKey } from "../../../domain/customer-request.ts";
import { currentArtifacts, usableCurrent } from "../../../domain/filing.ts";
import type { Locator } from "../../../domain/schema.ts";
import { getDb } from "../../../server/db.ts";
import { caseView, STALE_INTAKE_MS, WorkflowError } from "../../../workflow/cases.ts";
import { ActionButton } from "../../action-button.tsx";
import { approveCase, confirmRequestDraft, createRequestDraft, resolveFinding, resumeExtraction } from "../../actions.ts";
import { BrokerShell } from "../../broker-shell.tsx";
import { caseActor, fmt, sourceHref, STATUS } from "../../status.ts";

const ERRORS: Record<string, string> = {
  stale_approval: "This revision is no longer current. Review the new evidence before proceeding.",
  not_ready: "The case is not ready for approval.",
  invalid_resolution: "Enter a reason and choose one of the cited sources or both.",
  stale_request: "The evidence changed. Review the current revision before drafting a new request.",
  request_unavailable: "This case is no longer waiting for a customer request.",
  invalid_request: "Enter a short instruction for a custom request or a message to send.",
};

const SOURCE_LABELS = { message: "Customer report", photo: "Photo", estimate: "Workshop estimate" };
const FINDING_LABELS = {
  conflict: "Conflicting evidence", missing: "Missing information", illegible: "Unreadable evidence",
  ambiguous: "Unclear information", invalid_extraction: "Extraction failed",
};
const FIELD_LABELS: Record<string, string> = {
  caseReference: "Case reference", policyReference: "Policy", vehicleId: "Vehicle",
  incidentDate: "Incident date", eventDescription: "Incident description", damagedArea: "Damaged area",
};

const where = (l: Locator) => (l.type === "text" ? `Page ${l.page} · “${l.quote}”` : l.description);

export default async function CasePage(props: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await props.params;
  const { error } = await props.searchParams;
  if (!z.uuid().safeParse(id).success) notFound();
  const view = await caseView(await getDb(), id).catch((e) => {
    if (e instanceof WorkflowError && e.code === "not_found") notFound();
    throw e;
  });
  const { case: c, filing, submission, approval } = view;
  const customerMessages = view.messages.filter((m) => m.direction === "inbound" && m.role === "customer");
  const sentMessages = view.messages.filter((m) => m.direction === "outbound" && m.role === "customer" && m.status === "sent");
  const contacted = sentMessages.some((m) => m.requestKey?.startsWith(sentKey(c.revision)));
  const draft = view.messages.find((m) => m.status === "draft" && m.requestKey?.startsWith(draftKey(c.revision)));
  const canRequest = c.status === "broker_review" || c.status === "awaiting_information";
  const lastDecision = view.events.findLast((e) => e.operation === "decide")?.detail?.rule;
  const current = currentArtifacts(view.artifacts);
  const estimateNeedsReview = view.findings.some((finding) => finding.status === "open" &&
    finding.rule === "conflict" && finding.evidence.some((e) => current.some((a) => a.sourceId === e.sourceId && a.kind === "estimate")));
  const suggestedTopic = estimateNeedsReview || view.gaps.some((gap) => gap.document === "estimate")
    ? "corrected_estimate"
    : view.gaps.some((gap) => gap.document === "photo" || gap.field === "damagedArea")
      ? "clearer_photo"
      : "policy_details";
  const facts = usableCurrent(view.artifacts, view.observations);
  const summary = [
    { label: "Policy", value: c.policyReference ?? facts.find((o) => o.field === "policyReference")?.value },
    { label: "Vehicle", value: c.vehicleId ?? facts.find((o) => o.field === "vehicleId")?.value },
    { label: "Incident date", value: facts.find((o) => o.field === "incidentDate")?.value },
  ];

  return (
    <BrokerShell reference={c.reference}>
      <header className="row broker-heading">
        <div>
          <h1>{c.reference}</h1>
          <div className="case-meta">
            <span className={`badge ${c.status}`}>{STATUS[c.status].label}</span>
            <span className="muted">Revision {c.revision}</span>
            <span className="muted">Next to act · <strong>{caseActor(c.status, contacted)}</strong></span>
          </div>
        </div>
        <div className="case-meta">
          {canRequest && <a className="broker-button" href="#customer-request"><MessageSquareText size={16} /> Request information</a>}
          {c.status === "awaiting_approval" && filing && (
            <form action={approveCase}>
              <input type="hidden" name="caseId" value={c.id} />
              <input type="hidden" name="revision" value={c.revision} />
              <ActionButton className="broker-button primary-action" pendingLabel="Forwarding…">
                Approve and forward <ArrowRight size={16} />
              </ActionButton>
            </form>
          )}
        </div>
      </header>

      {typeof error === "string" && ERRORS[error] && <p className="notice error" role="alert">{ERRORS[error]}</p>}
      {c.status === "intake" && (
        Date.now() - (view.events.at(-1)?.createdAt ?? c.updatedAt).getTime() > STALE_INTAKE_MS ? (
          <form action={resumeExtraction} className="notice">
            <input type="hidden" name="caseId" value={c.id} />
            Extraction was interrupted. Completed files are kept. <ActionButton pendingLabel="Resuming…">Resume extraction</ActionButton>
          </form>
        ) : <p className="notice">Extraction is in progress. Refresh to check its status.</p>
      )}
      {submission && (
        <div className="notice ok">
          {submission.portalReference ? (
            <>Filed in the simulated portal · <Link href={`/portal/${submission.portalReference}`}>Open receipt {submission.portalReference}</Link></>
          ) : <>Submission pending · {submission.attempts} attempts{submission.lastErrorCategory && ` · ${submission.lastErrorCategory}`}</>}
        </div>
      )}

      <div className="grid case-detail-grid">
        <section aria-label="Customer evidence">
          <div className="card">
            <h2 className="case-card-title"><MessageSquareText size={19} /> Customer report</h2>
            <dl className="case-facts">
              {summary.map(({ label, value }) => <div key={label}><dt className="muted">{label}</dt><dd>{value ?? "Unknown"}</dd></div>)}
            </dl>
            {customerMessages.length ? (
              <ul className="case-messages">
                {customerMessages.map((m) => (
                  <li key={m.id}>
                    <time dateTime={m.createdAt.toISOString()} className="muted">{fmt(m.createdAt)}</time>
                    <p>{m.body}</p>
                  </li>
                ))}
              </ul>
            ) : <p className="muted">No customer report received.</p>}
          </div>

          <div className="card">
            <h2 className="case-card-title"><Paperclip size={19} /> Sources <span className="badge">{view.artifacts.length}</span></h2>
            {view.artifacts.length ? (
              <ul className="evidence-list">
                {view.artifacts.map((a) => (
                  <li key={`${a.sourceId}-${a.version}`}>
                    <Link href={sourceHref(c.id, a)}>
                      <FileText size={16} aria-hidden="true" />
                      <span><strong>{SOURCE_LABELS[a.kind]}</strong><small className="muted"> · {a.sourceId} · v{a.version}</small></span>
                      {!current.includes(a) && <span className="badge">Superseded</span>}
                      <ArrowUpRight size={16} aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <p className="muted">No sources received.</p>}
          </div>

          {(canRequest || sentMessages.length > 0) && (
            <div className="card case-draft" id="customer-request">
              <h2 className="case-card-title"><MessageSquareText size={19} /> Customer requests</h2>
              {canRequest && (draft ? (
                <form action={confirmRequestDraft} key={draft.id}>
                  <input type="hidden" name="caseId" value={c.id} />
                  <input type="hidden" name="revision" value={c.revision} />
                  <input type="hidden" name="draftId" value={draft.id} />
                  <label htmlFor="request-body">Review and edit draft</label>
                  <textarea id="request-body" name="body" rows={8} defaultValue={draft.body} maxLength={2000} required />
                  <div className="case-actions">
                    <ActionButton name="intent" value="send" pendingLabel="Saving…">Confirm and send to demo inbox</ActionButton>
                    <ActionButton className="secondary" name="intent" value="discard" formNoValidate>Discard draft</ActionButton>
                  </div>
                </form>
              ) : (
                <form action={createRequestDraft}>
                  <input type="hidden" name="caseId" value={c.id} />
                  <input type="hidden" name="revision" value={c.revision} />
                  <label htmlFor="request-topic">Request type</label>
                  <select id="request-topic" name="topic" defaultValue={suggestedTopic}>
                    {Object.entries(REQUEST_TOPICS).map(([topic, { label }]) => <option value={topic} key={topic}>{label}</option>)}
                  </select>
                  <label htmlFor="request-instruction">Short instruction <span className="muted">(optional for presets)</span></label>
                  <textarea id="request-instruction" name="instruction" rows={2} maxLength={500} placeholder="Write the request in the customer’s language" />
                  <ActionButton pendingLabel="Preparing…">Prepare draft</ActionButton>
                </form>
              ))}
              {sentMessages.length > 0 && (
                <ul className="case-messages request-history">
                  {sentMessages.map((m) => (
                    <li key={m.id}>
                      <div className="case-meta"><span className="badge submitted">Sent to demo inbox</span><time dateTime={m.createdAt.toISOString()} className="muted">{fmt(m.createdAt)}</time></div>
                      <p>{m.body}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>

        <section aria-label="Assessment and findings">
          <div className="card">
            <h2 className="case-card-title"><ClipboardCheck size={19} /> Agent assessment</h2>
            {typeof lastDecision === "string" && <p className="muted">{lastDecision}</p>}
            {view.failedSources.length > 0 && (
              <form action={resumeExtraction} className="notice error">
                <input type="hidden" name="caseId" value={c.id} />
                <input type="hidden" name="revision" value={c.revision} />
                <div>Extraction failed for {view.failedSources.join(", ")}.</div>
                <div className="case-actions"><ActionButton className="broker-button" pendingLabel="Retrying…"><RotateCcw size={15} /> Retry extraction</ActionButton></div>
              </form>
            )}
            {view.findings.length ? (
              <ul className="case-findings">
                {view.findings.map((f) => (
                  <li key={f.id}>
                    <div className="case-meta">
                      <strong>{FINDING_LABELS[f.rule]}</strong>
                      <span className={`badge ${f.status === "resolved" ? "submitted" : "broker_review"}`}>{f.status === "resolved" ? "Resolved" : "Open"}</span>
                    </div>
                    <p>{f.explanation}</p>
                    {f.evidence.length > 0 && (
                      <ul className="finding-sources">
                        {f.evidence.map((e, index) => (
                          <li key={index}>
                            <Link href={sourceHref(c.id, e)}>{e.sourceId} · v{e.version}</Link>
                            <span className="muted">{where(e.locator)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {f.rule === "conflict" && f.status === "open" && (
                      <details>
                        <summary>Resolve conflict</summary>
                        <form action={resolveFinding}>
                          <input type="hidden" name="caseId" value={c.id} />
                          <input type="hidden" name="findingId" value={f.id} />
                          <fieldset className="resolution-choices">
                            <legend>Which evidence should the filing use?</legend>
                            {[...new Set(f.evidence.map((e) => e.sourceId))].map((sourceId) => (
                              <label key={sourceId}><input type="radio" name="acceptedSourceId" value={sourceId} required /> {sourceId}</label>
                            ))}
                            <label><input type="radio" name="acceptedSourceId" value="" /> Both sources describe separate damage</label>
                          </fieldset>
                          <label className="case-form-label" htmlFor={`reason-${f.id}`}>Resolution reason</label>
                          <textarea id={`reason-${f.id}`} name="reason" rows={2} required maxLength={1000} />
                          <ActionButton pendingLabel="Recording…">Record resolution</ActionButton>
                        </form>
                      </details>
                    )}
                    {f.status === "resolved" && (
                      <p className="muted">Resolved by {f.resolvedBy} · {f.resolutionReason}{f.acceptedSourceId && ` · Filing uses ${f.acceptedSourceId}`}</p>
                    )}
                  </li>
                ))}
              </ul>
            ) : <p className="muted">{c.status === "intake" ? "Waiting for extraction results." : "No findings to review."}</p>}
          </div>

          {c.status === "awaiting_approval" && filing && (
            <div className="card">
              <h2 className="case-card-title"><FileText size={19} /> Prepared filing <span className="badge">Revision {c.revision}</span></h2>
              <p>{filing.eventDescription}</p>
              <ul className="evidence-list">
                {filing.evidence.map((e) => (
                  <li key={`${e.sourceId}-${e.version}`}><Link href={sourceHref(c.id, e)}>{e.sourceId} · v{e.version}<ArrowUpRight size={16} aria-hidden="true" /></Link></li>
                ))}
              </ul>
              <details><summary>View exact filing payload</summary><pre>{JSON.stringify(filing, null, 2)}</pre></details>
            </div>
          )}
          {approval && (
            <details className="card case-timeline">
              <summary>Approved payload · revision {approval.revision} · {fmt(approval.createdAt)}</summary>
              <pre>{JSON.stringify(approval.payload, null, 2)}</pre>
            </details>
          )}

          <details className="card case-timeline">
            <summary>Extracted observations <span className="badge">{view.observations.length}</span></summary>
            <div className="scroll">
              <table>
                <thead><tr><th>Field</th><th>Value</th><th>Source</th></tr></thead>
                <tbody>
                  {view.observations.map((o) => (
                    <tr key={o.id}>
                      <td>{FIELD_LABELS[o.field]}</td>
                      <td>{o.value ?? <em>Unknown</em>}</td>
                      <td><Link href={sourceHref(c.id, o)}>{o.sourceId} · v{o.version}</Link><div className="muted">{where(o.locator)}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>
      </div>

      <details className="card case-timeline">
        <summary>Case timeline <span className="badge">{view.events.length}</span></summary>
        <div className="scroll">
          <table>
            <thead><tr><th>Time</th><th>Revision</th><th>Operation</th><th>Result</th><th>Tool</th><th>Detail</th></tr></thead>
            <tbody>
              {view.events.map((e) => (
                <tr key={e.id}>
                  <td>{fmt(e.createdAt)}</td>
                  <td>{e.caseRevision}</td>
                  <td>{e.operation.replaceAll("_", " ")}</td>
                  <td>{e.result}{e.errorCategory && ` (${e.errorCategory})`}</td>
                  <td>{e.tool ?? ""}</td>
                  <td><code>{e.detail ? JSON.stringify(e.detail) : ""}</code>{e.latencyMs !== null && <span className="muted"> · {e.latencyMs} ms</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </BrokerShell>
  );
}
