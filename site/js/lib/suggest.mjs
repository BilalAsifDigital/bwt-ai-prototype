// Suggestion engine: turn BWT grounding queries into "queries worth tracking".
//
// Heuristic v1 (no LLM key needed). Each grounding query is scored, deduped
// against near-identical siblings, and labeled:
//   - usable:  reads like a natural search prompt, track as-is
//   - rewrite: machine-generated retrieval phrasing; a suggested natural
//              rewrite is produced with a template (an LLM pass can replace
//              this later without changing the data shape)

// Bing intent taxonomy -> Wellows intent taxonomy
const INTENT_MAP = {
  informational: "informational",
  commercial: "commercial",
  transactional: "transactional",
  navigational: "navigational",
  research: "informational",
  "learn and solve": "informational",
  creation: "informational",
  others: "informational",
};

export function mapIntent(bingIntent) {
  if (!bingIntent) return "informational";
  return INTENT_MAP[bingIntent.trim().toLowerCase()] || "informational";
}

const STOPWORDS = new Set([
  "the", "a", "an", "for", "of", "to", "in", "on", "with", "and", "or", "vs",
]);

function tokens(q) {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !STOPWORDS.has(t));
}

/** Jaccard similarity over token sets — cheap near-duplicate detection. */
function similarity(aTokens, bTokens) {
  const a = new Set(aTokens);
  const b = new Set(bTokens);
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Does the grounding query already read like a natural prompt? */
export function readsNaturally(q) {
  const lower = q.toLowerCase().trim();
  const words = lower.split(/\s+/);
  // Question-form or how-to style phrases read naturally.
  if (/^(how|what|which|why|where|when|who|is|are|can|should|do|does)\b/.test(lower)) return true;
  // "best X for Y", "top N X" patterns are natural commercial prompts.
  if (/^(best|top|cheapest|free|leading)\b/.test(lower) && words.length >= 3 && words.length <= 9) return true;
  // Very short fragments ("humanizer", "launch readiness") are too ambiguous.
  if (words.length < 3) return false;
  // Keyword-stuffed retrieval strings tend to be long noun piles with no verbs
  // or connectives; flag those for rewrite.
  const hasConnective = /\b(for|to|with|in|that|which|how)\b/.test(lower);
  if (words.length >= 6 && !hasConnective) return false;
  return words.length <= 8;
}

/** Template rewrite of a retrieval phrase into a natural prompt (LLM-replaceable). */
export function templateRewrite(q, intent) {
  const lower = q.trim().replace(/\s+/g, " ");
  const mapped = mapIntent(intent);
  if (readsNaturally(lower)) return lower;
  if (lower.split(/\s+/).length < 3) return `what is the best ${lower} tool?`;
  if (mapped === "commercial") return `what are the best ${lower.replace(/^best\s+/i, "")}?`;
  return `${lower}?`.replace(/\?\?$/, "?");
}

/**
 * Build ranked, deduped suggestions from parsed query records.
 * @param records output of parseQueriesReport
 * @param opts { existingQueries?: string[], maxSuggestions?: number, minCitations?: number }
 */
export function buildSuggestions(records, opts = {}) {
  const { existingQueries = [], maxSuggestions = 100, minCitations = 5 } = opts;
  const existingTok = existingQueries.map((q) => tokens(q));

  const maxCitations = Math.max(1, ...records.map((r) => r.citations));
  const scored = records
    .filter((r) => r.citations >= minCitations)
    .map((r) => {
      // Score: log-scaled citation volume (0..1) blended with citation share (0..1).
      const volume = Math.log10(1 + r.citations) / Math.log10(1 + maxCitations);
      const share = (r.citationShare ?? 0) / 100;
      const score = 0.65 * volume + 0.35 * share;
      return {
        ...r,
        score: Math.round(score * 1000) / 1000,
        wellowsIntent: mapIntent(r.bingIntent),
        status: readsNaturally(r.groundingQuery) ? "usable" : "rewrite",
        suggestedQuery: templateRewrite(r.groundingQuery, r.bingIntent),
        _tok: tokens(r.groundingQuery),
      };
    })
    .sort((a, b) => b.score - a.score);

  // Greedy dedupe: keep the highest-scored member of each near-duplicate cluster.
  const kept = [];
  for (const cand of scored) {
    if (existingTok.some((t) => similarity(t, cand._tok) >= 0.8)) {
      continue; // already tracked in Wellows
    }
    const dup = kept.find((k) => similarity(k._tok, cand._tok) >= 0.65);
    if (dup) {
      dup.duplicates = dup.duplicates || [];
      dup.duplicates.push({ groundingQuery: cand.groundingQuery, citations: cand.citations });
      dup.citationsCluster = (dup.citationsCluster ?? dup.citations) + cand.citations;
      continue;
    }
    kept.push(cand);
    if (kept.length >= maxSuggestions) break;
  }

  return kept.map(({ _tok, ...rest }) => rest);
}
