// GET /api/run-status?projectId=X&runId=Y -> current run document (polled by UI)
import { getStore } from "@netlify/blobs";
import { isAuthorized, unauthorized, json } from "../../lib/auth.mjs";

export const config = { path: "/api/run-status" };

export default async (req) => {
  if (!isAuthorized(req)) return unauthorized();
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  const runId = url.searchParams.get("runId");
  if (!projectId || !runId) return json({ error: "projectId and runId required" }, 400);

  const s = getStore("bwt-proto");
  const run = await s.get(`project/${projectId}/run/${runId}`, { type: "json" });
  if (!run) return json({ error: "run not found" }, 404);
  return json({ run });
};
