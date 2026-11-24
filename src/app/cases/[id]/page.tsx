import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { recipientFor } from "../../../domain/questions.ts";
import type { Locator } from "../../../domain/schema.ts";
import { getDb } from "../../../server/db.ts";
import { caseView, STALE_INTAKE_MS, WorkflowError } from "../../../workflow/cases.ts";
import { approveCase, resolveFinding, resumeExtraction } from "../../actions.ts";
import { fmt, sourceHref, STATUS } from "../../status.ts";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  stale_approval: "This revision is no longer current. Review the new evidence before approving.",
  not_ready: "The case is not ready for approval.",
  invalid_resolution: "A resolution needs a reason, and the accepted source must be one of the cited sources.",
};

const where = (l: Locator) => (l.type === "text" ? `p. ${l.page}: “${l.quote}”` : `${l.imageId}: ${l.description}`);

export default async function CasePage(props: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await props.params;
  const { error } = await props.searchParams;
  if (!z.uuid().safeParse(id).success) notFound();
  const view = await caseView(await getDb(), id).catch((e) => {
    if (e instanceof WorkflowError && e.code === "not_found") notFound();
    throw e;
  });
  const { case: c, filing, submission, approval } = view;
  const customerMessage = view.messages.find((m) => m.direction === "inbound" && m.role === "customer");
  const lastDecision = view.events.findLast((e) => e.operation === "decide")?.detail as { rule?: string } | undefined;

  return (
    <main>
      <div className="row">
        <div>
          <h1>{c.reference}</h1>
          <p className="muted">
            Revision {c.revision} · <span className={`badge ${c.status}`}>{STATUS[c.status].label}</span> · Next to act:{" "}
            {STATUS[c.status].actor}
          </p>
        </div>
        <Link href="/">← Inbox</Link>
      </div>

      {error && <p className="notice error">{ERRORS[error] ?? error}</p>}

      {c.status === "intake" &&
        (Date.now() - (view.events.at(-1)?.createdAt ?? c.updatedAt).getTime() > STALE_INTAKE_MS ? (
          <form action={resumeExtraction} className="notice">
            <input type="hidden" name="caseId" value={c.id} />
            Extraction stopped before it finished (for example after a restart). Files already read are kept.{" "}
            <button>Resume extraction</button>
          </form>
        ) : (
          <p className="notice">Extraction is running. Reload in a moment.</p>
        ))}

      {(c.status === "broker_review" || c.status === "awaiting_information") && (
        <div className="card">
          <h2>Next step · {STATUS[c.status].actor}</h2>
          <p className="muted">Why: {lastDecision?.rule ?? "see findings"}</p>
          {c.status === "awaiting_information" ? (
            <ul>
              {view.gaps.map((g, i) => (
                <li key={i}>
                  Ask the <strong>{recipientFor(g)}</strong>: {g.explanation}
                </li>
              ))}
            </ul>
          ) : (
            <p>Resolve each open conflict below with a reason, or ask for a corrected document.</p>
          )}
          <p className="muted">Sending the question through the demo inbox comes with HAC-11.</p>
        </div>
      )}

      <div className="grid">
        <section>
          <div className="card">
            <h2>Customer account</h2>
            <blockquote className="quote" lang="pt">
              {customerMessage?.body ?? "No message."}
            </blockquote>
          </div>
          <div className="card">
            <h2>Evidence</h2>
            <ul>
              {view.artifacts.map((a) => (
                <li key={`${a.sourceId}-${a.version}`} id={`src-${a.sourceId}-v${a.version}`}>
                  <Link href={sourceHref(c.id, a)}>
                    <strong>{a.sourceId}</strong> v{a.version}
                  </Link>{" "}
                  · {a.kind}
                  {a.supersedesVersion && <> · replaces v{a.supersedesVersion}</>}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section>
          <div className="card">
            <h2>Findings</h2>
            {view.findings.length === 0 ? (
              <p className="muted">No findings. All required checks pass.</p>
            ) : (
              <ul>
                {view.findings.map((f) => (
                  <li key={f.id}>
                    <span className="badge">{f.rule}</span> {f.explanation} <span className="muted">({f.status})</span>
                    {f.evidence.length > 0 && (
                      <ul>
                        {f.evidence.map((e, i) => (
                          <li key={i}>
                            <Link href={sourceHref(c.id, e)}>
                              {e.sourceId} v{e.version}
                            </Link>{" "}
                            <span className="muted">{where(e.locator)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {f.rule === "conflict" && f.status === "open" && (
                      <form action={resolveFinding}>
                        <input type="hidden" name="caseId" value={c.id} />
                        <input type="hidden" name="findingId" value={f.id} />
                        <fieldset>
                          <legend>Which source is right?</legend>
                          {[...new Set(f.evidence.map((e) => e.sourceId))].map((sourceId) => (
                            <label key={sourceId} style={{ display: "block" }}>
                              <input type="radio" name="acceptedSourceId" value={sourceId} required /> {sourceId}
                            </label>
                          ))}
                          <label style={{ display: "block" }}>
                            <input type="radio" name="acceptedSourceId" value="" /> Both (separate damages)
                          </label>
                        </fieldset>
                        <textarea name="reason" rows={2} required maxLength={1000} placeholder="Reason, e.g. workshop confirmed by phone" />
                        <button>Record resolution</button>
                      </form>
                    )}
                    {f.status === "resolved" && (
                      <div className="muted">
                        Resolved by {f.resolvedBy}: {f.resolutionReason}
                        {f.acceptedSourceId && <> · filing uses {f.acceptedSourceId}</>}
                      </div>
                    )}
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
                  {submission.approvedRevision} approved by {approval?.approvedBy} at {approval && fmt(approval.createdAt)}
                </p>
              ) : (
                <p className="notice">
                  Pending · {submission.attempts} attempt(s)
                  {submission.lastErrorCategory && <> · last error: {submission.lastErrorCategory}</>}
                </p>
              )}
              {approval && (
                <details>
                  <summary>Submitted payload (frozen at approval)</summary>
                  <pre>{JSON.stringify(approval.payload, null, 2)}</pre>
                </details>
              )}
            </div>
          )}
        </section>
      </div>

      <div className="card scroll">
        <h2>Timeline</h2>
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Rev.</th>
              <th>Operation</th>
              <th>Result</th>
              <th>Tool</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {view.events.map((e) => (
              <tr key={e.id}>
                <td>{fmt(e.createdAt)}</td>
                <td>{e.caseRevision}</td>
                <td>{e.operation}</td>
                <td>
                  {e.result}
                  {e.errorCategory && ` (${e.errorCategory})`}
                </td>
                <td>{e.tool ?? ""}</td>
                <td>
                  <code>{e.detail ? JSON.stringify(e.detail) : ""}</code>
                  {e.latencyMs !== null && <span className="muted"> · {e.latencyMs} ms</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
