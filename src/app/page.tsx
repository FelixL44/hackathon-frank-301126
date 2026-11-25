import { ArrowDown, ArrowUp, ArrowLeft, ArrowRight, ArrowUpRight, ChevronDown, FileText, Filter, Plus, Search } from "lucide-react";
import { and, desc, eq, exists, like, sql } from "drizzle-orm";
import Link from "next/link";
import { FIXTURE_CASES } from "../../fixtures/cases.ts";
import { cases, messages } from "../db/schema.ts";
import { SENT_REQUEST_PREFIX } from "../domain/customer-request.ts";
import { CaseStatus } from "../domain/schema.ts";
import { getDb } from "../server/db.ts";
import { launchFixture } from "./actions.ts";
import { caseHref } from "./case-navigation.ts";
import { BrokerShell, queues, type Queue } from "./broker-shell.tsx";
import { caseActor, nextCaseAction, STATUS } from "./status.ts";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 6;
const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Lisbon" });

function inQueue(status: CaseStatus, queue: Queue, contacted?: boolean) {
  switch (queue) {
    case "review": return status === "broker_review" || status === "awaiting_approval" ||
      (status === "awaiting_information" && contacted !== true);
    case "waiting": return status === "awaiting_information" && contacted !== false;
    case "submitted": return status === "submitted";
    default: return true;
  }
}

type SearchParams = Record<string, string | string[] | undefined>;

