/** Transport and validation for DeepSeek's standalone Search and Fetch APIs. */

import { setTimeout as delay } from "node:timers/promises";

const API_BASE = "https://api.deepseek.com/v1/tools";
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;
export const PRICE_PER_SUCCESSFUL_REQUEST_USD = 0.00075;

export interface SearchInput {
  query: string;
  allowed_domains?: string[];
  blocked_domains?: string[];
}

export interface SearchResult {
  rerank_score: number;
  title: string;
  url: string;
  snippet: string;
  summary: string;
  content: string;
  site_name: string | null;
  site_icon: string | null;
  date: string | null;
  authority: number;
}

export interface FetchPage {
  title: string;
  content: string;
}

function charCount(value: string): number {
  return Array.from(value).length;
}

function validateText(value: string, label: string): void {
  if (typeof value !== "string" || !value.trim() || charCount(value) > 128) {
    throw new Error(`${label} must contain 1 to 128 Unicode characters and cannot be blank.`);
  }
}

function validateDomains(domains: string[] | undefined, label: string): string[] {
  if (!domains) return [];
  if (!Array.isArray(domains)) throw new Error(`${label} must be a list of domain names.`);
  for (const domain of domains) {
    if (
      typeof domain !== "string" ||
      domain.length > 253 ||
      !/^(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)*[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(domain)
    ) {
      throw new Error(`${label} must contain plain domain names without schemes or paths.`);
    }
  }
  return domains;
}

export function buildSearchRequest(input: SearchInput): { query: string } {
  validateText(input.query, "query");
  const allowed = validateDomains(input.allowed_domains, "allowed_domains");
  const blocked = validateDomains(input.blocked_domains, "blocked_domains");
  if (allowed.length && blocked.length)
    throw new Error("allowed_domains and blocked_domains cannot be combined.");
  let query = input.query.trim();
  if (allowed.length) query += ` site:${allowed.join(" OR site:")}`;
  if (blocked.length) query += ` ${blocked.map((domain) => `-site:${domain}`).join(" ")}`;
  validateText(query, "query with domain filters");

  return { query };
}

export function validateFetchUrl(url: string): void {
  if (typeof url !== "string" || url.length > 8192)
    throw new Error("url must be at most 8192 characters.");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("url must be a valid HTTP(S) URL with a host.");
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error("url must be an HTTP(S) URL with a host and without a username or password.");
  }
}

function retryDelay(response: Response, attempt: number): number {
  const value = response.headers.get("retry-after");
  const seconds = value === null ? NaN : Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 5000);
  if (value) {
    const date = Date.parse(value);
    if (Number.isFinite(date)) return Math.min(Math.max(date - Date.now(), 0), 5000);
  }
  return 500 * 2 ** attempt;
}

async function postJson<T>(
  path: "search" | "fetch",
  apiKey: string,
  body: object,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
    let response: Response;
    try {
      response = await fetchImpl(`${API_BASE}/${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: requestSignal,
      });
    } catch (error) {
      if (!signal?.aborted && timeout.aborted && attempt < MAX_ATTEMPTS - 1) {
        await delay(500 * 2 ** attempt, undefined, { signal });
        continue;
      }
      throw error;
    }
    if (response.status === 200) return (await response.json()) as T;
    if (
      (response.status === 408 || response.status === 429 || response.status >= 500) &&
      attempt < MAX_ATTEMPTS - 1
    ) {
      await response.body?.cancel();
      await delay(retryDelay(response, attempt), undefined, { signal });
      continue;
    }
    let detail = response.statusText;
    try {
      const data = (await response.json()) as { error?: { message?: string } };
      detail = data.error?.message || detail;
    } catch {
      /* The API may return a non-JSON error body. */
    }
    throw new Error(`DeepSeek ${path} API ${response.status}: ${detail}`);
  }
  throw new Error(`DeepSeek ${path} API failed after ${MAX_ATTEMPTS} attempts.`);
}

export async function search(
  apiKey: string,
  input: SearchInput,
  signal?: AbortSignal,
  fetchImpl?: typeof fetch,
): Promise<{
  results: SearchResult[];
  billable: boolean;
  estimatedCostUsd: number;
}> {
  const data = await postJson<{ results: SearchResult[] }>(
    "search",
    apiKey,
    buildSearchRequest(input),
    signal,
    fetchImpl,
  );
  if (!Array.isArray(data?.results))
    throw new Error("DeepSeek Search returned an invalid results payload.");
  const billable = data.results.length > 0;
  return {
    results: data.results,
    billable,
    estimatedCostUsd: billable ? PRICE_PER_SUCCESSFUL_REQUEST_USD : 0,
  };
}

export async function fetchPage(
  apiKey: string,
  url: string,
  signal?: AbortSignal,
  fetchImpl?: typeof fetch,
): Promise<{ page: FetchPage; billable: boolean; estimatedCostUsd: number }> {
  validateFetchUrl(url);
  const page = await postJson<FetchPage>("fetch", apiKey, { url }, signal, fetchImpl);
  if (typeof page?.title !== "string" || typeof page?.content !== "string")
    throw new Error("DeepSeek Fetch returned an invalid page payload.");
  const billable = page.content.length > 0;
  return {
    page,
    billable,
    estimatedCostUsd: billable ? PRICE_PER_SUCCESSFUL_REQUEST_USD : 0,
  };
}
