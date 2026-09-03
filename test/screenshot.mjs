// Drives the app in headless Chromium against test/stub-server.mjs (or any
// BASE url), screenshots every step into test/shots/, and prints console
// errors, failed requests and 4xx/5xx responses at the end.
//
//   PROTO_PASSCODE=bingwebmaster node test/stub-server.mjs &
//   node test/screenshot.mjs            # needs playwright + chromium available
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { chromium } = await import("playwright").catch(() => import("/opt/node22/lib/node_modules/playwright/index.mjs"));
const BASE = process.env.BASE || "http://localhost:4180";
const OUT = process.env.OUT || path.join(path.dirname(fileURLToPath(import.meta.url)), "shots");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const issues = [];
page.on("console", (m) => { if (m.type() === "error") issues.push(`console.error: ${m.text()}`); });
page.on("pageerror", (e) => issues.push(`pageerror: ${e.message}`));
page.on("requestfailed", (r) => issues.push(`requestfailed: ${r.method()} ${r.url()} ${r.failure()?.errorText}`));
page.on("response", (r) => { if (r.status() >= 400) issues.push(`http ${r.status()}: ${r.request().method()} ${r.url()}`); });

const shot = (n) => page.screenshot({ path: path.join(OUT, `${n}.png`), fullPage: true });
const text = async () => (await page.locator("#app").innerText()).slice(0, 300).replace(/\s+/g, " ");

await page.goto(BASE, { waitUntil: "networkidle" });
await shot("01-boot"); console.log("boot:", await text());

if (await page.locator("#pc").count()) {
  await page.fill("#pc", process.env.PASSCODE || "bingwebmaster");
  await page.click("#go"); await page.waitForTimeout(1500);
  await shot("02-home"); console.log("home:", await text());
}
if (await page.locator("#np-demo").count()) {
  await page.click("#np-demo");
  await page.waitForSelector("[data-tab]", { timeout: 60000 });
  await page.waitForTimeout(1500);
  await shot("03-overview"); console.log("overview:", await text());
}
for (const tab of ["import", "suggest", "run", "results"]) {
  await page.click(`[data-tab="${tab}"]`); await page.waitForTimeout(800);
  await shot(`04-${tab}`); console.log(`${tab}:`, await text());
}
await page.click('[data-tab="suggest"]'); await page.waitForTimeout(800);
await page.click("#track"); await page.waitForTimeout(2500);
await shot("05-tracked"); console.log("tracked:", await text());
if (await page.locator("#start").count()) {
  await page.fill("#topn", "1");
  await page.click("#start");
  await page.waitForTimeout(Number(process.env.RUN_WAIT_MS || 8000));
  await shot("06-run"); console.log("run:", await text());
}

console.log("\n--- issues ---\n" + (issues.join("\n") || "(none)"));
await browser.close();
