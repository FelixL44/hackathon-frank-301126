import {
  ArrowLeft, ArrowRight, ArrowUpRight, CircleCheck, ClipboardCheck, Clock3, FileText, GitCompareArrows,
  History, Image, MessageSquareText, Paperclip, RotateCcw,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { draftKey, REQUEST_TOPICS, RequestTopic, sentKey } from "../../../domain/customer-request.ts";
import { currentArtifacts, usableCurrent } from "../../../domain/filing.ts";
import type { ClaimFiling, Locator } from "../../../domain/schema.ts";
import { getDb } from "../../../server/db.ts";
import { caseView, STALE_INTAKE_MS, WorkflowError } from "../../../workflow/cases.ts";
import { ActionButton } from "../../action-button.tsx";
import { approveCase, confirmRequestDraft, createRequestDraft, resolveFinding, resumeExtraction } from "../../actions.ts";
import { BrokerShell } from "../../broker-shell.tsx";
import { caseHref, caseListHref, type CaseTab } from "../../case-navigation.ts";
import { caseActor, fmt, nextCaseAction, sourceHref, STATUS } from "../../status.ts";

const ERRORS: Record<string, string> = {
  stale_approval: "This revision is no longer current. Review the new evidence before proceeding.",
  not_ready: "The case is not ready for approval.",
  invalid_resolution: "Enter a reason and choose the evidence the filing should use.",
  stale_request: "The evidence changed. Review the current revision before drafting a new request.",
  request_unavailable: "This case is no longer waiting for a customer request.",
  invalid_request: "Enter a short instruction for a custom request or a message to send.",
};

const SOURCES = {
  message: { label: "Customer report", icon: MessageSquareText },
  photo: { label: "Photo", icon: Image },
  estimate: { label: "Workshop estimate", icon: FileText },
};
const FINDING_LABELS = {
  conflict: "Conflicting evidence", missing: "Missing information", illegible: "Unreadable evidence",
  ambiguous: "Unclear information", invalid_extraction: "Extraction failed",
};
const FIELD_LABELS: Record<string, string> = {
  caseReference: "Case reference", policyReference: "Policy", vehicleId: "Vehicle",
  incidentDate: "Incident date", eventDescription: "Incident description", damagedArea: "Damaged area",
};
const TABS = [
  { id: "review", label: "Review", icon: ClipboardCheck },
  { id: "messages", label: "Messages", icon: MessageSquareText },
  { id: "activity", label: "Activity", icon: History },
] as const;

const where = (locator: Locator) =>
  locator.type === "text" ? `Page ${locator.page} · “${locator.quote}”` : locator.description;

function CaseFields({ id, revision, from }: { id: string; revision?: number; from: string }) {
  return (
    <>
      <input type="hidden" name="caseId" value={id} />
      {revision !== undefined && <input type="hidden" name="revision" value={revision} />}
      {from !== "/" && <input type="hidden" name="from" value={from} />}
    </>
  );
}

function FilingPreview({ filing }: { filing: ClaimFiling }) {
  return (
    <>
      <dl className="case-facts">
        <div><dt>Policy</dt><dd>{filing.policyReference}</dd></div>
        <div><dt>Vehicle</dt><dd>{filing.vehicleId}</dd></div>
        <div><dt>Incident date</dt><dd>{filing.incidentDate}</dd></div>
        <div><dt>Damaged area</dt><dd>{filing.damagedArea.join(", ")}</dd></div>
      </dl>
      <p className="filing-description">{filing.eventDescription}</p>
    </>
  );
}

function describeStep(
  view: Awaited<ReturnType<typeof caseView>>,
  { canApprove, contacted, hasConflict, interrupted }: {
    canApprove: boolean; contacted: boolean; hasConflict: boolean; interrupted: boolean;
  },
) {
  const { case: c, submission, failedSources } = view;
  if (submission?.portalReference) {
    return { title: "Claim forwarded", detail: "The receipt is ready in the simulated insurer portal.", icon: CircleCheck };
  }
  if (canApprove) {
    return { title: "Ready to forward", detail: `Required information is complete and consistent for revision ${c.revision}.`, icon: CircleCheck };
  }
  if (failedSources.length) {
    return { title: "Retry extraction", detail: `Couldn’t read ${failedSources.join(", ")}.`, icon: RotateCcw };
  }
  if (hasConflict) {
    return { title: "Review conflicting evidence", detail: "Compare the cited sources before recording a resolution or requesting a correction.", icon: GitCompareArrows };
  }
  switch (c.status) {
    case "awaiting_information":
      return contacted
        ? { title: "Waiting for the customer", detail: "The request is in the demo inbox. Review the case again when new evidence arrives.", icon: Clock3 }
        : { title: "Request missing information", detail: "Prepare a request and review the draft before sending it.", icon: MessageSquareText };
    case "submitting":
      return submission?.lastErrorCategory
        ? { title: "Submission needs attention", detail: `Last attempt failed · ${submission.lastErrorCategory}`, icon: Clock3 }
        : { title: "Forwarding claim", detail: "The case will show a receipt once the insurer portal accepts it.", icon: Clock3 };
    case "intake":
      return interrupted
        ? { title: "Resume extraction", detail: "Completed files are kept.", icon: RotateCcw }
        : { title: "Checking evidence", detail: "The agent is checking the customer’s documents.", icon: Clock3 };
    default:
      return { title: nextCaseAction(c.status, contacted), detail: "Check the assessment for the current revision.", icon: ClipboardCheck };
  }
}

type SearchParams = Record<string, string | string[] | undefined>;

export default async function CasePage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  const search = await searchParams;
  const from = caseListHref(search.from);
  const tab: CaseTab = search.tab === "messages" || search.tab === "activity" ? search.tab : "review";
  if (!z.uuid().safeParse(id).success) notFound();
  const view = await caseView(await getDb(), id).catch((e) => {
    if (e instanceof WorkflowError && e.code === "not_found") notFound();
    throw e;
  });
  const { case: c, filing, submission } = view;
  const customerMessage = view.messages.find((m) => m.direction === "inbound" && m.role === "customer");
  const lastDecision = view.events.findLast((e) => e.operation === "decide")?.detail as { rule?: string } | undefined;

  return (
    <BrokerShell returnTo={from}>
      <Link className="case-back" href={from}><ArrowLeft size={16} aria-hidden="true" /> Back to cases</Link>
      <header className="row broker-heading case-header">
        <div>
          <h1>{c.reference}</h1>
          <div className="case-meta">
            <span className={`badge ${c.status}`}>{STATUS[c.status].label}</span>
            <span className="muted">Revision {c.revision}</span>
            {handler !== "Complete" && <span className="muted">Next to act · <strong>{handler}</strong></span>}
          </div>
        </div>
        <time className="muted case-updated" dateTime={c.updatedAt.toISOString()}>Updated {fmt(c.updatedAt)}</time>
      </header>

      {errorMessage && (tab !== "messages" || !canRequest) && <p className="notice error" role="alert">{errorMessage}</p>}
      <section className="card case-step" aria-labelledby="next-step">
        <div className="case-step-copy">
          <span className="icon-tile"><StepIcon size={23} aria-hidden="true" /></span>
          <div><h2 id="next-step">{step.title}</h2><p>{step.detail}</p></div>
        </div>
        <div className="case-step-actions">
          {submission?.portalReference ? (
            <Link className="broker-button primary-action" href={`/portal/${submission.portalReference}`}>
              Open receipt <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          ) : canApprove ? (
            <form action={approveCase}>
              <CaseFields id={id} revision={c.revision} from={from} />
              <ActionButton className="broker-button primary-action" pendingLabel="Forwarding…">
                Approve and forward <ArrowRight size={16} aria-hidden="true" />
              </ActionButton>
            </form>
          ) : (view.failedSources.length > 0 || interrupted) ? (
            <form action={resumeExtraction}>
              <CaseFields id={id} revision={interrupted ? undefined : c.revision} from={from} />
              <ActionButton className="broker-button primary-action" pendingLabel="Reading evidence…">
                {interrupted ? "Resume extraction" : "Retry extraction"}
              </ActionButton>
            </form>
          ) : hasConflict ? (
            <Link className="broker-button primary-action" href={openReviewHref}>Compare sources <ArrowRight size={16} aria-hidden="true" /></Link>
          ) : null}
          {canRequest && (
            <Link className={`broker-button${!hasConflict && !contacted && !view.failedSources.length ? " primary-action" : ""}`} href={draft || !contacted ? requestHref : href("messages")}>
              {draft ? "Review message draft" : contacted ? "View messages" : estimateConflict ? "Request correction" : "Prepare request"}
            </Link>
          )}
        </div>
      </section>

      <nav className="case-tabs" aria-label="Case sections">
        {TABS.map(({ id: section, label, icon: Icon }) => (
          <Link key={section} aria-current={section === tab ? "page" : undefined} href={href(section)}>
            <Icon size={17} aria-hidden="true" /> {label}
            {section === "messages" && (conversation.length > 0 || draft) && <span className="badge">{conversation.length + Number(Boolean(draft))}</span>}
          </Link>
        ))}
      </nav>

      {tab === "review" && (
        <div className="case-review">
          <section aria-label="Case assessment">
            {canApprove && filing && (
              <div className="card review-panel">
                <h2 className="case-card-title"><FileText size={20} aria-hidden="true" /> Prepared filing <span className="badge">Revision {c.revision}</span></h2>
                <FilingPreview filing={filing} />
                <details><summary>View exact payload</summary><pre>{JSON.stringify(filing, null, 2)}</pre></details>
              </div>
            )}
            {approval && !canApprove && (
              <div className="card review-panel">
                <h2 className="case-card-title"><FileText size={20} aria-hidden="true" /> Approved filing <span className="badge">Revision {approval.revision}</span></h2>
                <FilingPreview filing={approval.payload} />
                <details><summary>View approved payload</summary><pre>{JSON.stringify(approval.payload, null, 2)}</pre></details>
              </div>
            )}
            {((!canApprove && !approval) || openFindings.length > 0 || resolved.length > 0) && (
              <div className="card review-panel" id="agent-assessment">
                <h2 className="case-card-title"><ClipboardCheck size={20} aria-hidden="true" /> Agent assessment {openFindings.length > 0 && <span className="badge broker_review">{openFindings.length} open</span>}</h2>
                {openFindings.length ? (
                  <ul className="review-findings">
                    {openFindings.map((finding) => (
                      <li key={finding.id} className="review-finding">
                        <h3>{FINDING_LABELS[finding.rule]}{finding.field && <span>{FIELD_LABELS[finding.field]}</span>}</h3>
                        <p>{finding.explanation}</p>
                        {finding.evidence.length > 0 && (
                          <ul className="citation-grid" aria-label="Cited sources">
                            {finding.evidence.map((e, index) => {
                              const artifact = view.artifacts.find((a) => a.sourceId === e.sourceId && a.version === e.version);
                              return (
                                <li key={index}>
                                  <Link href={sourceHref(id, e, from)}>
                                    <span className="citation-title">
                                      <strong>{artifact ? SOURCES[artifact.kind].label : e.sourceId}</strong>
                                      <ArrowUpRight size={15} aria-hidden="true" />
                                    </span>
                                    <span className="citation-location">{e.sourceId} · v{e.version}{e.locator.type === "text" && ` · Page ${e.locator.page}`}</span>
                                    <span className="citation-quote">{e.locator.type === "text" ? `“${e.locator.quote}”` : e.locator.description}</span>
                                  </Link>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                        {finding.rule === "conflict" && c.status === "broker_review" && (
                          <details className="resolution">
                            <summary>Record a resolution</summary>
                            <form action={resolveFinding}>
                              <CaseFields id={id} from={from} />
                              <input type="hidden" name="findingId" value={finding.id} />
                              <fieldset className="resolution-choices">
                                <legend>Which evidence should the filing use?</legend>
                                {[...new Set(finding.evidence.map((e) => e.sourceId))].map((sourceId) => (
                                  <label key={sourceId}><input type="radio" name="acceptedSourceId" value={sourceId} required /> {sourceId}</label>
                                ))}
                                <label><input type="radio" name="acceptedSourceId" value="" /> Both sources describe separate damage</label>
                              </fieldset>
                              <label className="case-form-label" htmlFor={`reason-${finding.id}`}>Reason</label>
                              <textarea id={`reason-${finding.id}`} name="reason" rows={2} required maxLength={1000} />
                              <ActionButton pendingLabel="Recording…">Save resolution</ActionButton>
                            </form>
                          </details>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : <p className="muted">{c.status === "intake" ? "Waiting for extraction results." : "No open findings."}</p>}
                {resolved.length > 0 && (
                  <details className="review-resolved">
                    <summary>Resolved findings ({resolved.length})</summary>
                    <ul>{resolved.map((f) => (
                      <li key={f.id}><strong>{FINDING_LABELS[f.rule]}</strong> · {f.resolutionReason}
                        {f.acceptedSourceId && <> · Filing uses {f.acceptedSourceId}</>}
                      </li>
                    ))}</ul>
                  </details>
                )}
              </div>
            )}
          </section>
          <section aria-label="Customer evidence">
            <div className="card review-panel case-dossier">
              <h2 className="case-card-title"><MessageSquareText size={19} aria-hidden="true" /> Customer report</h2>
              {latestReport ? <blockquote>{latestReport.body}</blockquote> : <p className="muted">No customer report received.</p>}
              <dl className="case-facts">
                {summary.map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
              </dl>
            </div>
            <div className="card review-panel">
              <h2 className="case-card-title"><Paperclip size={19} aria-hidden="true" /> Source files <span className="badge">{current.length}</span></h2>
              {current.length ? sourceList(current) : <p className="muted">No source files received.</p>}
              {archived.length > 0 && <details><summary>Previous versions ({archived.length})</summary>{sourceList(archived)}</details>}
            </div>
          </section>
        </div>
      )}

      {tab === "messages" && (
        <div className="case-review">
          <section className="card review-panel conversation-panel" aria-labelledby="conversation-heading">
            <h2 className="case-card-title" id="conversation-heading"><MessageSquareText size={20} aria-hidden="true" /> Conversation</h2>
            {conversation.length ? (
              <ol className="conversation">
                {conversation.map((m) => (
                  <li key={m.id} className={m.direction === "outbound" ? "outgoing" : undefined}>
                    <div className="case-meta">
                      <strong>{m.direction === "outbound" ? "Broker" : m.role === "workshop" ? "Workshop" : "Customer"}</strong>
                      <time dateTime={m.createdAt.toISOString()} className="muted">{fmt(m.createdAt)}</time>
                      {m.direction === "outbound" && <span className="badge submitted">Demo inbox</span>}
                    </div>
                    <p>{m.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card scroll">
            <h2>Observations</h2>
            <table>
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Value</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {view.observations.map((o) => (
                  <tr key={o.id}>
                    <td>{o.field}</td>
                    <td>
                      {o.value ?? <em>unknown</em>}
                      {o.normalized && o.normalized !== o.value && <div className="muted">→ {o.normalized}</div>}
                    </td>
                    <td>
                      <Link href={sourceHref(c.id, o)}>
                        {o.sourceId} v{o.version}
                      </Link>
                      <div className="muted">{where(o.locator)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {c.status === "awaiting_approval" && filing && (
            <div className="card">
              <h2>Prepared filing · revision {c.revision}</h2>
              <pre>{JSON.stringify(filing, null, 2)}</pre>
              <form action={approveCase} style={{ marginTop: 12 }}>
                <input type="hidden" name="caseId" value={c.id} />
                <input type="hidden" name="revision" value={c.revision} />
                <button>Approve revision {c.revision} and submit</button>
              </form>
            </div>
          )}

          {submission && (
            <div className="card">
              <h2>
                Submission <span className="badge sim">simulated portal</span>
              </h2>
              {submission.portalReference ? (
                <p className="notice ok">
                  Filed as <Link href={`/portal/${submission.portalReference}`}>{submission.portalReference}</Link> · revision{" "}
                  {submission.approvedRevision} approved by {submission.approvedBy} at {fmt(submission.createdAt)}
                </p>
              ) : (
                <p className="notice">
                  Pending · {submission.attempts} attempt(s)
                  {submission.lastErrorCategory && <> · last error: {submission.lastErrorCategory}</>}
                </p>
              )}
              <details>
                <summary>Submitted payload (frozen at approval)</summary>
                <pre>{JSON.stringify(submission.payload, null, 2)}</pre>
              </details>
            </div>
          )}
        </div>
      )}

      {tab === "activity" && (
        <section aria-label="Activity">
          <div className="card review-panel">
            <h2 className="case-card-title"><History size={20} aria-hidden="true" /> Case history</h2>
            <ol className="case-history">
              {view.events.toReversed().map((e) => (
                <li key={e.id}>
                  <div className="case-meta">
                    <strong>{e.operation.replaceAll("_", " ")}</strong>
                    <span className="badge">Revision {e.caseRevision}</span>
                    <span className="muted">{e.result}{e.errorCategory && ` · ${e.errorCategory}`}</span>
                  </div>
                  <time className="muted" dateTime={e.createdAt.toISOString()}>{fmt(e.createdAt)}</time>
                  {(e.detail || e.tool) && <details><summary>Event details</summary>
                    {e.tool && <span className="muted">{e.tool}{e.latencyMs !== null && ` · ${e.latencyMs} ms`}</span>}
                    {e.detail && <pre>{JSON.stringify(e.detail, null, 2)}</pre>}
                  </details>}
                </li>
              ))}
            </ol>
          </div>
          <details className="card review-panel case-timeline">
            <summary>Extracted observations <span className="badge">{view.observations.length}</span></summary>
            <div className="scroll">
              <table>
                <thead><tr><th>Field</th><th>Value</th><th>Source</th></tr></thead>
                <tbody>
                  {view.observations.map((o) => (
                    <tr key={o.id}>
                      <td>{FIELD_LABELS[o.field]}</td>
                      <td>{o.value ?? <em>Unknown</em>}</td>
                      <td><Link href={sourceHref(id, o, from, "activity")}>{o.sourceId} · v{o.version}</Link><div className="muted">{where(o.locator)}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>
      )}
    </BrokerShell>
  );
}
