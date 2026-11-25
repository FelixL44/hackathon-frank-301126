// Source viewer: the exact page or photo behind an observation, with the cited words highlighted.
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { pdfPages } from "../../../../../../extraction/model-extractor.ts";
import { getDb } from "../../../../../../server/db.ts";
import { readObject } from "../../../../../../storage/objects.ts";
import { caseView, WorkflowError } from "../../../../../../workflow/cases.ts";
import { BrokerShell } from "../../../../../broker-shell.tsx";
import { caseHref, caseListHref } from "../../../../../case-navigation.ts";
import { Highlight } from "../../../../../highlight.tsx";
import { sourceHref } from "../../../../../status.ts";

export const dynamic = "force-dynamic";

const Params = z.object({ id: z.uuid(), sourceId: z.string().regex(/^[a-z0-9-]{1,64}$/), version: z.coerce.number().int().min(1) });

export default async function SourcePage(props: {
  params: Promise<Record<string, string>>;
  searchParams: Promise<{ page?: string; quote?: string; from?: string; tab?: string }>;
}) {
  const params = Params.safeParse(await props.params);
  if (!params.success) notFound();
  const { id, sourceId, version } = params.data;
  const search = await props.searchParams;
  const from = caseListHref(search.from);
  const tab = search.tab === "activity" ? "activity" : undefined;
  const view = await caseView(await getDb(), id).catch((e) => {
    if (e instanceof WorkflowError && e.code === "not_found") notFound();
    throw e;
  });
  const artifact = view.artifacts.find((a) => a.sourceId === sourceId && a.version === version);
  if (!artifact) notFound();
  const latest = Math.max(...view.artifacts.filter((a) => a.sourceId === sourceId).map((a) => a.version));
  const cited = view.observations.filter((o) => o.sourceId === sourceId && o.version === version);
  const fileUrl = `/cases/${id}/sources/${sourceId}/${version}/file`;

  let pages: string[] | null = null;
  let available = true;
  try {
    const bytes = await readObject(artifact.objectKey);
    if (artifact.mediaType === "application/pdf") pages = await pdfPages(bytes);
    else if (artifact.mediaType === "text/plain") pages = [new TextDecoder().decode(bytes)];
  } catch {
    available = false;
  }
  const page = Math.min(Math.max(Number(search.page) || 1, 1), pages?.length ?? 1);

  return (
    <BrokerShell returnTo={from}>
      <Link className="case-back" href={caseHref(id, { from, tab })}><ArrowLeft size={16} aria-hidden="true" /> Back to {view.case.reference}</Link>
      <header className="row broker-heading">
        <div>
          <h1>
            {sourceId} v{version}
          </h1>
          <p className="muted">
            {artifact.kind} · {artifact.mediaType}
            {artifact.supersedesVersion && <> · replaces v{artifact.supersedesVersion}</>}
          </p>
        </div>
      </header>

      {latest > version && (
        <p className="notice">
          This version was replaced. <Link href={sourceHref(id, { sourceId, version: latest }, from, tab)}>Open v{latest}</Link>
        </p>
      )}
      {!available && <p className="notice">This file is not available yet. The observations below still show what was read.</p>}

      <div className={available ? "viewer" : undefined}>
        {available && <div className="card review-panel">
          {available && artifact.mediaType === "application/pdf" && (
            <iframe src={`${fileUrl}#page=${page}`} title={`${sourceId} page ${page}`} />
          )}
          {available && artifact.kind === "photo" && (
            <img src={fileUrl} alt={cited.map((o) => (o.locator.type === "image" ? o.locator.description : "")).join("; ")} />
          )}
          {available && artifact.mediaType === "text/plain" && (
            <blockquote className="quote" lang="pt">
              <Highlight text={pages![0]!} quote={search.quote} />
            </blockquote>
          )}
        </div>}

        <div className="card review-panel">
          {pages && artifact.mediaType === "application/pdf" && (
            <>
              <h2>
                Text on page {page} of {pages.length}
              </h2>
              <p className="pagetext" lang="pt">
                <Highlight text={pages[page - 1]!} quote={search.quote} />
              </p>
              <p className="muted">
                Pages:{" "}
                {pages.map((_, i) => (
                  <span key={i}>
                    <Link href={`?${new URLSearchParams({ page: String(i + 1), ...(from !== "/" && { from }), ...(tab && { tab }) })}`}>{i + 1}</Link>{" "}
                  </span>
                ))}
              </p>
            </>
          )}
          <h2>Read from this source</h2>
          {cited.length === 0 ? (
            <p className="muted">Nothing was extracted from this version.</p>
          ) : (
            <ul>
              {cited.map((o) => (
                <li key={o.id}>
                  <strong>{o.field}</strong>: {o.value ?? <em>unknown</em>}
                  {o.normalized && o.normalized !== o.value && <span className="muted"> → {o.normalized}</span>}
                  <br />
                  {o.locator.type === "text" ? (
                    <Link href={sourceHref(id, o, from, tab)} className="muted">
                      p. {o.locator.page}: “{o.locator.quote}”
                    </Link>
                  ) : (
                    <span className="muted">{o.locator.description}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </BrokerShell>
  );
}
