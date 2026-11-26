import type { ReactNode } from "react";
import "./admin.css";

export const metadata = { title: "Admin workspace · Claim intake", description: "Demo admin for claim agents and integrations" };

/** The login page lives here too, so this layout never checks the session. The workspace group does. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return children;
}
