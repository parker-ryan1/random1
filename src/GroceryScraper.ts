import puppeteer, { Browser, Page } from "puppeteer";

export class GroceryScraper {
  private storeUrl: string;
  private browser: Browser | null = null;
  private page: Page | null = null;
  private productsApiUrl: string | null = null;

  constructor(storeUrl: string) {
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
      }
    });

    console.log(`Navigating to ${this.storeUrl} ...`);
    await this.page.goto(this.storeUrl, { waitUntil: "networkidle2" });

    // If endpoint not caught on main page, visit a category page to trigger it
    if (!this.productsApiUrl) {
      await this.page.goto(`${this.storeUrl}/shop/produce`, { waitUntil: "networkidle2" });
    }

    if (!this.productsApiUrl) {
      console.warn("Could not intercept API URL dynamically. Falling back to hardcoded URL.");
      this.productsApiUrl = "https://production-us-1.noq-servers.net/api/v1/application/stores/514/products";
    } else {
      console.log(`Discovered API endpoint: ${this.productsApiUrl}`);
    }
  }

  /**
   * Fetch all products from the store.
   */
  async scrapeProducts(): Promise<unknown[]> {
    if (!this.page || !this.productsApiUrl) {
      throw new Error("configureApi() must be called before scrapeProducts()");
    }

    const allProducts: unknown[] = [];
    let skip = 0;
    const take = 40;
    let hasMore = true;

    while (hasMore) {
      const url = `${this.productsApiUrl}?skip=${skip}&take=${take}&sortBy=isFeatured,rank,-savings,hasImage,name,id`;
      let attempt = 0;
      let success = false;

      while (attempt < 3 && !success) {
        attempt++;
        try {
          // Use page.evaluate to run fetch inside the browser context
          // This bypasses AWS WAF or other protections by reusing the browser's session/tokens
          const response = await this.page.evaluate(async (fetchUrl) => {
            const res = await fetch(fetchUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
              },
              body: JSON.stringify({})
            });
            
            if (!res.ok) {
              throw new Error(`HTTP ${res.status}`);
            }
            
            return res.json();
          }, url);

          // EGrowcery API usually returns an array directly, or an object with items
          const resObj = response as any;
          const items = Array.isArray(resObj) ? resObj : 
            (resObj.Result?.Products || resObj.data || resObj.items || resObj.products || []);
          
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
            hasMore = false; // Give up entirely or just skip this page
          } else {
            // Wait a bit before retrying
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        }
      }
    }

    return allProducts;
  }

  /**
   * Close the Puppeteer browser. Called automatically by index.ts.
   * Make sure this always runs, even if scraping fails.
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
