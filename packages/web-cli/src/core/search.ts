import { httpFetch } from "./http.ts";

const SEARX_INSTANCE = "https://search.banned.dynv6.net";

/** A single search result. */
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchOptions {
  /** Maximum number of results to return. */
  limit?: number;
  signal?: AbortSignal;
}

/** Search the web, returning results in relevance order. */
export async function search(
  query: string,
  { limit, signal }: SearchOptions = {},
): Promise<SearchResult[]> {
  const params = new URLSearchParams({ q: query, format: "json" });
  const response = await httpFetch(`${SEARX_INSTANCE}/search?${params}`, {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) {
    throw new Error(
      `Search request failed: ${response.status} ${response.statusText}`,
    );
  }
  const { results } = (await response.json()) as {
    results: { title?: string; url?: string; content?: string }[];
  };
  const mapped = results.map(({ title, url, content }) => ({
    title: title?.trim() ?? "",
    url: url?.trim() ?? "",
    snippet: content?.trim() ?? "",
  }));
  return limit === undefined ? mapped : mapped.slice(0, limit);
}

/** Render results as a numbered Markdown list. */
export function formatSearchResults(results: readonly SearchResult[]): string {
  return results
    .map(({ title, url, snippet }, i) => {
      const number = i + 1;
      const indent = " ".repeat(String(number).length + 2);
      return `${number}. [${title}](${url})\n${indent}${snippet}\n`;
    })
    .join("\n");
}
