# How It Works & How to Run

## Overview

This project has three runnable scripts:

| Script | Purpose |
|---|---|
| `npm start` | Scrape all products from the Rouses Mandeville store → `output.json` |
| `npx ts-node src/enumerate-stores.ts` | Probe the eGrowcery API to discover all stores across every retailer on the platform → `research/store-enumeration.json` |
| `npx ts-node src/build-findings.ts` | Convert the raw enumeration data into the formatted `research/findings.json` |

---

## Part 1 — Running the Product Scraper

### Requirements

- Node.js 20+
- `npm install` (installs Puppeteer and TypeScript)

### Steps

```bash
npm install
npm start
```

This runs `src/index.ts`, which calls `src/GroceryScraper.ts`. When it finishes, `output.json` appears in the project root containing every product available at the Rouses Mandeville store.

### What the scraper does internally

1. **Launches a headless Chromium browser** via Puppeteer
2. **Navigates to the store URL** (`https://orderonline.rouses.com/online/21mandeville`)
   - This is required to pass the AWS WAF bot challenge — the challenge issues browser cookies and tokens that the API checks on every subsequent request
3. **Intercepts network traffic** to auto-discover the API endpoint (`production-us-1.noq-servers.net`)
4. **Runs paginated API requests inside the browser context** using `page.evaluate(() => fetch(...))` — this reuses the WAF-cleared session, so requests succeed where plain `curl` or `fetch` from Node would be blocked
5. **Paginates using `skip`/`take`** until the API returns an empty page
6. **Retries each page up to 3 times** with a 2-second backoff on failure (stretch goal 1)
7. **Optionally enriches** each product with detail data — nutrition, ingredients, allergens — via `GET /stores/{id}/products/{productId}` (stretch goal 2, disabled by default; enable by passing `fetchDetails: true` to the constructor)

### Why `page.evaluate()` instead of plain HTTP

Direct requests (`curl`, `axios`, `node-fetch`) to `production-us-1.noq-servers.net` are blocked by AWS WAF with a 403 or timeout. The WAF issues a JavaScript challenge on the first page load which sets specific cookies. Executing `fetch` inside the running Puppeteer browser inherits those cookies automatically, making the API requests succeed.

---

## Part 2 — Store Enumeration

### Step 1: Run the enumeration script

```bash
npx ts-node src/enumerate-stores.ts
```

This will:
1. Launch a headless browser and load `https://orderonline.rouses.com/online/21mandeville` to establish a valid WAF session
2. Probe `GET /api/v1/application/stores/{id}/summary` for IDs 1–1000, 10 requests at a time concurrently
3. Collect every valid response (stores return 200 OK; non-existent IDs return 404)
4. Write all raw store data to `research/store-enumeration.json`

Runtime: ~2 minutes for 1,000 IDs.

To extend the search range, edit `END_ID` in `src/enumerate-stores.ts`.

### Step 2: Build findings.json

```bash
npx ts-node src/build-findings.ts
```

This reads `research/store-enumeration.json`, filters out test/demo stores, derives store URLs using confirmed domain mappings and slug patterns, and writes `research/findings.json`.

---

## How the API Was Discovered

### Finding the endpoint

1. Open `https://orderonline.rouses.com/online/21mandeville` in a browser
2. Open DevTools → Network tab → filter by XHR/Fetch
3. Click on any department. The XHR calls go to `https://production-us-1.noq-servers.net/api/v1/application/stores/514/products`
4. The store ID (`514`) and base URL are now known

### Key API endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/v1/application/stores/{id}/summary` | GET | Store metadata (name, address, slug, categories) |
| `/api/v1/application/stores/{id}/products` | POST | Paginated product listing (`?skip=0&take=40`) |
| `/api/v1/application/stores/{id}/products/{productId}` | GET | Per-product detail (nutrition, ingredients) |
| `/api/v1/application/stores/{id}/product-filters` | POST | Available filters for the store |
| `/api/v1/application/categories/{categoryId}/details` | GET | Category metadata |

### How retailer domains were found

The eGrowcery platform is white-label — each retailer hosts the same SPA on their own subdomain. Domains were found by:

1. **App Store fingerprint** — every retailer's iOS/Android app is published by "eGrowcery Pty Ltd". Searching the App Store for this developer reveals all retailer names.
2. **Google-indexed store URLs** — searching for `site:shop.{retailer}.com/online` surfaces indexed store pages with confirmed slugs.
3. **Press releases** — eGrowcery's own blog and trade press (Progressive Grocer, Shelby Report) name clients.

### Why some stores have no URL

The `UrlSlug` field in the `/summary` API response is null for many retailers. This means the store is configured on the platform but either has no public-facing web URL, uses a non-standard domain not discoverable via search, or is catering-only. These stores are still listed in `findings.json` with `"url": ""`.

---

## File Reference

```
.
├── src/
│   ├── index.ts               # Entry point — runs the scraper
│   ├── GroceryScraper.ts      # Scraper implementation (configureApi, scrapeProducts, close)
│   ├── enumerate-stores.ts    # Probes API IDs 1–1000 to discover all stores
│   └── build-findings.ts      # Converts raw enumeration data → findings.json
├── research/
│   ├── store-enumeration.json # Raw API data for all 474 discovered stores
│   ├── findings.json          # Final formatted list (343 stores, 269 with URLs)
│   └── approach.md            # Methodology writeup
├── output.json                # 24,586 scraped products from Rouses Mandeville
├── SUBMISSION.md              # Answers to the 4 submission questions
├── ERRORS.md                  # Errors encountered and how they were fixed
└── package.json
```
