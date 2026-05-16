# Platform Research Approach

## 1. Identifying the Platform

I inspected the network traffic from the Rouses Mandeville store (`orderonline.rouses.com`). API calls went to `https://production-us-1.noq-servers.net`, which is the backend for the **eGrowcery** white-label grocery e-commerce platform. This was confirmed by looking up the iOS app for Rouses Markets on the Apple App Store — it is published by **eGrowcery Pty Ltd** (Google Play: `com.egrowcery.rouses`).

## 2. Signals and Patterns Used to Enumerate Stores

**A. App Store publisher fingerprint**
All eGrowcery white-label apps share the same iOS/Android developer identity. Searching the App Store for apps by "eGrowcery Pty Ltd" immediately reveals other retailers on the platform: Rouses Markets, Hitchcock's Markets, Brookshire Brothers, Doc's Food Stores, Main's Market, Cash Saver Stores, and others.

**B. Domain + URL slug pattern**
Each retailer has a dedicated subdomain pointing to the eGrowcery SPA. The in-app and web ordering portals share a consistent URL structure:
- Rouses: `https://orderonline.rouses.com/online/{storeNumber}{cityName}`
- Hitchcock's: `https://delivery.myhitchcocks.com/online/hitchcocks{cityName}`
- Brookshire Brothers: `https://shop.brookshirebrothers.com/online/store-{n}`
- Doc's Foods: `https://shop.docsfoods.com/online/{storeBannerAndCity}`

Three Rouses URLs were confirmed directly from Google-indexed pages (`21mandeville`, `29neworleans`, `81larose`). The slug pattern was extrapolated to all 74 Rouses locations listed on `rouses.com/locations/`. Hitchcock's slug pattern was confirmed from one indexed URL (`hitchcockseastpalatkacatering`). Brookshire Brothers store numbers (6, 32, 48, 51) were confirmed from Google-indexed pages.

**C. API store ID enumeration**
The backend API at `production-us-1.noq-servers.net` uses sequential integer store IDs (Rouses Mandeville = `514`). The `/api/v1/application/stores/{id}/summary` endpoint returns the retailer name and store location for every valid ID. Running this inside a Puppeteer browser context (to bypass AWS WAF) allows systematic enumeration of all stores platform-wide.

**D. eGrowcery press releases and case studies**
Cross-referenced against eGrowcery's own blog and trade press to confirm which retailers signed on: Rouses Markets, Hitchcock's Markets, Brookshire Brothers, Doc's Food Stores, Willy Street Co-op.

## 3. Gaps and Limitations

- **Rouses URL slugs**: Three slugs confirmed; the remaining ~70 are extrapolated from the `{storeNumber}{cityName}` pattern. Some cities use abbreviated slugs (e.g., "Central" rather than "Central Baton Rouge") that require direct verification.
- **Brookshire Brothers store numbers**: Only 4 of ~92 store numbers confirmed from indexed Google results. A full enumeration would require hitting their store-locator API or running a sequential probe of `store-1` through `store-120`.
- **Hitchcock's store slugs**: Only the East Palatka slug was confirmed; the remaining 9 are pattern-derived.
- **Doc's Food Stores**: Only the Country Mart Coweta slug confirmed. Other banners (Doc's Apple Market, JB's Market, Price Mart, Cox Cash Saver) likely have their own slugs that need direct verification.
- **Other eGrowcery retailers**: Retailers who deployed the platform without a mobile app published under the eGrowcery developer account are invisible to the App Store method. The API enumeration approach would surface these, but it requires sustained browser-session access to bypass WAF.
- **International stores**: eGrowcery operates in Australia and the UK under the "My IGA" and "Price Less IGA" brands, which likely run on separate regional API clusters not covered by `production-us-1.noq-servers.net`.
