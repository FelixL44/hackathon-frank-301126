import { ArrowDown, ArrowUp, ArrowLeft, ArrowRight, ChevronDown, FileText, Plus, Search } from "lucide-react";
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
    for (const [key, value] of [...values]) if (!value) values.delete(key);
    return values.size ? `/?${values}` : "/";
  }

  const from = href(pageNumber > 1 ? { page: String(pageNumber) } : {});
  const next = rows.find((c) => c.status === "broker_review") ??
    rows.find((c) => c.status === "awaiting_information" && !c.contacted) ??
    rows.find((c) => c.status === "awaiting_approval");

  return (
    <BrokerShell queue={active} counts={counts}>
      <header className="row broker-heading">
        <h1>{active === "all" ? "Claims workspace" : queues.find((item) => item.id === active)?.label}</h1>
        <div className="broker-heading-actions">
          {next && <Link className="broker-button" href={caseHref(next.id, { from })}>Open next case <ArrowRight size={16} aria-hidden="true" /></Link>}
          <details className="demo-menu">
            <summary className="broker-button primary-action"><Plus size={18} aria-hidden="true" /> New demo case</summary>
            <form action={launchFixture} className="demo-options">
              {Object.entries(FIXTURE_CASES).map(([id, fixture]) => (
                <button type="submit" className="secondary" key={id} name="fixtureId" value={id}>{fixture.title}</button>
              ))}
            </form>
          </details>
        </div>
      </header>

      <section className="card table-panel" aria-labelledby="queue-heading">
        <header className="table-toolbar">
          <div className="table-total">
            <span id="queue-heading">Total results</span>
            <strong>{matching.length} {matching.length === 1 ? "case" : "cases"}</strong>
          </div>
          <div className="case-filters">
            <details className="pill-menu">
              <summary className="broker-button">{selected ? STATUS[selected].label : "All statuses"} <ChevronDown size={16} aria-hidden="true" /></summary>
              <nav className="pill-options" aria-label="Filter by status">
                <Link href={href({ status: "", page: "" })} aria-current={!selected ? "true" : undefined}>All statuses</Link>
                {CaseStatus.options.filter((value) => inQueue(value, active)).map((value) => (
                  <Link key={value} href={href({ status: value, page: "" })} aria-current={selected === value ? "true" : undefined}>{STATUS[value].label}</Link>
                ))}
              </nav>
            </details>
            <form action="/" role="search" className="broker-search">
              {active !== "all" && <input type="hidden" name="queue" value={active} />}
              {selected && <input type="hidden" name="status" value={selected} />}
              {oldest && <input type="hidden" name="sort" value="oldest" />}
              <Search size={18} aria-hidden="true" />
              <input name="q" type="search" maxLength={160} aria-label="Search assigned cases" placeholder="Search" defaultValue={query} />
            </form>
            {(selected || query) && <Link href={active === "all" ? "/" : `/?queue=${active}`} className="filter-reset">Clear</Link>}
          </div>
        </header>
        <div className="scroll">
          <table className="case-table">
            <thead>
              <tr>
                <th scope="col">Case</th>
                <th scope="col">Next action</th>
                <th scope="col" className="case-status-column">Status</th>
                <th scope="col" className="case-updated-column" aria-sort={oldest ? "ascending" : "descending"}>
                  <Link href={href({ sort: oldest ? "" : "oldest" })}>
                    Last updated {oldest ? <ArrowUp size={14} aria-hidden="true" /> : <ArrowDown size={14} aria-hidden="true" />}
                  </Link>
                </th>
                <th scope="col" className="case-policy-column">Policy</th>
              </tr>
            </thead>
            <tbody>
              {results.map((c) => {
                const actor = caseActor(c.status, c.contacted);
                return (
                  <tr key={c.id}>
                    <td><div className="case-identity">
                      <span className="case-avatar" aria-hidden="true">{c.reference.replace(/\W/g, "").slice(-2)}</span>
                      <span><Link className="case-reference" href={caseHref(c.id, { from })}>{c.reference}</Link>
                        {c.message && <small title={c.message}>{c.message}</small>}
                        <span className={`badge compact-case-status ${c.status}`}>{STATUS[c.status].label}</span>
                      </span>
                    </div></td>
                    <td><span className={`case-actor actor-${actor}`} title={`${actor} acts next`}>{nextCaseAction(c.status, c.contacted)}</span></td>
                    <td className="case-status-column"><span className={`badge ${c.status}`}>{STATUS[c.status].label}</span></td>
                    <td className="case-updated-column"><time dateTime={c.updatedAt.toISOString()}>{date.format(c.updatedAt)}</time></td>
                    <td className="case-policy-column"><span className="case-chip">{c.policy ?? "Unknown"}</span>{c.vehicle && <small>{c.vehicle}</small>}</td>
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
          <span>{pageNumber > 1
            ? <Link className="broker-button" href={href({ page: String(pageNumber - 1) })}><ArrowLeft size={16} aria-hidden="true" /> Previous</Link>
            : <span className="broker-button" aria-disabled="true"><ArrowLeft size={16} aria-hidden="true" /> Previous</span>}</span>
          <nav className="case-pagination" aria-label="Case list pages">
            {/* shortcut: lists every page number, fine for demo volumes; add an ellipsis past ~10 pages */}
            {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
              <Link key={n} className="page-number" href={href({ page: n > 1 ? String(n) : "" })} aria-current={n === pageNumber ? "page" : undefined}>{n}</Link>
            ))}
          </nav>
          <span>{pageNumber < pages
            ? <Link className="broker-button" href={href({ page: String(pageNumber + 1) })}>Next <ArrowRight size={16} aria-hidden="true" /></Link>
            : <span className="broker-button" aria-disabled="true">Next <ArrowRight size={16} aria-hidden="true" /></span>}</span>
        </footer>
      </section>
    </BrokerShell>
  );
}
