import type { NextConfig } from "next";

const config: NextConfig = {
  // Loaded from node_modules at runtime instead of bundled: PGlite ships WASM, postgres.js opens raw sockets, unpdf bundles pdf.js.
  serverExternalPackages: ["@electric-sql/pglite", "postgres", "unpdf"],
};

export default config;
