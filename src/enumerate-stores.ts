import puppeteer from "puppeteer";
import * as fs from "fs";
import * as path from "path";

const API_BASE = "https://production-us-1.noq-servers.net/api/v1/application/stores";
const START_ID = 1;
const END_ID = 1000;
const CONCURRENCY = 10;
const OUTPUT_FILE = path.join(process.cwd(), "research", "store-enumeration.json");

interface StoreResult {
  id: number;
  name: string;
  retailer: string;
  address: string;
  city: string;
  state: string;
  slug: string;
  domain: string;
  url: string;
  raw: unknown;
}

async function main() {
  console.log("Launching browser...");
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  // Load the Rouses store page first to get valid WAF session/cookies
  console.log("Establishing session on Rouses store...");
  await page.goto("https://orderonline.rouses.com/online/21mandeville", {
    waitUntil: "networkidle2",
  });
  console.log("Session established. Starting store enumeration...");

  const found: StoreResult[] = [];
  const ids = Array.from({ length: END_ID - START_ID + 1 }, (_, i) => START_ID + i);

  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const batch = ids.slice(i, i + CONCURRENCY);

    const results = await page.evaluate(async (batchIds, apiBase) => {
      const out: { id: number; data: unknown; ok: boolean }[] = [];
      await Promise.all(
        batchIds.map(async (id) => {
          try {
            const res = await fetch(`${apiBase}/${id}/summary`, {
              headers: { Accept: "application/json" },
            });
            if (res.ok) {
              const json = await res.json();
              out.push({ id, data: json, ok: true });
            }
          } catch {
            // skip
          }
        })
      );
      return out;
    }, batch, API_BASE);

    for (const r of results) {
      if (!r.ok) continue;
      const raw = r.data as any;
      const result = raw?.Result ?? raw;

      // Extract store fields from the summary response
      const store: StoreResult = {
        id: r.id,
        name: result?.Name ?? result?.StoreName ?? "",
        retailer: result?.FranchiseName ?? result?.Retailer ?? "",
        address: result?.Address ?? result?.Street ?? "",
        city: result?.City ?? "",
        state: result?.State ?? result?.Province ?? "",
        slug: result?.Slug ?? result?.UrlSlug ?? result?.StoreSlug ?? "",
        domain: result?.Domain ?? result?.WebsiteUrl ?? "",
        url: result?.Slug
          ? `https://${result.Domain ?? "orderonline.rouses.com"}/online/${result.Slug}`
          : "",
        raw: result,
      };

      found.push(store);
      console.log(`[${r.id}] ${store.retailer} — ${store.name} (${store.city}, ${store.state}) slug=${store.slug}`);
    }

    const pct = Math.round(((i + CONCURRENCY) / ids.length) * 100);
    console.log(`Progress: ${Math.min(i + CONCURRENCY, ids.length)}/${ids.length} IDs probed (${pct}%) — ${found.length} stores found`);
  }

  await browser.close();

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(found, null, 2));
  console.log(`\nDone. Found ${found.length} stores. Written to ${OUTPUT_FILE}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
