# Modification History

## Added files
- [netlify.toml](file:///d:/Work/HOtracking/netlify.toml)
- [netlify/functions/track.js](file:///d:/Work/HOtracking/netlify/functions/track.js)
- [package.json](file:///d:/Work/HOtracking/package.json)
- [.env](file:///d:/Work/HOtracking/.env)

## Modified files
- [trackingApi.mjs](file:///d:/Work/HOtracking/src/trackingApi.mjs)
- [app.js](file:///d:/Work/HOtracking/src/app.js)
- [server.mjs](file:///d:/Work/HOtracking/server.mjs)
- [index.html](file:///d:/Work/HOtracking/index.html)
- [.env.example](file:///d:/Work/HOtracking/.env.example)
- [styles.css](file:///d:/Work/HOtracking/styles.css)
- [detectCarrier.mjs](file:///d:/Work/HOtracking/src/detectCarrier.mjs)

## Deleted files
- test.py
- jt_tracking.html
- skill.md
- tests/ (directory)
- orders.json
- logo_large.png

## Commands executed
- `node tests/detect-carrier.test.mjs`
- `python test.py`
- `node test_jnt.mjs`
- `curl.exe -s "http://localhost:3000/api/track?code=861879598659"`
- `curl.exe -s "http://localhost:3000/api/track?code=861879598659:4710"`
- `Browser subagent verification flow (verify_jnt_popup)`
- `node server.mjs` (testing latest detail API)
- `curl.exe -s "http://localhost:3000/api/track?code=5ENLKKHD"`

## Bugs found
- Sending the `ShopId` header in `buildGhnHeaders()` caused the GHN API to throw `corev2_tenant_check_shop_client - Client is not belong of shop` because GHN validates that the client/token owns the specific shop. Since tracking endpoints only require the `Token` header, sending `ShopId` leads to authorization failures for orders from other shops.
- When querying orders from other shops (e.g. `VNGH80885445503`), the private GHN `/v2/shipping-order/detail` endpoint strictly rejects queries with `Client is not belong of shop` even if `ShopId` header is omitted, because the token does not own the shop that created the order.
- Order status logs were returned oldest-first, resulting in inverted timeline visualization where oldest events were styled as the latest/success step.
- Raw ISO 8601 timestamps were rendered directly to users without localization.
- Missing mappings for statuses like `returning` and `return_fail`.
- The frontend directed API requests to `window.location.origin` if not loaded under `file:` protocol. When users run the interface via Live Server or a separate port, this caused `404 Not Found` responses.
- Backend server port defaults to `4173` which was changed to standard port `3000` by user preference.
- The J&T scraper's nesting-aware HTML parser initially failed to match closing `</div>` tags because of an off-by-one character length check (checking length 5 instead of 6).

## Fixes applied
- Removed `ShopId` header entirely from `buildGhnHeaders()` so that it only passes the `Token` header.
- Rebuilt `trackShipment()` in [trackingApi.mjs](file:///d:/Work/HOtracking/src/trackingApi.mjs) to implement public API merging and data cleaning similar to [test.py](file:///d:/Work/HOtracking/test.py):
  - Queries four public GHN API endpoints (`tracking-logs`, `order-logs`, `call-logs`, `sms-logs`) in parallel.
  - Correlates the `employee_id` in tracking logs (where the name is masked like `xxxx Phú`) with call logs (where the name is unmasked like `Nguyễn Lê Hoàng Phú`) to clean and unmask the executor name.
  - Resolves address information by checking both `log.location.address` and `log.address`.
  - Includes the shipper's phone number in the timeline details even if it contains masked characters (e.g. `xxxx 4064`).
  - Combines all events (tracking status updates, call history, SMS events, and order log events) into a single timeline sorted chronologically from newest to oldest.
  - Formats all date-times to local format (`HH:mm DD/MM/YYYY`).
  - Retains the private API fallback for regular codes (if the public API fails and a token is configured) and private API primary lookup for internal `HO` client codes.
- Updated `createSetupResponse()` setup message/instruction to only require `GHN_TOKEN`.
- Reversed the logs array in `normalizeGhnResponse()` to ensure the newest event is at index 0.
- Implemented `formatGhnTime()` to format ISO date-time strings to readable Vietnamese format (`HH:mm DD/MM/YYYY`).
- Added mappings for `returning` and `return_fail` in `statusLabels`.
- Modified `apiBaseUrl` in `src/app.js` to default to `http://localhost:3000` when the protocol is `file:` or when the port is not `3000`, routing API calls correctly regardless of the dev server used to view the frontend.
- Changed default server port to `3000` in `server.mjs`, `index.html`, and `src/app.js`.
- Updated `.timeline` in `styles.css` to restrict max-height to `280px` (originally `480px`) and compressed overall margins, paddings, headings, and input heights to fit the entire tracking page within a single viewport height.
- Added J&T Express carrier configuration in `detectCarrier.mjs` matching 12-digit numeric codes and parsing optional user-provided cellphone suffixes (e.g. `861879598659:4710` or `861879598659-4710`).
- Implemented J&T HTML scraper and parser in `trackingApi.mjs` to fetch and parse tracking logs from `jtexpress.vn` dynamically.
- Fixed the J&T HTML parser div closing tag matcher off-by-one error (updated to length 6).
- Modified frontend `app.js` and `index.html` to dynamically update titles, badge statuses, placeholders, helper messages, and support contact details based on the detected carrier.
- Added glassmorphic HTML popup verification modal (`#jnt-modal`) to `index.html` to capture phone number suffixes when tracking J&T Express orders.
- Appended responsive popup styles, scale-in viewport animations, and border shake validation animations to `styles.css`.
- Coded promise-driven modal event listeners (`askJntPhone`) in `src/app.js` to automatically intercept J&T lookup actions, prompt users, and validate 4-digit entries.
- Removed temporary and development-only files (`test.py`, `jt_tracking.html`, `skill.md`, and the `tests/` directory) to clean up the codebase for production.
- Created `netlify.toml` with build commands, publish folder, and endpoint redirects for deployment to Netlify.
- Implemented a serverless API function `netlify/functions/track.js` using Netlify's standard function handler to expose the shipment tracking API without a persistent server process.
- Created `package.json` with `"type": "module"` configured to support ES module syntax in serverless functions.
- Modified connection error handler in `src/app.js` to dynamically detect hostname: shows local server instructions when on localhost/file, and serverless/network troubleshooting steps when deployed on Netlify.
- Modified `trackingApi.mjs` to migrate standard GHN order code tracking from public log endpoints to the official `/v2/shipping-order/detail` API, utilizing the default token `'637170d5-942b-11ea-9821-0281a26fb5d4'` when `GHN_TOKEN` is unset in the environment.
- Implemented chronological timeline builder `buildTimelineFromOrderDetails()` from key GHN order milestone fields (including `order_date`, `created_date`, `pickup_time`, `leadtime`, `updated_date`, `finish_date`, `cod_collect_date`, `cod_transfer_date`, `cod_failed_collect_date`).
- Cleaned up obsolete helper functions (`fetchPublicTrackingData` and `cleanAndMergeLogs`) from `trackingApi.mjs`.
- Restarted the local server process to load the newly configured `GHN_TOKEN` from `.env`, successfully resolving the 424 Failed Dependency error for client code `HO1741057`.
- Modified `buildTimelineFromOrderDetails()` in [trackingApi.mjs](file:///d:/Work/HOtracking/src/trackingApi.mjs) to merge GHN `log` and `pods` arrays, capturing driver names/phones, trip codes, locations, failed reasons, and proof images.
- Updated front-end timeline rendering in [app.js](file:///d:/Work/HOtracking/src/app.js) to use `div.timeline__detail` instead of `span` tags, allowing block-level elements (like image wrappers) to render correctly.
- Added `.pod-images` and `.pod-thumbnail` styles to [styles.css](file:///d:/Work/HOtracking/styles.css) for clean rendering and smooth hover zoom animations.
- Verified rendering using a browser session to query `HO1741057`, verifying the driver information and weighing photo thumbnails display and link properly.
- Added phone number format auto-detection (9-11 digits) to [detectCarrier.mjs](file:///d:/Work/HOtracking/src/detectCarrier.mjs) to tag searches as pseudo-carrier `phone` (SĐT).
- Implemented `searchOrdersByPhone()` in [trackingApi.mjs](file:///d:/Work/HOtracking/src/trackingApi.mjs) to load and parse local database `ghn_orders.json`, matches phone numbers by last 9 digits (supporting local and country prefixes), sorts results by newest first, and returns clean order records containing carrier metadata.
- Developed multi-order list card rendering in [app.js](file:///d:/Work/HOtracking/src/app.js) (`renderPhoneOrders`) to present matching orders with recipient names, dates, statuses, and COD amounts.
- Connected clickable "Theo dõi hành trình" buttons in order list cards to automatically trigger the detailed timeline fetch for the selected order.
- Verified phone search results and downstream navigation flow in browser using test phone number `0982822614`.
- Removed topbar navigation badges ("GHN & J&T", "Realtime", "Tra cứu đơn") from [index.html](file:///d:/Work/HOtracking/index.html) as requested.
- Removed search provider badge output from [index.html](file:///d:/Work/HOtracking/index.html) and cleared corresponding Javascript logic in [app.js](file:///d:/Work/HOtracking/src/app.js).
- Removed carrier support aside panel (`aside.support-card`) and inline carrier labels from [index.html](file:///d:/Work/HOtracking/index.html), removing all associated styling and JavaScript functions.
- Updated `.result-grid` in [styles.css](file:///d:/Work/HOtracking/styles.css) to make the tracking timeline card full-width.
- Integrated phone search in-memory caching state `lastPhoneSearchResult` in [app.js](file:///d:/Work/HOtracking/src/app.js) to preserve previous query results.
- Added a "Quay lại" back button to the tracking details page in [app.js](file:///d:/Work/HOtracking/src/app.js), allowing users to return to the phone search results list instantly.
- Repositioned the back button inside a new flex container in the status header (`.status-head` / `data-back-btn-container`) in [index.html](file:///d:/Work/HOtracking/index.html), aligning it horizontally next to the order code pill.
- Added cache relevance check in `trackCurrentCode()` to reset the saved SĐT results if a new independent query is triggered.
- Verified back-navigation flows and UI rendering in the browser.
- Created stateless security module [captcha.mjs](file:///d:/Work/HOtracking/src/captcha.mjs) generating vector SVG images with noise lines and HMAC-based signature tokens for verification.
- Enforced captcha query parameter verification on `/api/track` inside [server.mjs](file:///d:/Work/HOtracking/server.mjs) and [track.js](file:///d:/Work/HOtracking/netlify/functions/track.js), returning HTTP 403 Forbidden with captcha error payload for invalid or expired inputs.
- Created Netlify serverless function [captcha.js](file:///d:/Work/HOtracking/netlify/functions/captcha.js) to serve captcha assets.
- Added visual security modal dialog `#captcha-modal` to [index.html](file:///d:/Work/HOtracking/index.html).
- Developed promise-driven popup check flow in [app.js](file:///d:/Work/HOtracking/src/app.js) (`askCaptcha`) prompting captcha solving on tracking request, with inline SVG rendering, refresh buttons, and auto-focus key listeners.
- Verified captcha popups and cancel behaviors inside browser tests.
- Resized and enlarged captcha SVG canvas to 150x50px, increased text sizes to 28-36px in [captcha.mjs](file:///d:/Work/HOtracking/src/captcha.mjs), and styled `#captcha-image-container` with explicit dimensions in [index.html](file:///d:/Work/HOtracking/index.html) to prevent layout collapse.

## Remaining issues
- None

## Recent Updates (CAPTCHA Font, Size Enlargement & Vietnamese Typography Improvements)
### Modified files
- [styles.css](file:///d:/Work/HOtracking/styles.css) (Appended specific SVG element overrides for `#captcha-image-container svg` and its child selectors; updated all font-family definitions to utilize Be Vietnam Pro and Inter)
- [index.html](file:///d:/Work/HOtracking/index.html) (Resized `#captcha-image-container` element to 180px by 60px; added Google Fonts import for Be Vietnam Pro & Inter)
- [captcha.mjs](file:///d:/Work/HOtracking/src/captcha.mjs) (Resized output SVG canvas to 180x60px, increased text font size range to 34px-42px, and set font-family to 'Be Vietnam Pro', 'Inter', sans-serif to render lining numbers)

### Commands executed
- Stopped background server tasks
- Started background server task-564 (`node server.mjs`)
- Executed browser verification workflow `verify_vietnamese_font`

### Bugs found
- Georgia font was causing display issues on Vietnamese text headings (poor accent placement) and yielded old-style uneven numbers for CAPTCHAs where some digits descended below the baseline.
- Missing Google Fonts integration in `<head>` caused browsers to fall back to generic system fonts.

### Fixes applied
- Imported Google Fonts (`Be Vietnam Pro` and `Inter`) inside the HTML head.
- Replaced all usages of `Georgia` serif font on headings and brand names with a beautiful, fully accented, modern sans-serif stack `'Be Vietnam Pro', 'Inter'`.
- Configured the CAPTCHA SVG text to use `'Be Vietnam Pro', 'Inter'` to align digits evenly on the baseline for high legibility.
- Verified visual layout and Vietnamese tone mark rendering in a browser session.

## Recent Updates (Automatic Background Order Synchronization)
### Added files
- [sync.mjs](file:///d:/Work/HOtracking/src/sync.mjs) (Contains GHN search and merge sync logic)

### Modified files
- [server.mjs](file:///d:/Work/HOtracking/server.mjs) (Imports `syncGhnOrders` and starts startup/interval scheduling)
- [.env](file:///d:/Work/HOtracking/.env) (Added `GHN_SHOP_ID` and `SYNC_INTERVAL_MS` configurations)
- [.env.example](file:///d:/Work/HOtracking/.env.example) (Added sample configurations for shop ID and interval)
- [history.md](file:///d:/Work/HOtracking/history.md) (Updated list of deleted files and updates log)

### Commands executed
- Deleted temporary files `test.py`, `orders.json`, and `logo_large.png` via PowerShell
- Stopped background server tasks
- Started background server task-652 (`node server.mjs`)

- Created a background scheduler using `setInterval` that runs every 10 minutes (configurable via `SYNC_INTERVAL_MS`).
- Developed a merging service that calls GHN's `v2/shipping-order/search` API for the most recent 100 orders, updating existing records in `ghn_orders.json` (such as delivery status, COD amounts, fees) and appending new ones.
- Sort the consolidated order list chronologically (newest first) before writing the changes back to `ghn_orders.json` to keep the database organized.
- Successfully verified the sync output logs upon server restart.
- Configured Netlify `included_files` inside `netlify.toml` to copy `ghn_orders.json` to the Lambda execution environment.
- Created `build.mjs` and configured `npm run build` as the Netlify build command to trigger the synchronization at deployment time, ensuring the database is always updated to the latest state when published.

## Remaining issues
- None

## Recent Updates (Netlify Pre-Build & Function Bundling Setup)
### Added files
- [build.mjs](file:///d:/Work/HOtracking/build.mjs) (Pre-build script to execute `syncGhnOrders` and generate/update the latest `ghn_orders.json` at build time)
- [.gitignore](file:///d:/Work/HOtracking/.gitignore) (Git ignore rules to prevent uploading private keys/tokens)

### Modified files
- [netlify.toml](file:///d:/Work/HOtracking/netlify.toml) (Added `command = "npm run build"` to trigger build stage and `included_files = ["ghn_orders.json"]` under `[functions]` to bundle the local database for serverless execution)
- [package.json](file:///d:/Work/HOtracking/package.json) (Added `"build": "node build.mjs"` script)
- [history.md](file:///d:/Work/HOtracking/history.md) (Updated logs)

## Recent Updates (Generalized Tracking Descriptions & Robust Env Loading)
### Modified files
- [index.html](file:///d:/Work/HOtracking/index.html) (Replaced all visual references to carrier names with "mã vận đơn hoặc số điện thoại")
- [app.js](file:///d:/Work/HOtracking/src/app.js) (Updated validation helper texts and placeholder descriptions)
- [build.mjs](file:///d:/Work/HOtracking/build.mjs) (Improved environment loading to unconditionally prioritize local .env file variables)
- [server.mjs](file:///d:/Work/HOtracking/server.mjs) (Updated loadEnvFile helper to match the new robust env priority loading)

### Commands executed
- Ran local build `npm run build` to verify build-time synchronization pipeline
- Restarted local Express server task-729 (`node server.mjs`)
- Executed browser verification flow `general_desc_val`

### Fixes applied
- Removed brand names (`GHN`, `J&T`, `mã nội bộ HO`) from all user-facing subheaders, input placeholders, validation warning labels, and logs. All occurrences are replaced with the generic `"mã vận đơn hoặc số điện thoại"`.
- Fixed an issue where local builds or runs would fail to detect the `GHN_TOKEN` from `.env` if the parent process had inherited placeholder environment variables, by enforcing unconditional loading of local file values.

## Recent Updates (Inline Captcha Error Message)
### Modified files
- [index.html](file:///d:/Work/HOtracking/index.html) (Added `#captcha-error-msg` element inside the captcha modal)
- [app.js](file:///d:/Work/HOtracking/src/app.js) (Replaced `alert()` popup with inline error text; added reset logic when modal opens)

### Fixes applied
- Replaced the browser-native `alert()` popup for captcha errors with a styled inline `<p>` error message displayed below the captcha input field inside the modal.
- The error message automatically clears when the captcha modal reopens with a new image.

## Recent Updates (Format money_collect_picking status in Timeline)
### Modified files
- [trackingApi.mjs](file:///d:/Work/HOtracking/src/trackingApi.mjs) (Added `money_collect_picking`, `return_transporting` and missing log action translations to `statusLabels` map)
- [track.js](file:///d:/Work/HOtracking/netlify/functions/track.js) (Synced `statusLabels` changes in Netlify serverless function)

### Commands executed
- Checked unique statuses and actions in `ghn_orders.json` database using scratch check script.
- Verified timeline formatting of `money_collect_picking` to "Đang lấy hàng (thu tiền)" using a scratch verification script.

### Bugs found
- Order status logs with values like `money_collect_picking` or action keys like `COLLECT_PICKING_MONEY` were rendered as raw English labels because they were missing from the status mappings.

### Fixes applied
- Added Vietnamese mappings for `money_collect_picking` ("Đang lấy hàng (thu tiền)"), `return_transporting` ("Đang luân chuyển hàng trả"), and several action titles like `COLLECT_PICKING_MONEY` and `START_DELIVERY_TRIP` to the `statusLabels` translations dictionary.
- Successfully verified that the order timeline output maps the statuses and actions cleanly.

## Recent Updates (OpenStreetMap Journey Map with Leaflet)
### Modified files
- [index.html](file:///d:/Work/HOtracking/index.html) (Replaced Three.js with Leaflet CDN, updated container to `#leaflet-map-container`, and modified user instructions)
- [styles.css](file:///d:/Work/HOtracking/styles.css) (Added styling for Leaflet container and custom animated HTML marker badges)
- [app.js](file:///d:/Work/HOtracking/src/app.js) (Implemented real-world map rendering using Leaflet and CartoDB Positron tiles, mapped custom SVG marker pins, and coded smooth marker coordinate animation loop)
- [trackingApi.mjs](file:///d:/Work/HOtracking/src/trackingApi.mjs) (Exposed event coordinates and top-level origin/destination locations, added offline/local ghn_orders.json search fallback to support local verification)

### Commands executed
- Ran Express test server and verified layout & marker rendering in browser subagent session.
- Tested Polyline routing, zoom controls, and smooth truck animation upon timeline interaction.
- Verified Netlify pre-build stage.

### Fixes applied
- Migrated map engine from customized 3D Three.js canvas to real-world OpenStreetMap (via Leaflet.js).
- Configured premium CartoDB Positron tile theme to match the light cream theme of the website.
- Styled custom origin/destination SVG markers and added a bouncing CSS keyframe animation for the delivery truck.
- Solved grey grid rendering glitches by forcing `leafletMap.invalidateSize()` after container displays.
- Added offline fallback database check in `callGhnDetail` so that local development and offline browser testing work without configuration tokens.

## Recent Updates (Leaflet Map Enhancements & Road Routing Integration)
### Modified files
- [index.html](file:///d:/Work/HOtracking/index.html) (Removed inline min-height from map container)
- [styles.css](file:///d:/Work/HOtracking/styles.css) (Increased map container min-height to 550px, added animations/styles for map-warehouse-icon, map-box-icon, map-check-icon markers)
- [app.js](file:///d:/Work/HOtracking/src/app.js) (Added warehouse SVG icon, implemented semantic getEventIconName mapping, updated timeline items with data-title, created custom Leaflet marker icons, centered map on Vietnam initially, implemented OSRM road routing integration)

### Commands executed
- Launched Express server `node server.mjs`
- Verified features inside browser subagent (tracked order HO1744510, solved captcha, checked map height, route, and marker icon changes)

### Fixes applied
- Bypassed the straight-line routing polyline limitations by integrating the public, free Open Source Routing Machine (OSRM) API, showing realistic road navigation.
- Fixed the issue where warehouse transitions ("chuyển kho") did not update the map vehicle icon by defining specific, semantic marker icons (truck, warehouse, check, box) and dynamically setting the active marker's icon using `truckMarker.setIcon()` on timeline event interaction.
- Resolved view scaling issues by setting the initial Leaflet map center to the geographical center of Vietnam at zoom level 6.
- Balanced the visual layout by extending the map card min-height to 550px.

## Recent Updates (Delivery App Map UI Enhancements)
### Modified files
- [app.js](file:///d:/Work/HOtracking/src/app.js) (Updated recipientIcon to display a person SVG and modified routePolyline styling to vibrant blue #3b82f6)

### Commands executed
- Launched server `node server.mjs`
- Ran browser subagent verification (searched HO1744510, solved captcha, verified recipient person icon, route path color, and vehicle animation)

### Fixes applied
- Changed the destination marker from a standard pin to a white person/user icon to clearly represent the recipient.
- Updated the route path style to a vibrant blue line (`#3b82f6` with `0.9` opacity) mimicking real-world delivery application maps.

## Recent Updates (Revert to Standard OpenStreetMap Tiles)
### Modified files
- [app.js](file:///d:/Work/HOtracking/src/app.js) (Changed the Leaflet tile layer back to the standard OpenStreetMap tile layer `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`)

### Commands executed
- Cleaned up running node processes `Stop-Process -Name node -Force`
- Started server `node server.mjs`
- Ran browser subagent verification (verified standard colorful OpenStreetMap tiles render properly)

### Fixes applied
- Reverted the map tile provider from CartoDB Positron to the standard, colorful OpenStreetMap (OSM) tile styling as requested.

## Recent Updates (User Geolocation Proximity Zoom)
### Modified files
- [app.js](file:///d:/Work/HOtracking/src/app.js) (Added navigator.geolocation setup to query user's coordinates, created getDistanceInKm distance utility, and adjusted fitBounds to zoom to level 15 when the order destination is within 20km of the user)

### Commands executed
- Stopped background server processes
- Started server `node server.mjs`
- Ran browser subagent verification (verified standard tiles and proximity logic compile and initialize cleanly)

### Fixes applied
- Implemented user proximity zoom detection using the browser's Geolocation API. If the order destination is within 20km of the user, it centers and zooms in closer (zoom level 15) to help the user see street-level delivery details. Otherwise, it fits the entire route bounds as usual.

## Recent Updates (Hide Technical Error Messages)
### Modified files
- [trackingApi.mjs](file:///d:/Work/HOtracking/src/trackingApi.mjs) (Added cleanErrorMessage helper and applied it to sanitize raw error responses from GHN API)
- [track.js](file:///d:/Work/HOtracking/netlify/functions/track.js) (Added cleanErrorMessage helper and sanitized raw GHN error response messages)
- [app.js](file:///d:/Work/HOtracking/src/app.js) (Added cleanErrorMessage helper on the frontend and applied it to sanitize raw errors in helperText and timeline event details)

### Commands executed
- Launched local server `node server.mjs`
- Ran browser subagent verification flow `verify_error_cleanup` to search `HO1697891` and verify sanitization

### Bugs found
- Technical API errors containing prefixes like `Lỗi gọi API:` or `corev2_tenant_order_detail_by_client_order_code - ` were leaked directly to the user interface.

### Fixes applied
- Implemented `cleanErrorMessage` sanitization function in the core tracking API, Netlify serverless function, and frontend UI to clean up prefixes and technical codes, ensuring the user only sees friendly error notices like `Đơn hàng không tồn tại`.

