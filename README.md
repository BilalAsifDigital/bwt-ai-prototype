# Wellows · AI Performance Bridge (prototype)

Turns **Bing Webmaster Tools AI Performance** exports (grounding queries + Copilot
citations) into **tracked queries**, then checks live whether ChatGPT, Perplexity,
Gemini, Google AI Mode and Google AI Overviews cite the same domain for those
queries (via the Cloro monitoring API, the same provider set Wellows production uses).

**Pitch in one line:** Bing shows where Copilot already cites you; the run shows
where the other AI surfaces don't, yet.

## Flow

1. **Import** – upload the BWT CSVs (`AISearchQueriesReport`, `AIPageStatsReport`,
   optional overview). Report types are auto-detected; parsing happens in the browser.
2. **Suggest** – grounding queries are scored (citation volume + citation share),
   near-duplicates are folded, Bing intents are mapped to Wellows intents, and
   machine-y retrieval phrases get a rewrite. Accept a subset to track.
3. **Run** – top-N tracked queries × selected providers, executed by a Netlify
   background function calling Cloro; progress checkpointed to Netlify Blobs.
4. **Results** – per-query × per-provider matrix: cited / not cited / error,
   with the Bing/Copilot column as the baseline from the export.

## Stack

- Static SPA (`site/`) + Netlify Functions (`netlify/functions/`) + Netlify Blobs.
- `run-background.mjs` is a **Background Function** (needs a paid Netlify plan);
  Cloro calls take 60–90 s each, beyond the sync function limit.
- Simple shared-passcode gate (`PROTO_PASSCODE`).

## Environment variables (Netlify site settings)

| Var | Purpose |
|---|---|
| `CLORO_API_KEY` | Cloro API key (required for runs) |
| `CLORO_API_BASE_URL` | Optional, defaults to `https://api.cloro.dev/v1` |
| `PROTO_PASSCODE` | Shared passcode for the UI/API (recommended) |

## Local dev

```bash
npm install
npm test          # parser + suggestion engine against the demo CSVs
npx netlify dev   # full app locally (needs netlify CLI login)
```

## Deploy

```bash
npx netlify deploy --prod
```

`site/data/*.csv` are real wellows.com exports used to seed the demo project
("Create demo project" button).

---

This is a throwaway prototype. The production version of this feature belongs in
`wellows-platform` behind an STD-001 spec cycle.
