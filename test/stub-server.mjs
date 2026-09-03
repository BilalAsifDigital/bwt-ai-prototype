// Local stand-in for Netlify so the UI can be exercised end to end without a
// deploy: serves site/ and routes /api/* to the real functions in
// netlify/functions, with Blobs replaced by an in-memory store and the
// background run function answered with 202 before it executes (as Netlify
// does). Cloro is not called unless CLORO_API_KEY is set.
//
//   PROTO_PASSCODE=bingwebmaster node test/stub-server.mjs      # http://localhost:4180
//   SKIP_BG=1 ...   pretend the background function died before writing anything
import { register } from "node:module";
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 4180);

// Swap @netlify/blobs for the in-memory version before the functions load.
const shim = pathToFileURL(path.join(ROOT, "test/blobs-memory.mjs")).href;
register(`data:text/javascript,${encodeURIComponent(
  `export async function resolve(s, c, n) { return s === "@netlify/blobs" ? { url: ${JSON.stringify(shim)}, shortCircuit: true } : n(s, c); }`,
)}`);

const MIME = { ".html": "text/html; charset=utf-8", ".mjs": "text/javascript", ".js": "text/javascript",
  ".css": "text/css", ".svg": "image/svg+xml", ".csv": "text/csv", ".json": "application/json", ".png": "image/png" };

const routes = [];
for (const f of ["health", "projects", "project-import", "run-status", "run-background"]) {
  const mod = await import(pathToFileURL(path.join(ROOT, "netlify/functions", `${f}.mjs`)).href);
  routes.push({ file: f, path: mod.config.path, handler: mod.default, background: f.endsWith("-background") });
}
console.log("routes:", routes.map((r) => `${r.path} -> ${r.file}${r.background ? " (bg)" : ""}`).join(", "));

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const route = routes.find((r) => r.path === url.pathname);
  try {
    if (route) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const request = new Request(url, { method: req.method, headers: req.headers,
        body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks) });
      if (route.background) {
        res.writeHead(202); res.end();
        if (process.env.SKIP_BG) { console.log(`[bg ${route.file}] skipped (SKIP_BG)`); return; }
        route.handler(request)
          .then((r) => console.log(`[bg ${route.file}] finished status=${r?.status}`))
          .catch((e) => console.error(`[bg ${route.file}] threw`, e));
        return;
      }
      const out = await route.handler(request);
      res.writeHead(out.status, Object.fromEntries(out.headers));
      res.end(Buffer.from(await out.arrayBuffer()));
      console.log(`${req.method} ${url.pathname}${url.search} -> ${out.status}`);
      return;
    }
    let p = path.join(ROOT, "site", decodeURIComponent(url.pathname));
    if ((await stat(p).catch(() => null))?.isDirectory()) p = path.join(p, "index.html");
    const data = await readFile(p).catch(() => null);
    if (!data) { res.writeHead(404); res.end("not found"); console.log(`GET ${url.pathname} -> 404`); return; }
    res.writeHead(200, { "content-type": MIME[path.extname(p)] || "application/octet-stream" });
    res.end(data);
  } catch (e) {
    console.error(`${req.method} ${url.pathname} threw:`, e);
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: String(e?.message || e) }));
  }
}).listen(PORT, () => console.log(`listening on http://localhost:${PORT}`));
