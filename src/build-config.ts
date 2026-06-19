// Imported as a Bun macro, so the return value is inlined at build time and the
// bundle has no runtime dependency on PROXY_BASE.

/** The proxy base URL with no trailing slash, or "" to disable proxying. */
export function proxyBase(): string {
  const base = process.env.PROXY_BASE ?? "";
  return base.endsWith("/") ? base.slice(0, -1) : base;
}
