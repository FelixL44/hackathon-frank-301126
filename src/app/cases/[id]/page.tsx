import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import type { Locator } from "../../../domain/schema.ts";
import { getDb } from "../../../server/db.ts";
import { caseView, WorkflowError } from "../../../workflow/cases.ts";
import { approveCase } from "../../actions.ts";
import { fmt, STATUS } from "../../status.ts";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  stale_approval: "This revision is no longer current. Review the new evidence before approving.",
  not_ready: "The case is not ready for approval.",
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

      {error && <p className="notice">{ERRORS[error] ?? error}</p>}

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
                <li key={`${a.sourceId}-${a.version}`}>
                  <strong>{a.sourceId}</strong> v{a.version} · {a.kind}
                  {a.supersedesVersion && <> · replaces v{a.supersedesVersion}</>}
                  <br />
                  <span className="muted">{a.objectKey} (source viewer: HAC-10)</span>
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
                      {o.sourceId} v{o.version}
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
