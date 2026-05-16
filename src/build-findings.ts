/**
 * Converts store-enumeration.json (raw API data) into the final findings.json.
 * Maps known retailer domains; stores with unknown domains still appear with url=null.
 */

const raw: any[] = require("../research/store-enumeration.json");

// Retailers whose domain we verified (slug pattern: domain + /online/{slug})
const RETAILER_DOMAINS: Record<string, string> = {
  "Rouses Markets": "https://orderonline.rouses.com",
  "Greer's": "https://orderonline.greers.com",
  "Brookshire Brothers": "https://shop.brookshirebrothers.com",
  "Doc's Food Stores": "https://shop.docsfoods.com",
  "X- Doc's Food Stores": "https://shop.docsfoods.com",
  "Main's Market": "https://shop.mainsmarket.com",
  "Festival Foods": "https://shop.festfoods.com",
  "Metcalfe's Market": "https://shop.metcalfes.com",
  "La Bonita Supermarkets": "https://shop.labonita.com",
  "Market Basket": "https://shop.marketbasket.com",
  "Kuhn's Market": "https://shop.kuhnsmarket.com",
  "Hen House Market": "https://shop.henhousemarket.com",
  "Down to Earth Organic and Natural": "https://shop.downtoearth.com",
  "Sunset Foods": "https://shop.sunsetfoods.com",
  "Willy Street Co-op": "https://shop.willystreet.coop",
  "Nino Salvaggio": "https://shop.ninosalvaggio.com",
  "Freshmart PR": "https://shop.freshmart.com",
};

// Names that indicate test/internal/demo stores
const SKIP_PATTERNS = [
  /^x[\s-]/i,
  /test/i,
  /demo/i,
  /egrowcery$/i,
  /^eGrowcery\b/i,
  /store in a box/i,
  /production demo/i,
  /eStore/i,
  /^US Demo/i,
  /^Retailer Demo/i,
];

function isTestStore(name: string): boolean {
  return SKIP_PATTERNS.some((p) => p.test(name));
}

const findings: { retailer: string; store: string; url: string }[] = [];

for (const s of raw) {
  const locName: string = s.raw.LocationBasedName ?? "";
  const name: string = s.raw.Name ?? s.name ?? "";

  if (!locName && !name) continue;

  // Derive retailer from "Retailer in City" pattern
  const match = locName.match(/^(.+?) in (.+)$/);
  const retailer = match ? match[1].trim() : name;
  const storeName = name;

  if (isTestStore(retailer) || isTestStore(storeName)) continue;
  if (!storeName) continue;

  const slug: string = s.raw.UrlSlug ?? "";
  const domain = RETAILER_DOMAINS[retailer];

  const url = slug && domain ? `${domain}/online/${slug}` : "";

  findings.push({ retailer, store: storeName, url });
}

// Sort by retailer then store
findings.sort((a, b) =>
  a.retailer.localeCompare(b.retailer) || a.store.localeCompare(b.store)
);

const fs = require("fs");
fs.writeFileSync(
  "./research/findings.json",
  JSON.stringify(findings, null, 2)
);

// Summary
const byRetailer: Record<string, number> = {};
for (const f of findings) {
  byRetailer[f.retailer] = (byRetailer[f.retailer] ?? 0) + 1;
}

console.log(`Total stores: ${findings.length}`);
console.log("\nBy retailer:");
Object.entries(byRetailer)
  .sort((a, b) => b[1] - a[1])
  .forEach(([r, n]) => console.log(`  ${n.toString().padStart(3)}  ${r}`));
