// GET  /api/projects            -> list projects
// POST /api/projects            -> create {name, domain, region}
// GET  /api/projects?id=X       -> one project incl. imported data + tracked queries
// POST /api/projects/import     -> handled in project-import.mjs
import { getStore } from "@netlify/blobs";
import { isAuthorized, unauthorized, json } from "../../lib/auth.mjs";

export const config = { path: "/api/projects" };

const store = () => getStore("bwt-proto");

export default async (req) => {
  if (!isAuthorized(req)) return unauthorized();
  const s = store();

  if (req.method === "GET") {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    const index = (await s.get("projects", { type: "json" })) || [];
    if (!id) return json({ projects: index });

    const project = index.find((p) => p.id === id);
    if (!project) return json({ error: "not found" }, 404);
    const [data, tracked, runs] = await Promise.all([
      s.get(`project/${id}/data`, { type: "json" }),
      s.get(`project/${id}/tracked`, { type: "json" }),
      s.get(`project/${id}/runs`, { type: "json" }),
    ]);
    return json({ project, data: data || null, tracked: tracked || [], runs: runs || [] });
  }

  if (req.method === "POST") {
    const body = await req.json();
    const name = (body.name || "").trim();
    const domain = (body.domain || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!name || !domain) return json({ error: "name and domain are required" }, 400);
    const project = {
      id: crypto.randomUUID().slice(0, 8),
      name,
      domain,
      region: (body.region || "us").toLowerCase(),
      createdAt: new Date().toISOString(),
    };
    const index = (await s.get("projects", { type: "json" })) || [];
    index.unshift(project);
    await s.setJSON("projects", index);
    return json({ project }, 201);
  }

  return json({ error: "method not allowed" }, 405);
};
