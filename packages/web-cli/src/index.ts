export { type FetchAsMarkdownOptions, fetchAsMarkdown } from "./core/fetch.ts";
export {
  type FetchPageOptions,
  fetchPage,
  fetchPageAsCurl,
  httpFetch,
  type Page,
} from "./core/http.ts";
export { rewriteUrl } from "./core/rewrite.ts";
export {
  formatSearchResults,
  type SearchOptions,
  type SearchResult,
  search,
} from "./core/search.ts";
