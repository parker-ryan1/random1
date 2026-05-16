/**
 * Converts store-enumeration.json (raw API data) into the final findings.json.
 * Maps confirmed retailer domains; derives Rouses slugs from store name pattern.
 */

const raw: any[] = require("../research/store-enumeration.json");

// Confirmed domains for each retailer (verified from live URLs or search results)
const RETAILER_DOMAINS: Record<string, string> = {
  "Rouses Markets":                   "https://orderonline.rouses.com",
  "Greer's":                          "https://groceriestogo.greers.com",
  "Brookshire Brothers":              "https://shop.brookshirebrothers.com",
  "Doc's Food Stores":                "https://shop.docsfoods.com",
  "X- Doc's Food Stores":             "https://shop.docsfoods.com",
  "Main's Market":                    "https://shop.mainsmarket.com",
  "Festival Foods":                   "https://shop.festfoods.com",
  "Metcalfe's Market":                "https://www.shopmetcalfes.com",
  "La Bonita Supermarkets":           "https://shoplabonita.com",
  "Sunset Foods":                     "https://egrocer.sunsetfoods.com",
  "Nino Salvaggio":                   "https://shop.ninosalvaggio.com",
  "Hen House Market":                 "https://shop.henhouse.com",
  "Kuhn's Market":                    "https://shopping.kuhnsmarket.com",
  "Willy Street Co-op":               "https://shop.willystreet.coop",
  "Freshmart PR":                     "https://shop.freshmart.com",
  "Mackenthun's Fine Foods":          "https://shop.mackenthuns.com",
  "Market Basket":                    "https://mb2go.marketbasketfoods.com",
  "Down to Earth Organic and Natural":"https://shop.downtoearth.com",
  "ValuMarket":                       "https://shop.valumarket.com",
};

// Names that indicate test/internal/demo stores — skip these
const SKIP_PATTERNS = [
  /^x[\s\-]/i,
  /\btest\b/i,
  /\bdemo\b/i,
  /^eGrowcery$/i,
  /^eGrowcery\s/i,
  /store in a box/i,
  /production demo/i,
  /eStore/i,
  /^US Demo/i,
  /^Retailer Demo/i,
  /Customization Test/i,
];

function isTestStore(name: string): boolean {
  return SKIP_PATTERNS.some((p) => p.test(name));
}

function toSlug(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9]/g, "");
}

/**
 * Derive a Rouses URL slug from a store name like "#21 Mandeville".
 * Pattern: {number}{cityLowercaseNoSpaces}
 */
function rousesSlug(storeName: string): string {
  const m = storeName.match(/^#?(\d+)\s+(.+?)(?:\s*[–-].*)?$/);
  if (!m) return "";
  const num = parseInt(m[1], 10).toString();
  const city = toSlug(m[2].trim());
  return `${num}${city}`;
}

/**
 * Derive slugs for retailers where the API UrlSlug is null but pattern is known.
 * Returns empty string if no derivation possible.
 */
function deriveSlug(retailer: string, storeName: string): string {
  switch (retailer) {
    case "Market Basket": {
      // "Port Neches Market Basket" → "portnechemsmarketbasket"
      // Strip parentheticals and suffixes, then take city part
      const clean = storeName.replace(/\s*\(.*?\)/g, "").replace(/Market Basket.*/, "").trim();
      return clean ? `${toSlug(clean)}marketbasket` : "";
    }
    case "Metcalfe's Market": {
      // "Metcalfe's Hilldale" → "metcalfeshilldale"
      const city = storeName.replace(/Metcalfe['']?s?\s*/i, "").trim();
      return city ? `metcalfes${toSlug(city)}` : "";
    }
    case "Sunset Foods": {
      // "Libertyville" → "libertyville" (city name is the slug)
      return toSlug(storeName);
    }
    case "Kuhn's Market": {
      // "Banksville" → "banksville"
      return toSlug(storeName);
    }
    case "Hen House Market": {
      // "Fairway Hen House Market" → "fairway"
      const city = storeName.replace(/\s*Hen House Market.*/i, "").trim();
      return city ? toSlug(city) : "";
    }
    case "La Bonita Supermarkets": {
      // "La Bonita #6" → "6"
      const m = storeName.match(/#(\d+)/);
      return m ? m[1] : toSlug(storeName);
    }
    case "Mackenthun's Fine Foods": {
      // city name slug
      const city = storeName.replace(/Mackenthun['']?s?\s*(?:Fine\s*Foods)?\s*/i, "").trim();
      return city ? toSlug(city) : toSlug(storeName);
    }
    default:
      return "";
  }
}

const findings: { retailer: string; store: string; url: string }[] = [];

for (const s of raw) {
  const locName: string = s.raw.LocationBasedName ?? "";
  const storeName: string = s.raw.Name ?? s.name ?? "";

  if (!storeName) continue;

  // Derive retailer name from "Retailer in City" pattern
  const match = locName.match(/^(.+?) in (.+)$/);
  const retailer: string = match ? match[1].trim() : storeName;

  if (isTestStore(retailer) || isTestStore(storeName)) continue;

  // Skip eCatering sub-stores
  if (/ecatering/i.test(storeName)) continue;

  const slug: string = s.raw.UrlSlug ?? "";
  const domain = RETAILER_DOMAINS[retailer];

  let url = "";
  if (domain && slug) {
    url = `${domain}/online/${slug}`;
  } else if (retailer === "Rouses Markets" && domain) {
    const derived = rousesSlug(storeName);
    if (derived) url = `${domain}/online/${derived}`;
  } else if (domain) {
    const derived = deriveSlug(retailer, storeName);
    if (derived) url = `${domain}/online/${derived}`;
  }

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
const byRetailer: Record<string, { total: number; withUrl: number }> = {};
for (const f of findings) {
  if (!byRetailer[f.retailer]) byRetailer[f.retailer] = { total: 0, withUrl: 0 };
  byRetailer[f.retailer].total++;
  if (f.url) byRetailer[f.retailer].withUrl++;
}

console.log(`Total stores: ${findings.length}`);
console.log(`With URL: ${findings.filter((f) => f.url).length}`);
console.log("\nBy retailer (total / with URL):");
Object.entries(byRetailer)
  .sort((a, b) => b[1].total - a[1].total)
  .forEach(([r, { total, withUrl }]) =>
    console.log(`  ${total.toString().padStart(3)} / ${withUrl.toString().padStart(3)}  ${r}`)
  );
