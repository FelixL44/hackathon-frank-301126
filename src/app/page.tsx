import Link from "next/link";
import { desc } from "drizzle-orm";
import { FIXTURE_CASES } from "../../fixtures/cases.ts";
import { cases } from "../db/schema.ts";
import { getDb } from "../server/db.ts";
import { launchFixture } from "./actions.ts";
import { fmt, STATUS } from "./status.ts";

export const dynamic = "force-dynamic";

export default async function Inbox() {
  const rows = await (await getDb()).select().from(cases).orderBy(desc(cases.updatedAt));
  return (
    <main>
      <div className="row">
        <div>
          <h1>Inbox</h1>
          <p className="muted">Active motor damage cases and who needs to act.</p>
        </div>
        <form action={launchFixture}>
          {Object.entries(FIXTURE_CASES).map(([id, f]) => (
            <button key={id} name="fixtureId" value={id}>
              New demo case: {f.title}
            </button>
          ))}
        </form>
      </div>
      <div className="card scroll">
        {rows.length === 0 ? (
          <p className="muted">No cases yet. Start a demo case above.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Case</th>
                <th>Status</th>
                <th>Who acts</th>
                <th>Policy</th>
                <th>Vehicle</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/cases/${c.id}`}>{c.reference}</Link>
                  </td>
                  <td>
                    <span className={`badge ${c.status}`}>{STATUS[c.status].label}</span>
                  </td>
                  <td>{STATUS[c.status].actor}</td>
                  <td>{c.policyReference ?? "unknown"}</td>
                  <td>{c.vehicleId ?? "unknown"}</td>
                  <td>{fmt(c.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
