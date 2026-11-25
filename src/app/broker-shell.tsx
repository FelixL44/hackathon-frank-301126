import { Archive, ArrowUpRight, ChevronRight, ClipboardCheck, Clock3, Inbox, Search, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { getDb } from "../server/db.ts";
import { extractionStatus } from "../server/extractor.ts";

export const queues = [
  { id: "all", label: "All cases", icon: Inbox },
  { id: "review", label: "Needs my action", icon: ClipboardCheck },
  { id: "waiting", label: "Waiting for reply", icon: Clock3 },
  { id: "submitted", label: "Submitted", icon: Archive },
] as const;

export type Queue = (typeof queues)[number]["id"];

export async function BrokerShell({
  children, queue, counts, reference,
}: {
  children: ReactNode;
  queue?: Queue;
  counts?: Record<Queue, number>;
  reference?: string;
}) {
  const mode = await extractionStatus(await getDb());

  return (
    <div className="broker-shell">
      <aside className="broker-sidebar">
        <Link className="workspace-brand" href="/">
          <span className="workspace-mark"><ShieldCheck size={21} /></span>
          <span><strong>Frank</strong><small>Broker workspace</small></span>
        </Link>
        <form action="/" role="search" className="broker-search sidebar-search">
          <Search size={17} aria-hidden="true" />
          <input name="q" type="search" aria-label="Quick search all cases" placeholder="Quick search" />
        </form>
        <nav aria-label="Case queues" className="broker-nav">
          {queues.map(({ id, label, icon: Icon }) => (
            <Link key={id} href={id === "all" ? "/" : `/?queue=${id}`} aria-current={id === queue ? "page" : reference && id === "all" ? "location" : undefined}>
              <Icon size={18} aria-hidden="true" /> <span>{label}</span>
              {counts && <span className="nav-count">{counts[id]}</span>}
            </Link>
          ))}
        </nav>
        <div className="broker-sidebar-footer">
          <a className="workspace-guide" href="/architecture.html">Workflow guide <ArrowUpRight size={15} aria-hidden="true" /></a>
          <div className="workspace-account">
            <span className="workspace-avatar" aria-hidden="true">B</span>
            <span><strong>Demo broker</strong><small title={mode}>{mode.startsWith("fixture data") ? "Fixture extraction" : mode}</small></span>
          </div>
        </div>
      </aside>
      <main className="broker-main">
        <nav className="broker-crumbs" aria-label="Breadcrumb">
          <Link href="/">Workspace</Link><ChevronRight size={14} aria-hidden="true" />
          {reference ? (
            <><Link href="/">Cases</Link><ChevronRight size={14} aria-hidden="true" /><span aria-current="page">{reference}</span></>
          ) : <span aria-current="page">Cases</span>}
        </nav>
        {children}
      </main>
    </div>
  );
}
