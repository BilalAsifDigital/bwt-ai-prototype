// Parsers for Bing Webmaster Tools "AI Performance" CSV exports.
// Three known report shapes (column headers as exported 2026-08):
//   AISearchQueriesReport:              "Grounding Query","Intent","Topic","Citations","Citation Share"
//   AIPageStatsReport:                  "Page","Citations"
//   AIPerformanceFilteredOverviewStats: "Date","Citations"

/** Minimal RFC-4180-ish CSV parser (quoted fields, embedded commas/quotes/newlines). */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.length > 1 || row[0] !== "") rows.push(row);
  return rows;
}

function stripBom(s) {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/** Detect which BWT report a CSV is, from its header row. */
export function detectReportType(text) {
  const rows = parseCsv(stripBom(text));
  if (!rows.length) return { type: "unknown", header: [] };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  if (header.includes("grounding query")) return { type: "queries", header };
  if (header[0] === "page" && header.includes("citations")) return { type: "pages", header };
  if (header[0] === "date" && header.includes("citations")) return { type: "overview", header };
  return { type: "unknown", header };
}

function num(s) {
  const n = Number(String(s ?? "").replace(/[,%\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Parse the grounding-queries report into normalized records. */
export function parseQueriesReport(text) {
  const rows = parseCsv(stripBom(text));
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = {
    query: header.indexOf("grounding query"),
    intent: header.indexOf("intent"),
    topic: header.indexOf("topic"),
    citations: header.indexOf("citations"),
    share: header.indexOf("citation share"),
  };
  const out = [];
  for (const r of rows.slice(1)) {
    const query = (r[idx.query] || "").trim();
    if (!query) continue;
    out.push({
      groundingQuery: query,
      bingIntent: (r[idx.intent] || "").trim() || null,
      bingTopic: (r[idx.topic] || "").trim() || null,
      citations: num(r[idx.citations]),
      citationShare: idx.share >= 0 ? num(r[idx.share]) : null, // percent, e.g. 24.25
    });
  }
  return out;
}

/** Parse the page-stats report. */
export function parsePagesReport(text) {
  const rows = parseCsv(stripBom(text));
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const pi = header.indexOf("page");
  const ci = header.indexOf("citations");
  const out = [];
  for (const r of rows.slice(1)) {
    const page = (r[pi] || "").trim();
    if (!page) continue;
    out.push({ page, citations: num(r[ci]) });
  }
  return out;
}

/** Parse the daily-overview report. */
export function parseOverviewReport(text) {
  const rows = parseCsv(stripBom(text));
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const di = header.indexOf("date");
  const ci = header.indexOf("citations");
  const out = [];
  for (const r of rows.slice(1)) {
    const raw = (r[di] || "").trim();
    if (!raw) continue;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) continue;
    out.push({ date: d.toISOString().slice(0, 10), citations: num(r[ci]) });
  }
  return out;
}
