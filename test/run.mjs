import { readFileSync } from "node:fs";
import { detectReportType, parseQueriesReport, parsePagesReport, parseOverviewReport } from "../site/js/lib/parseBwt.mjs";
import { buildSuggestions } from "../site/js/lib/suggest.mjs";

const q = readFileSync(new URL("../data/queries.csv", import.meta.url), "utf8");
const p = readFileSync(new URL("../data/pages.csv", import.meta.url), "utf8");
const o = readFileSync(new URL("../data/overview.csv", import.meta.url), "utf8");

console.log("detect:", detectReportType(q).type, detectReportType(p).type, detectReportType(o).type);

const queries = parseQueriesReport(q);
const pages = parsePagesReport(p);
const overview = parseOverviewReport(o);
console.log(`parsed: ${queries.length} queries, ${pages.length} pages, ${overview.length} days`);

const blankIntent = queries.filter((r) => !r.bingIntent).length;
console.log(`blank intent/topic rows: ${blankIntent}`);

const sugg = buildSuggestions(queries, { maxSuggestions: 50, minCitations: 20 });
console.log(`suggestions: ${sugg.length} (usable=${sugg.filter(s => s.status === "usable").length}, rewrite=${sugg.filter(s => s.status === "rewrite").length})`);
console.log("\nTop 15:");
for (const s of sugg.slice(0, 15)) {
  const dup = s.duplicates ? ` [+${s.duplicates.length} dups, cluster=${s.citationsCluster}]` : "";
  console.log(`  ${s.score.toFixed(3)}  ${s.status.padEnd(7)} ${s.wellowsIntent.padEnd(13)} "${s.groundingQuery}" -> "${s.suggestedQuery}" (${s.citations} cit, ${s.citationShare}% share)${dup}`);
}
