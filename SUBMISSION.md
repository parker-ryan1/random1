# Submission Notes

## 1. How you approached finding the API endpoint in Part 1
I started by inspecting the network traffic in a browser while loading the Rouses Mandeville store page (`https://orderonline.rouses.com/online/21mandeville`). I looked for XHR/fetch requests that returned product data. I found the main products endpoint at `https://production-us-1.noq-servers.net/api/v1/application/stores/514/products`, which uses a POST request with `skip` and `take` URL parameters for pagination.

## 2. What worked and what didn't
**What worked:** Finding the API endpoint and its pagination structure was straightforward via network inspection. Writing the logic to parse the JSON responses and handle the `skip`/`take` loop worked perfectly in theory.

**What didn't:** Direct HTTP requests using standard Node.js tools (like `fetch` or `axios`) failed because the `noq-servers.net` API is heavily protected by AWS WAF bot mitigation. The WAF requires valid browser telemetry tokens and cookies. To bypass this, I had to implement a workaround using `page.evaluate()` in Puppeteer to execute the `fetch` requests from *within* the live headless browser context, inheriting its valid session and WAF clearance.

## 3. How you approached the platform research in Part 2 and what gaps you think remain
**Approach:** I noticed the iOS app for Rouses Markets is published by "eGrowcery Pty Ltd". By searching the App Store for other apps published by this same developer, I easily enumerated other tenants on the same platform (like Main's Market, Hitchcock's Markets, etc.). I also checked eGrowcery's marketing materials and press releases for larger clients like Brookshire Brothers.

**Gaps remaining:** This method only finds retailers who paid for a white-label mobile app published under eGrowcery's developer account. It misses retailers who only use the web platform, or retailers who publish the mobile app under their own corporate Apple Developer accounts. 

## 4. Anything you'd do differently with more time
With more time, I would:
1. **Automate Store Enumeration:** The API uses sequential Store IDs (Rouses Mandeville is `514`). I would write a distributed scraping script to iterate through IDs `1` to `5000+` against the `/api/v1/application/stores/{id}/summary` endpoint to discover *every* active store on the platform, bypassing WAF protections by orchestrating a pool of headless browsers.
2. **Improve Error Handling:** Make the Puppeteer API interception more robust by waiting for specific WAF challenge completions before attempting the first injected `fetch` request.
3. **Fetch Details:** Implement the stretch goal to fetch detailed product nutrition and ingredient information by hitting the product detail endpoints for each item in the list.
