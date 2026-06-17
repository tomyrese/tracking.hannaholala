# BNB Hot Products Integration Design

Date: 2026-06-17

## Goal

Integrate a product showcase into the current website without storing product data locally. The site will display featured products from Bep Ngoc Bao's `hot-products` collection, refresh automatically through a Netlify Function, and redirect users to Bep Ngoc Bao for purchase.

## Approved Scope

- Keep the existing tracking experience intact.
- Add a featured products section directly below the hero section.
- Sync only `https://bepngocbao.vn/collections/hot-products`.
- Do not use iframe.
- Do not fetch Bep Ngoc Bao directly from the frontend.
- Route all product requests through `/.netlify/functions/bnb-products`.

## Architecture

The integration follows this request flow:

Client -> Netlify Function -> Bep Ngoc Bao

The frontend requests product JSON from the local Netlify Function only. The function fetches the latest HTML from Bep Ngoc Bao, parses the collection page, normalizes product fields, and returns a compact JSON payload. This keeps the browser isolated from the third-party origin, avoids CORS issues, and centralizes parsing, caching, and error handling in one place.

## Data Contract

The function returns an array of products shaped like:

```json
[
  {
    "id": "1072968360",
    "name": "Am dien/SWF17S18AVN/VN/",
    "price": "453000",
    "comparePrice": "860000",
    "discount": "48",
    "image": "https://...",
    "url": "https://bepngocbao.vn/products/am-dien-swf17s18avn-vn"
  }
]
```

Field rules:

- `id`: string, required if present in source, otherwise derived from product URL handle.
- `name`: string, trimmed plain text.
- `price`: stringified integer in VND without separators when available.
- `comparePrice`: stringified integer in VND without separators when available.
- `discount`: stringified integer percentage when calculable.
- `image`: absolute HTTPS URL when available, otherwise frontend fallback image is used.
- `url`: absolute Bep Ngoc Bao product URL.

## Parsing Strategy

The parser uses a hybrid strategy for resilience:

1. Try to extract embedded structured product data from the collection HTML if the page includes JSON blobs commonly exposed by ecommerce themes.
2. Fallback to HTML parsing using stable collection-card patterns when structured data is missing.
3. Normalize relative URLs, HTML entities, and localized currency text into the contract above.
4. Filter out invalid entries without a name or product URL.
5. Return at least the first 6 valid products when available.

This hybrid approach keeps the implementation aligned with the "crawl and parse collection HTML" requirement while reducing breakage risk if the theme exposes machine-readable product data.

## Netlify Function Design

File: `netlify/functions/bnb-products.js`

Responsibilities:

- Fetch `https://bepngocbao.vn/collections/hot-products` with a browser-like user agent.
- Parse the HTML using the shared parser utility.
- Return JSON with:
  - `Cache-Control: public, max-age=1800`
  - `Content-Type: application/json; charset=utf-8`
- Maintain an in-memory runtime cache for 30 minutes.
- If Bep Ngoc Bao is unavailable but cache exists, return the most recent cached payload with a success response.
- If no cache exists and fetch fails, return a non-breaking error payload the frontend can handle cleanly.

Cache behavior:

- Primary freshness window: 30 minutes.
- Runtime cache structure stores `data`, `fetchedAt`, and `source`.
- `source` is either `live` or `cache`, allowing debugging without affecting UI behavior.

## Frontend Design

Files:

- `src/services/bnb-api.js`
- `src/components/featured-products.js`

The frontend renders a new "Featured Products" section below the existing hero content and above the search card.

Behavior:

- Show skeleton cards while loading.
- Fetch from `/.netlify/functions/bnb-products`.
- Render cards in a responsive grid:
  - Desktop: 6 columns
  - Tablet: 3 columns
  - Mobile: 2 columns
- Open the Bep Ngoc Bao product URL on click.
- Hide price rows if price data is missing.
- Use a local fallback image if product image is missing or fails to load.
- Show a friendly error state with `Khong the tai san pham` if the function cannot return usable data.

## UI Style

The section should feel consistent with the current site while shifting toward a modern appliance-retail presentation:

- Mobile-first product grid
- Soft surface cards with stronger hover elevation
- Discount badge at the top corner
- Lazy-loaded images
- Smooth transitions
- Clear pricing hierarchy
- Compact card titles with fixed-height clamp
- Section header and short supporting copy

The design should preserve the current color system and typography so the new section feels integrated rather than bolted on.

## SEO and Metadata

The page will gain:

- Updated `<title>` and `<meta name="description">` to reflect both tracking and featured products.
- Open Graph title and description aligned with the page purpose.
- A JSON-LD `ItemList` plus `Product` entries generated from fetched product data when available on the client.

Constraint:

Because the current site is static and not server-rendered, fully server-side realtime product schema is not available in this phase. The implementation will still improve discoverability with strong page metadata and client-injected structured data, with a possible future upgrade to prerendered or edge-rendered product HTML if deeper SEO for individual products becomes necessary.

## Performance

- No new heavy dependency should be added.
- Frontend modules stay framework-free and async.
- Images use `loading="lazy"` and `decoding="async"`.
- DOM updates render in one batch after fetch completion.
- Skeletons prevent layout jank.
- The function returns only normalized product fields, avoiding oversized HTML transfer to the client.

## Error Handling

Backend:

- If fetch succeeds but parsing returns zero products, treat it as an upstream parsing failure.
- If cached data exists, return cached products.
- If nothing usable exists, return an error JSON payload with an empty `products` array and message.

Frontend:

- If response is empty or flagged as failed, show `Khong the tai san pham`.
- If image is missing, swap to a local default image.
- If a product lacks price, omit the pricing block rather than showing placeholders.

## File Changes

New files:

- `netlify/functions/bnb-products.js`
- `src/services/bnb-api.js`
- `src/components/featured-products.js`
- `src/utils/parser.js`

Likely updated files:

- `src/app.js`
- `index.html`
- `styles.css`
- `netlify.toml`

## Testing Strategy

Focus on lightweight verification suitable for the current stack:

- Parser unit coverage for product extraction and normalization.
- Manual local verification of the function response.
- Frontend verification of loading, success, missing image, missing price, and error states.
- Responsive verification across mobile, tablet, and desktop breakpoints.

## Non-Goals

- No cart integration.
- No checkout flow.
- No local product database.
- No iframe embeds.
- No direct browser fetch to Bep Ngoc Bao.
- No support for multiple collections in this phase.

## Open Implementation Notes

- If the upstream HTML blocks automated access intermittently, the function should send a realistic browser user agent and accept-language headers.
- If the collection page exposes fewer than 6 products, the UI should render however many valid products are available without breaking layout.
- The default image should be stored locally to avoid depending on a broken upstream image path.