export default async function Inbox({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { queue, q, status, sort, page } = await searchParams;
  const active = queues.find((item) => item.id === queue)?.id ?? "all";
  const query = typeof q === "string" ? q.trim().slice(0, 160) : "";
  const validStatus = CaseStatus.safeParse(status).data;
  const selected = validStatus && inQueue(validStatus, active) ? validStatus : undefined;
  const oldest = sort === "oldest";
  const db = await getDb();
  const latestMessage = db.select({ body: messages.body }).from(messages)
    .where(and(eq(messages.caseId, cases.id), eq(messages.direction, "inbound"), eq(messages.role, "customer")))
    .orderBy(desc(messages.createdAt), desc(messages.id)).limit(1).as("latest_message");
  const sentRequest = db.select({ id: messages.id }).from(messages).where(and(
    eq(messages.caseId, cases.id), eq(messages.direction, "outbound"), eq(messages.role, "customer"),
    eq(messages.status, "sent"), like(messages.requestKey, sql`concat(${SENT_REQUEST_PREFIX}::text, ${cases.revision}, ':%')`),
  ));
  const rows = await db.select({
    id: cases.id, reference: cases.reference, status: cases.status, policy: cases.policyReference,
    vehicle: cases.vehicleId, updatedAt: cases.updatedAt, message: latestMessage.body,
    contacted: exists(sentRequest).mapWith(Boolean),
  }).from(cases).leftJoinLateral(latestMessage, sql`true`)
    .orderBy(desc(cases.updatedAt), desc(cases.id));

  const counts: Record<Queue, number> = {
    all: rows.length,
    review: rows.filter((c) => inQueue(c.status, "review", c.contacted)).length,
    waiting: rows.filter((c) => inQueue(c.status, "waiting", c.contacted)).length,
    submitted: rows.filter((c) => inQueue(c.status, "submitted", c.contacted)).length,
  };
  const needle = query.toLocaleLowerCase();
  const matching = rows.filter((c) => inQueue(c.status, active, c.contacted) && (!selected || selected === c.status) &&
    (!needle || [c.reference, c.policy, c.vehicle, c.message].some((value) => value?.toLocaleLowerCase().includes(needle))));
  if (oldest) matching.reverse();
  const pages = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
  const pageNumber = Math.min(pages, Math.max(1, typeof page === "string" && /^\d+$/.test(page) ? Number(page) : 1));
  const start = (pageNumber - 1) * PAGE_SIZE;
  const results = matching.slice(start, start + PAGE_SIZE);

  function href(params: Record<string, string>) {
    const values = new URLSearchParams({
      ...(active !== "all" && { queue: active }), ...(query && { q: query }),
      ...(selected && { status: selected }), ...(oldest && { sort: "oldest" }), ...params,
    });
    return values.size ? `/?${values}` : "/";
  }

  const from = href(pageNumber > 1 ? { page: String(pageNumber) } : {});
  const next = rows.find((c) => c.status === "broker_review") ??
    rows.find((c) => c.status === "awaiting_information" && !c.contacted) ??
    rows.find((c) => c.status === "awaiting_approval");

  return (
    <BrokerShell queue={active} counts={counts}>
      <header className="row broker-heading">
        <div>
          <h1>{active === "all" ? "Claims workspace" : queues.find((item) => item.id === active)?.label}</h1>
        </div>
        <details className="demo-menu">
          <summary className="broker-button primary-action"><Plus size={18} aria-hidden="true" /> New demo case <ChevronDown size={15} aria-hidden="true" /></summary>
          <form action={launchFixture} className="demo-options">
            {Object.entries(FIXTURE_CASES).map(([id, fixture]) => (
              <button type="submit" className="secondary" key={id} name="fixtureId" value={id}>{fixture.title}</button>
            ))}
          </form>
        </details>
      </header>

      {active === "all" && (
        <section className="queue-summary" aria-label="Case overview">
          <div className="card queue-feature">
            <div>
              <span className="queue-feature-label">Needs my action</span>
              <p><strong>{counts.review}</strong> {counts.review === 1 ? "claim to review" : "claims to review"}</p>
            </div>
            {next ? (
              <Link className="broker-button" href={caseHref(next.id, { from })}>
                Open next case <ArrowRight size={16} aria-hidden="true" />
              </Link>
            ) : <span className="queue-feature-clear">You’re all caught up</span>}
          </div>
          {queues.filter(({ id }) => id === "waiting" || id === "submitted").map(({ id, label, icon: Icon }) => (
            <Link className="card queue-card" key={id} href={`/?queue=${id}`}>
              <span className="queue-card-top"><span className="icon-tile"><Icon size={18} aria-hidden="true" /></span><ArrowUpRight size={16} aria-hidden="true" /></span>
              <strong>{counts[id]}</strong>
              <span>{label}</span>
            </Link>
          ))}
        </section>
      )}

      <section className="card table-panel" aria-labelledby="queue-heading">
        <header className="table-toolbar">
          <div>
            <h2 id="queue-heading">Assigned cases</h2>
            <p className="muted">{matching.length} {matching.length === 1 ? "case" : "cases"}</p>
          </div>
          <form action="/" className="case-filters">
            {active !== "all" && <input type="hidden" name="queue" value={active} />}
            {oldest && <input type="hidden" name="sort" value="oldest" />}
            <label className="case-filter"><Filter size={16} aria-hidden="true" />
              <select name="status" aria-label="Case status" defaultValue={selected ?? ""}>
                <option value="">All statuses</option>
                {CaseStatus.options.filter((value) => inQueue(value, active)).map((value) => (
                  <option value={value} key={value}>{STATUS[value].label}</option>
                ))}
              </select><ChevronDown size={14} aria-hidden="true" />
            </label>
            <label className="broker-search"><Search size={17} aria-hidden="true" />
              <input name="q" type="search" maxLength={160} aria-label="Search assigned cases" placeholder="Search cases" defaultValue={query} />
            </label>
            <button type="submit" className="secondary broker-button">Apply</button>
            <Link className="broker-button compact-sort" href={href({ sort: oldest ? "" : "oldest" })} aria-label={oldest ? "Sort newest first" : "Sort oldest first"}>
              {oldest ? <ArrowUp size={15} aria-hidden="true" /> : <ArrowDown size={15} aria-hidden="true" />} Updated
            </Link>
            {(selected || query) && <Link href={active === "all" ? "/" : `/?queue=${active}`} className="filter-reset">Clear</Link>}
          </form>
        </header>
        <div className="scroll">
          <table className="case-table">
            <thead>
              <tr>
                <th scope="col">Case / customer report</th>
                <th scope="col" className="case-status-column">Status</th>
                <th scope="col">Next action</th>
                <th scope="col" className="case-policy-column">Policy / vehicle</th>
                <th scope="col" className="case-updated-column" aria-sort={oldest ? "ascending" : "descending"}>
                  <Link href={href({ sort: oldest ? "" : "oldest" })}>
                    Updated {oldest ? <ArrowUp size={13} aria-hidden="true" /> : <ArrowDown size={13} aria-hidden="true" />}
                  </Link>
                </th>
                <th scope="col" aria-label="Open case" />
              </tr>
            </thead>
            <tbody>
              {results.map((c) => {
                const actor = caseActor(c.status, c.contacted);
                return (
                  <tr key={c.id}>
                    <td><div className="case-identity">
                      <span className="icon-tile"><FileText size={17} aria-hidden="true" /></span>
                      <span><Link className="case-reference" href={caseHref(c.id, { from })}>{c.reference}</Link>
                        {c.message && <small title={c.message}>{c.message}</small>}
                        <span className={`badge compact-case-status ${c.status}`}>{STATUS[c.status].label}</span>
                      </span>
                    </div></td>
                    <td className="case-status-column"><span className={`badge ${c.status}`}>{STATUS[c.status].label}</span></td>
                    <td><span className={`case-actor ${actor === "Broker" ? "actor-broker" : ""}`}>{nextCaseAction(c.status, c.contacted)}</span>{actor !== "Complete" && <small className="actor-label">{actor}</small>}</td>
                    <td className="case-policy-column">{c.policy ?? "Unknown"}{c.vehicle && <small>{c.vehicle}</small>}</td>
                    <td className="case-updated-column"><time dateTime={c.updatedAt.toISOString()}>{date.format(c.updatedAt)}</time></td>
                    <td><Link className="case-open" href={caseHref(c.id, { from })} aria-label={`Open ${c.reference}`}><ArrowUpRight size={17} /></Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!results.length && (
            <div className="case-empty">
              <span className="icon-tile"><FileText size={21} aria-hidden="true" /></span>
              <strong>{rows.length ? "No cases found" : "No assigned cases yet"}</strong>
              <span className="muted">{rows.length ? "Try a different queue or search." : "Open a demo case to review a sample customer report."}</span>
            </div>
          )}
        </div>
        <footer className="table-footer">
          <span className="muted">{matching.length ? `Showing ${start + 1}–${start + results.length} of ${matching.length}` : "0 results"}</span>
          {pages > 1 && <nav className="case-pagination" aria-label="Case list pages">
            {pageNumber > 1 && <Link className="broker-button" href={href({ page: String(pageNumber - 1) })}><ArrowLeft size={15} /> Previous</Link>}
            <span className="muted">Page {pageNumber} of {pages}</span>
            {pageNumber < pages && <Link className="broker-button" href={href({ page: String(pageNumber + 1) })}>Next <ArrowRight size={15} /></Link>}
          </nav>}
        </footer>
      </section>
    </BrokerShell>
  );
}
