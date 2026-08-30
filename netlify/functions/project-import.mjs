// POST /api/projects/import  {projectId, queries[], pages[], overview[]}
//   CSVs are parsed in the browser (site/js/lib/parseBwt.mjs); this stores the
//   normalized records.
// POST body may also carry {tracked: [...]} to save the accepted suggestions.
import { getStore } from "@netlify/blobs";
import { isAuthorized, unauthorized, json } from "../../lib/auth.mjs";

export const config = { path: "/api/projects/import" };

export default async (req) => {
  if (!isAuthorized(req)) return unauthorized();
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const s = getStore("bwt-proto");
  const body = await req.json();
  const { projectId } = body;
  if (!projectId) return json({ error: "projectId required" }, 400);
  const index = (await s.get("projects", { type: "json" })) || [];
  if (!index.some((p) => p.id === projectId)) return json({ error: "project not found" }, 404);

  if (body.tracked) {
    // Saving accepted suggestions as this project's tracked queries.
    const tracked = body.tracked.map((t) => ({
      query: String(t.query || "").trim(),
      intent: t.intent || "informational",
      sourceGroundingQuery: t.sourceGroundingQuery || null,
      bingCitations: t.bingCitations ?? null,
      bingCitationShare: t.bingCitationShare ?? null,
    })).filter((t) => t.query);
    await s.setJSON(`project/${projectId}/tracked`, tracked);
    return json({ saved: tracked.length });
  }

  const data = {
    queries: Array.isArray(body.queries) ? body.queries : [],
    pages: Array.isArray(body.pages) ? body.pages : [],
    overview: Array.isArray(body.overview) ? body.overview : [],
    importedAt: new Date().toISOString(),
  };
  if (!data.queries.length) return json({ error: "queries[] is empty - upload the AISearchQueriesReport CSV" }, 400);
  await s.setJSON(`project/${projectId}/data`, data);
  return json({ saved: { queries: data.queries.length, pages: data.pages.length, overview: data.overview.length } });
};
