# AI Performance Bridge — project instructions

Prototype owned by Bilal Asif (bilal@wellows.com), Wellows. Built as a working
demo for Wellows directors, with a view to becoming a real Wellows platform
feature later.

---

## What this product does and why

**Bing Webmaster Tools** has an "AI Performance" report showing **grounding
queries** — the retrieval phrases Copilot generated internally before citing a
page — plus citation counts and citation share per query. That data exists for
Microsoft AI surfaces only.

This tool turns those grounding queries into **tracked queries**, then checks
**live** whether other AI surfaces (ChatGPT, Perplexity, Gemini, Google AI Mode,
Google AI Overviews) cite the same domain for the same questions.

**The pitch in one line:** Bing shows where Copilot already cites you; the run
shows where the other AI surfaces don't, yet.

The four-step flow the UI implements:

1. **Import** — upload BWT AI Performance CSV exports (parsed in the browser)
2. **Suggest** — rank, dedupe and normalize grounding queries into trackable prompts
3. **Run** — ask each tracked query on each provider, check the answer's citations
4. **Results** — per-query × per-provider matrix, expandable to show every cited source

---

## Key research findings (don't re-derive these)

- **There is no API for Bing's AI Performance data.** Verified: the Bing Webmaster
  API (`GetQueryStats`, `GetPageStats`, etc.) covers traditional search only.
  Microsoft's Fabrice Canel confirmed publicly that API access is on the backlog,
  expected during 2026. Until then, CSV export is the only route.
- **Microsoft Clarity doesn't solve it either.** Clarity has a Citations dashboard
  (GA May 2026) with grounding queries and Share of Authority, but its Data Export
  API covers behavioral analytics only — no citations — and is capped at 10 calls
  per project per day with a 1–3 day window. Unusable for multi-tenant SaaS.
- **Bing's exports do NOT link queries to pages.** The queries report and pages
  report are separate aggregates. Per-query page linkage exists only in the BWT
  UI's per-query drill-down, which is not feasible to collect at scale (≈15 exports
  per client per refresh). This is a stated data limitation in the UI, not a bug.
  The live-run columns DO have exact page URLs, so only the Bing column lacks them.
- **Grounding queries are machine-generated retrieval phrases**, not user prompts.
  Some read naturally ("how to rank higher in ChatGPT"), others are keyword piles
  ("best platforms chunking-aware content optimization"). Hence the rewrite step.

### BWT export shapes (as of Aug 2026)

| Report | Columns |
|---|---|
| `AISearchQueriesReport` | `Grounding Query, Intent, Topic, Citations, Citation Share` |
| `AIPageStatsReport` | `Page, Citations` |
| `AIPerformanceFilteredOverviewStats` | `Date, Citations` |

Bing intents seen: Informational, Commercial, Transactional, Navigational,
Research, Learn and Solve, Creation, Others (plus blank rows — handle them).
`site/js/lib/suggest.mjs` maps these onto Wellows' four intents.

---

## Architecture

Static SPA + Netlify Functions + Netlify Blobs. No build step.

```
site/index.html          the entire UI (vanilla JS, no framework)
site/js/lib/parseBwt.mjs CSV parsing + report-type autodetection
site/js/lib/suggest.mjs  scoring, dedupe, intent mapping, query rewrite
site/data/*.csv          real wellows.com export, seeds the "Load demo" button
lib/cloro.mjs            Cloro API client (providers, citation extraction)
lib/auth.mjs             shared passcode gate
netlify/functions/       health, projects, project-import, run-background, run-status
test/                    stub server (real functions, in-memory Blobs), screenshot harness, smoke test
```

**Providers** (`lib/cloro.mjs`) — all via Cloro, one endpoint each, shared credit pool:
`copilot`, `openai` (ChatGPT), `perplexity`, `gemini`, `google_ai_mode`,
`google_ai_overview`. Payload/response shapes mirror the Wellows production client
at `apps/platform-api/app/services/cloro_api_client.py` in the `wellows-platform`
monorepo. Citations come from `result.sources` (first 5), and
`google_ai_overview` nests its payload under `aioverview`.

