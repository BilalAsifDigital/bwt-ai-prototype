// POST /api/run  {projectId, runId, queries[], providers[], region}
//
// Netlify BACKGROUND function ("-background" suffix): returns 202 immediately,
// then keeps executing up to 15 minutes. Writes progress to Blobs after every
// (query x provider) result so /api/run-status can stream progress to the UI.
import { getStore } from "@netlify/blobs";
import { isAuthorized, unauthorized } from "../../lib/auth.mjs";
import { monitor, citesDomain, PROVIDERS } from "../../lib/cloro.mjs";

export const config = { path: "/api/run" };

const MAX_QUERIES = 20;      // demo guardrail: cap credits burned per run
const CONCURRENCY = 2;       // stay well under Cloro concurrency limits

export default async (req) => {
  if (!isAuthorized(req)) return unauthorized();
  if (req.method !== "POST") return new Response(null, { status: 405 });

  const body = await req.json();
  const { projectId, runId } = body;
  const queries = (body.queries || []).slice(0, MAX_QUERIES);
  const providers = (body.providers || []).filter((p) => PROVIDERS[p]);
  const region = body.region || "us";
  if (!projectId || !runId || !queries.length || !providers.length) {
    return new Response(null, { status: 400 });
  }

  const s = getStore("bwt-proto");
  const index = (await s.get("projects", { type: "json" })) || [];
  const project = index.find((p) => p.id === projectId);
  if (!project) return new Response(null, { status: 404 });

  const runKey = `project/${projectId}/run/${runId}`;
  const total = queries.length * providers.length;
  const run = {
    id: runId,
    startedAt: new Date().toISOString(),
    status: "running",
    region,
    providers,
    queries,
    total,
    done: 0,
    results: [],
  };
  await s.setJSON(runKey, run);

  // register in run index
  const runsKey = `project/${projectId}/runs`;
  const runs = (await s.get(runsKey, { type: "json" })) || [];
  runs.unshift({ id: runId, startedAt: run.startedAt, status: "running", total });
  await s.setJSON(runsKey, runs.slice(0, 20));

  const jobs = [];
  for (const query of queries) for (const provider of providers) jobs.push({ query, provider });

  const apiKey = process.env.CLORO_API_KEY;
  let cursor = 0;
  async function worker() {
    while (cursor < jobs.length) {
      const job = jobs[cursor++];
      let res = await monitor(job.query, region, job.provider, apiKey);
      if (res.rateLimited) {
        await new Promise((r) => setTimeout(r, (res.retryAfter || 2) * 1000));
        res = await monitor(job.query, region, job.provider, apiKey);
      }
      const hits = res.ok ? citesDomain(res.citations, project.domain) : [];
      run.results.push({
        query: job.query,
        provider: job.provider,
        ok: res.ok,
        cited: hits.length > 0,
        citedUrls: hits,
        allCitations: res.citations || [],
        creditsCharged: res.creditsCharged || 0,
        error: res.ok ? null : res.error || (res.rateLimited ? "rate limited" : "failed"),
      });
      run.done = run.results.length;
      await s.setJSON(runKey, run); // checkpoint after every result
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  run.status = "completed";
  run.finishedAt = new Date().toISOString();
  await s.setJSON(runKey, run);
  const runs2 = (await s.get(runsKey, { type: "json" })) || [];
  const entry = runs2.find((r) => r.id === runId);
  if (entry) { entry.status = "completed"; entry.finishedAt = run.finishedAt; }
  await s.setJSON(runsKey, runs2);

  return new Response(null, { status: 200 });
};
