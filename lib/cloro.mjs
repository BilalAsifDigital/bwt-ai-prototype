// Thin Cloro API client for the prototype.
// Shapes mirror the production client (apps/platform-api/app/services/cloro_api_client.py):
//   POST {BASE}/monitor/{endpoint}  Authorization: Bearer <key>
//   payload: { prompt|query, country, include }
//   response: { success, result: { markdown, sources[], ... } }
// Citations = first 5 entries of result.sources (url or link key).

const BASE = process.env.CLORO_API_BASE_URL || "https://api.cloro.dev/v1";

export const PROVIDERS = {
  openai: {
    endpoint: "/monitor/chatgpt",
    label: "ChatGPT",
    payload: (q, region) => ({ prompt: q, country: region, include: { markdown: true, rawResponse: false, searchQueries: true } }),
  },
  perplexity: {
    endpoint: "/monitor/perplexity",
    label: "Perplexity",
    payload: (q, region) => ({ prompt: q, country: region, include: { markdown: true } }),
  },
  gemini: {
    endpoint: "/monitor/gemini",
    label: "Gemini",
    payload: (q, region) => ({ prompt: q, country: region, include: { markdown: true, html: false } }),
  },
  google_ai_mode: {
    endpoint: "/monitor/aimode",
    label: "Google AI Mode",
    payload: (q, region) => ({ prompt: q, country: region, include: { markdown: true } }),
  },
  google_ai_overview: {
    endpoint: "/monitor/google",
    label: "Google AI Overviews",
    payload: (q, region) => ({ query: q, country: region, include: { html: false, aioverview: { markdown: true } } }),
    nestedKey: "aioverview",
  },
};

function extractCitations(sources, limit = 5) {
  const out = [];
  for (const s of sources || []) {
    if (typeof s === "string" && s) out.push(s);
    else if (s && typeof s === "object") {
      const url = s.url || s.link;
      if (url) out.push(url);
    }
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Run one query against one provider. Returns
 * { ok, provider, citations[], markdown, creditsCharged, rateLimited?, retryAfter?, error? }
 */
export async function monitor(query, region, providerKey, apiKey, { timeoutMs = 90000 } = {}) {
  const provider = PROVIDERS[providerKey];
  if (!provider) return { ok: false, provider: providerKey, error: `unknown provider ${providerKey}` };
  if (!apiKey) return { ok: false, provider: providerKey, error: "CLORO_API_KEY not configured" };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${provider.endpoint}`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(provider.payload(query, (region || "US").toUpperCase())),
    });
    const creditsCharged = Number(res.headers.get("x-credits-charged") || 0);
    const creditsRemaining = Number(res.headers.get("x-credits-remaining") || 0);
    if (res.status === 429) {
      return {
        ok: false, provider: providerKey, rateLimited: true,
        retryAfter: Number(res.headers.get("retry-after") || 1),
      };
    }
    if (!res.ok) {
      const text = (await res.text()).slice(0, 300);
      return { ok: false, provider: providerKey, error: `HTTP ${res.status}: ${text}` };
    }
    const body = await res.json();
    const result = body.result || {};
    const dataSource = provider.nestedKey ? result[provider.nestedKey] || {} : result;
    return {
      ok: body.success !== false,
      provider: providerKey,
      citations: extractCitations(dataSource.sources),
      markdown: dataSource.markdown || "",
      creditsCharged,
      creditsRemaining,
    };
  } catch (e) {
    const aborted = e && e.name === "AbortError";
    return { ok: false, provider: providerKey, error: aborted ? `timeout after ${timeoutMs}ms` : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

/** Does any citation URL belong to the tracked domain (or its subdomains)? */
export function citesDomain(citations, domain) {
  const target = domain.toLowerCase().replace(/^www\./, "");
  const hits = [];
  for (const url of citations || []) {
    try {
      const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
      if (host === target || host.endsWith(`.${target}`)) hits.push(url);
    } catch { /* unparsable URL — skip */ }
  }
  return hits;
}