**Runs** are a Netlify **background function** (`run-background.mjs`, the
`-background` suffix is load-bearing) because Cloro calls take 60–90s each,
well past the ~26s sync function limit. Progress is checkpointed to Blobs after
every result so the UI can poll `/api/run-status`. Concurrency 2, capped at 20
queries per run.

### Environment variables (Netlify site settings)

| Var | Purpose |
|---|---|
| `CLORO_API_KEY` | Cloro key. **Server-side only — never put it in page code.** |
| `CLORO_API_BASE_URL` | Optional, defaults to `https://api.cloro.dev/v1` |
| `PROTO_PASSCODE` | Shared UI passcode (currently `bingwebmaster`) |

---

## The three surfaces (and why runs only work on one)

| Surface | Job | Real runs? |
|---|---|---|
| **Netlify site** (`bingwebmaster.netlify.app`) | The working product | **Yes** |
| **claude.ai Artifact** | Fast design review, instantly republished | No — sample data |
| Standalone HTML file (`test/build-standalone.mjs`) | Offline preview, no install | No — sample data |

Both preview surfaces simulate runs because a browser page cannot hold the Cloro
key without leaking it, and the artifact sandbox blocks outbound API calls
entirely. **Never "fix" this by putting the key in client code.** The one legitimate
route to live runs client-side is Cloro's MCP server via the artifact `mcp`
capability, which uses each viewer's own credentials — impractical for sharing
with directors or clients, since every viewer needs the connector.

Build the preview surfaces with `node test/build-standalone.mjs` then
`node test/build-artifact.mjs` (the artifact build derives from the standalone one).
Neither build script has been committed to this repo yet; only the Netlify surface is buildable from a fresh clone.

---

## Working rules

- **Deploys are automatic**: push to `main` → Netlify rebuilds in about a minute.
  Publish directory `site`, functions directory `netlify/functions`, no build command.
- **Verify UI changes in a real browser before claiming they work.** `test/stub-server.mjs`
  serves the app with fake run data on :4180; `test/screenshot.mjs` drives Chromium
  and screenshots each tab. Use them — several bugs were caught this way.
- **Keep the Wellows design language.** Tokens in `site/index.html` come from the
  real platform (`apps/platform-frontend/tailwind.config.mjs`): Inter, brand orange
  `#FF6F1E`, canvas `#F7FAFC`, 12px card radius. The artifact build adds Wellows'
  dark palette on top.
- **Be honest in the UI about data provenance.** The "Bing export" column is a
  months-long aggregate; provider columns are single live checks. The footnote says
  so deliberately. Don't quietly present them as equivalent.
- **Never commit secrets.** The repo is public. `node_modules` is committed by
  accident and can be deleted; a `.gitignore` was never added.

---

## Outstanding work

Reviewed as an SEO/agency user would; these were identified and not yet built:

1. **Run-to-run comparison** — the agency loop is run → optimize content → re-run →
   show the client the delta. Runs are stored but there's no diff view. Highest
   remaining value.
2. **Topic rollups** — Bing's `Topic` column is shown in suggestions but dropped when
   a query is tracked, so there's no "strong on X, weak on Y" view.
3. **LLM-based query rewrite** — `templateRewrite()` in `suggest.mjs` is a crude
   heuristic that produces clunkers ("ai startups" → "what is the best ai startups
   tool?"). Users can edit inline, but a real LLM pass (server-side, or the artifact
   `sample` capability) would fix it properly.
4. **Suggestions search/filter** — 60 of 2,625 queries are shown with no way to search.

Open questions: Netlify plan tier (background functions need a paid plan);
whether to pursue the Cloro MCP route; and per-query page linkage for the Bing
column, which realistically waits for Microsoft's API.

---

## Relationship to the Wellows platform

This is a **throwaway prototype**. If it graduates, the real feature belongs in the
`wellows-platform` monorepo and must go through an STD-001 spec cycle
(`/sdd:start`) — it adds a new user-reachable capability spanning API and Frontend.
Wellows already has most of the machinery: tracked queries live in the MySQL
`user_site_query` table, citations in MongoDB, and `QueryService.generate_more_queries`
already seeds query generation from Google Search Console data, which is the same
shape as seeding from Bing grounding queries.
