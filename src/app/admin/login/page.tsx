import Link from "next/link";
import { ActionButton } from "../../action-button.tsx";
import { usingDefaultPassword } from "../../../server/auth.ts";
import { signIn } from "../actions.ts";

export const metadata = { title: "Admin sign in · Claim intake" };

type SearchParams = Record<string, string | string[] | undefined>;

export default async function AdminLogin({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { error } = await searchParams;
  const failed = error === "1";
  const showDemoHint = usingDefaultPassword();

  return (
    <main className="admin-login">
      <section className="card admin-login-card" aria-labelledby="admin-login-title">
        <img className="admin-login-logo" src="/frank-logo.webp" alt="FRANK" width={128} height={43} />
        <h1 id="admin-login-title">Admin workspace</h1>
        <p className="muted admin-login-intro">Claim agents, integration settings and the demo connectors.</p>

        {failed && (
          <p className="notice error" role="alert">
            That password did not match. Try again.
          </p>
        )}

        <form action={signIn} className="admin-login-form">
          <label className="admin-field" htmlFor="admin-password">
            <span className="admin-field-label">Password</span>
            <input
              className="admin-input"
              id="admin-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              autoFocus
            />
          </label>
          <ActionButton pendingLabel="Signing in…">Sign in</ActionButton>
        </form>

        {showDemoHint && (
          <p className="admin-hint">
            Demo password <code>frank-admin</code>. Set <code>ADMIN_PASSWORD</code> in the server environment to change it.
          </p>
        )}

        <hr className="nav-divider" />
        <p className="muted admin-login-footer">
          Looking for claims? <Link href="/">Open the broker workspace</Link>.
        </p>
      </section>
    </main>
  );
}
