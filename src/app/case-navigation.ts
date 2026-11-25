export type CaseTab = "review" | "messages" | "activity";

/** A case can return only to the workspace's case list. */
export function caseListHref(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/?")) return "/";
  const params = new URLSearchParams(value.slice(2));
  for (const key of [...params.keys()]) {
    if (!["queue", "q", "status", "sort", "page"].includes(key)) params.delete(key);
  }
  const query = params.toString();
  return query ? `/?${query}` : "/";
}

export function caseHref(
  id: string,
  { from, tab, error, topic, anchor }: { from?: unknown; tab?: CaseTab; error?: string; topic?: string; anchor?: string } = {},
) {
  const params = new URLSearchParams();
  const list = caseListHref(from);
  if (list !== "/") params.set("from", list);
  if (tab && tab !== "review") params.set("tab", tab);
  if (error) params.set("error", error);
  if (topic) params.set("topic", topic);
  return `/cases/${id}${params.size ? `?${params}` : ""}${anchor ? `#${anchor}` : ""}`;
}
