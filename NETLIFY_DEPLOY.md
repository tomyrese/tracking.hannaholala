# Deploy Netlify

## Environment variables

Set these variables in Netlify `Site configuration > Environment variables`:

```env
GHN_BASE_URL=https://online-gateway.ghn.vn/shiip/public-api
GHN_SHOP_ID=...
GHN_TOKEN=...
NETLIFY_BUILD_HOOK_URL=https://api.netlify.com/build_hooks/...
```

Optional:

```env
CAPTCHA_SECRET=some-long-random-secret
```

## Build settings

Netlify reads these from `netlify.toml`:

```toml
[build]
  command = "npm run build"
  publish = "."
  functions = "netlify/functions"
```

API routes:

- `/api/health` -> Netlify Function health check
- `/api/captcha/generate` -> captcha Function
- `/api/track` -> GHN tracking Function

Scheduled sync:

- `check-ghn-updates` runs every 10 minutes.
- It checks the latest GHN orders against the bundled `ghn_orders.json`.
- If it finds a new or updated order, it calls `NETLIFY_BUILD_HOOK_URL` to trigger a new deploy.
- During that deploy, `npm run build` runs `syncGhnOrders()` and refreshes `ghn_orders.json`.

Create the build hook in Netlify:

1. Open `Site configuration > Build & deploy > Continuous deployment > Build hooks`.
2. Add a build hook for the production branch.
3. Copy the generated URL into `NETLIFY_BUILD_HOOK_URL`.

## Deploy

Push the project to GitHub and connect the repo in Netlify, or deploy with Netlify CLI:

```powershell
npm run build
netlify deploy --prod
```

Do not commit `.env`; use Netlify environment variables for secrets.
