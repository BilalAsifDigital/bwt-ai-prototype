// GET /api/health -> deployment self-check (no secrets, no passcode needed).
// Reports whether the server-side pieces a run depends on are in place, so the
// UI can explain a failing run instead of showing a wall of "error" pills.
import { getStore } from "@netlify/blobs";
import { json } from "../../lib/auth.mjs";
import { PROVIDERS } from "../../lib/cloro.mjs";

export const config = { path: "/api/health" };

export default async () => {
  let blobs = "ok";
  try {
    await getStore("bwt-proto").get("projects", { type: "json" });
  } catch (e) {
    blobs = String(e?.message || e).slice(0, 200);
  }
  return json({
    ok: true,
    cloroKeyConfigured: Boolean(process.env.CLORO_API_KEY),
    passcodeConfigured: Boolean(process.env.PROTO_PASSCODE),
    blobs,
    providers: Object.keys(PROVIDERS),
    context: process.env.CONTEXT || null,
    deployId: process.env.DEPLOY_ID || null,
  });
};
