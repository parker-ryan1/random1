import puppeteer, { Browser, Page } from "puppeteer";

export class GroceryScraper {
  private storeUrl: string;
  private browser: Browser | null = null;
  private page: Page | null = null;
  private productsApiUrl: string | null = null;
  private apiBase: string | null = null;

  /**
   * Set fetchDetails=true to also fetch per-product nutrition/ingredient data (stretch goal).
   * Warning: this makes ~1 extra request per product and will take significantly longer.
   */
  constructor(storeUrl: string, private fetchDetails: boolean = false) {
    this.storeUrl = storeUrl;
  }

  /**
   * Launch the browser and discover/setup anything needed before scraping.
   */
  async configureApi(): Promise<void> {
    this.browser = await puppeteer.launch({ headless: true });
    this.page = await this.browser.newPage();

    // Intercept requests to find the main products API endpoint
    this.page.on("request", (req) => {
      const url = req.url();
      if (url.includes("/api/v1/application/stores/") && url.includes("/products")) {
        this.productsApiUrl = url.split("?")[0];
        // Strip /products to get the store base URL
        this.apiBase = this.productsApiUrl.replace(/\/products$/, "");
      }
    });

    console.log(`Navigating to ${this.storeUrl} ...`);
    await this.page.goto(this.storeUrl, { waitUntil: "networkidle2" });

    if (!this.productsApiUrl) {
      await this.page.goto(`${this.storeUrl}/shop/produce`, { waitUntil: "networkidle2" });
    }

    if (!this.productsApiUrl) {
      console.warn("Could not intercept API URL dynamically. Falling back to hardcoded URL.");
      this.productsApiUrl = "https://production-us-1.noq-servers.net/api/v1/application/stores/514/products";
      this.apiBase = "https://production-us-1.noq-servers.net/api/v1/application/stores/514";
    } else {
      console.log(`Discovered API endpoint: ${this.productsApiUrl}`);
    }
  }

  /**
   * Fetch all products from the store.
   * Stretch goal 1: retries up to 3x per page on failure.
   * Stretch goal 2: if fetchDetails=true, enriches each product with nutrition/ingredient data.
   */
  async scrapeProducts(): Promise<unknown[]> {
    if (!this.page || !this.productsApiUrl) {
      throw new Error("configureApi() must be called before scrapeProducts()");
    }

    const allProducts: any[] = [];
    let skip = 0;
    const take = 40;
    let hasMore = true;

    // --- Paginated product listing (with retry) ---
    while (hasMore) {
      const url = `${this.productsApiUrl}?skip=${skip}&take=${take}&sortBy=isFeatured,rank,-savings,hasImage,name,id`;

      let attempt = 0;
      let success = false;

      while (attempt < 3 && !success) {
        attempt++;
        try {
          const response = await this.page.evaluate(async (fetchUrl) => {
            const res = await fetch(fetchUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json", "Accept": "application/json" },
              body: JSON.stringify({}),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
          }, url);

          const resObj = response as any;
          const items: any[] = Array.isArray(resObj)
            ? resObj
            : resObj.Result?.Products || resObj.data || resObj.items || resObj.products || [];

          if (items.length === 0) {
            hasMore = false;
          } else {
            allProducts.push(...items);
            skip += take;
          }

          success = true;
          console.log(`Fetched ${items.length} products (Total: ${allProducts.length})`);
        } catch (err) {
          console.error(`Attempt ${attempt} failed for skip=${skip}:`, err);
          if (attempt === 3) {
            console.error(`Giving up on skip=${skip} after 3 attempts.`);
            hasMore = false;
          } else {
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        }
      }
    }

    if (!this.fetchDetails) {
      return allProducts;
    }

    // --- Stretch goal 2: enrich each product with detail data ---
    console.log(`Enriching ${allProducts.length} products with detail data (nutrition, ingredients, etc.)...`);
    const CONCURRENCY = 5;
    const enriched: unknown[] = [];

    for (let i = 0; i < allProducts.length; i += CONCURRENCY) {
      const batch = allProducts.slice(i, i + CONCURRENCY);
      const results = await Promise.all(batch.map((p) => this.fetchProductDetail(p)));
      enriched.push(...results);

      if (enriched.length % 250 === 0 || enriched.length === allProducts.length) {
        console.log(`Enriched ${enriched.length} / ${allProducts.length} products`);
      }
    }

    return enriched;
  }

  /**
   * Fetch per-product detail data (nutrition, ingredients, allergens, etc.) and merge into product.
   * Retries up to 3 times on failure; returns the base product with Detail=null on permanent failure.
   */
  private async fetchProductDetail(product: any): Promise<any> {
    if (!this.page || !this.apiBase) return product;

    const detailUrl = `${this.apiBase}/products/${product.Id}`;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const detail = await this.page.evaluate(async (url) => {
          const res = await fetch(url, { headers: { "Accept": "application/json" } });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        }, detailUrl);

        const r = (detail as any).Result ?? (detail as any);

        return {
          ...product,
          Detail: {
            Description: r.Description ?? r.LongDescription ?? null,
            Brand: r.Brand ?? null,
            Ingredients: r.Ingredients ?? null,
            Nutrition: r.Nutrition ?? r.NutritionFacts ?? null,
            Allergens: r.Allergens ?? null,
            CountryOfOrigin: r.CountryOfOrigin ?? null,
            Upc: r.Upc ?? r.Barcode ?? null,
          },
        };
      } catch {
        if (attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    return { ...product, Detail: null };
  }

  /**
   * Close the Puppeteer browser. Called automatically by index.ts.
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
