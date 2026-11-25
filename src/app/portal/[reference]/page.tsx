import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { portalReceipts } from "../../../db/schema.ts";
import { getDb } from "../../../server/db.ts";
import { fmt } from "../../status.ts";

export const dynamic = "force-dynamic";

export default async function PortalReceipt(props: { params: Promise<{ reference: string }> }) {
  const { reference } = await props.params;
  const [receipt] = await (await getDb())
    .select()
    .from(portalReceipts)
    .where(eq(portalReceipts.portalReference, reference));
  if (!receipt) notFound();

  return (
    <main>
      <nav className="broker-crumbs" aria-label="Breadcrumb"><Link href="/">Cases</Link><span aria-hidden="true">›</span><span aria-current="page">Portal receipt</span></nav>
      <p className="notice sim">
        <strong>Simulated insurer portal.</strong> Not a real carrier. It exists to demonstrate idempotent filing.
      </p>
      <h1>Receipt {receipt.portalReference}</h1>
      <p className="muted">
        Received {fmt(receipt.receivedAt)} · idempotency key <code>{receipt.idempotencyKey}</code>
      </p>
      <div className="card">
        <h2>Filed claim</h2>
        <pre>{JSON.stringify(receipt.payload, null, 2)}</pre>
      </div>
    </main>
  );
}
