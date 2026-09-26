import { EnvHttpProxyAgent, fetch as undiciFetch } from "undici";
import type { Fetch } from "../core/http.ts";

// Node's fetch ignores HTTP_PROXY / HTTPS_PROXY / NO_PROXY; undici's agent
// implements them. It is paired with undici's own fetch because Node's bundled
// fetch driving an npm undici dispatcher can hand back compressed bodies
// undecoded. Bun honors the proxy environment natively and ignores `dispatcher`.
const agent = new EnvHttpProxyAgent();

/** `fetch` that honors the proxy environment variables. */
export const proxyFetch: Fetch = (url, init) =>
  undiciFetch(url, {
    ...(init as Parameters<typeof undiciFetch>[1]),
    dispatcher: agent,
  }) as unknown as Promise<Response>;
