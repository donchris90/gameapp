# Deploy with Supabase (database) and Render (API)

This replaces steps 1 to 3 of `DEPLOY.md`. Steps 4 onward (store accounts, apps, tests) stay the same.

## 1. Supabase: the database
1. Create a project at supabase.com. Pick the region closest to your players (for Nigeria, Europe or South Africa regions usually give the lowest delay). Save the database password.
2. Click **Connect** at the top. Under **Session pooler** copy the connection string (port **5432**, host like `aws-0-xx.pooler.supabase.com`). Replace `[YOUR-PASSWORD]` with your password.
   - Use the **session pooler**, not "Direct connection": direct is IPv6 only and Render cannot reach it.
   - Do **not** use the "Transaction pooler" (port 6543): it breaks migrations and the locks that keep coin balances safe.
3. You only use Supabase as a Postgres database. Do not add its auth or storage; the app has its own accounts. In Settings, Data API, you can switch the Data API off so the tables are not exposed on the web.
4. Free Supabase projects pause after a week of no use. Use the Pro plan before launch, which also gives daily backups.

## 2. Render: the API
1. Push this repo to GitHub (done: `donchris90/gameapp`).
2. In Render choose **New, Blueprint**, connect the repo and pick `render.yaml`. It creates the service `playcircle-api`.
3. Fill the values it asks for:
   - `DATABASE_URL`: the Supabase session pooler string from step 1.
   - `CORS_ORIGINS`: the address of the admin website (add it after step 3 below; use `https://placeholder.invalid` for now).
   - The Google and Apple values can stay empty until you have your store accounts. While empty, purchases are rejected, which is the safe default.
4. Deploy. Render builds, applies the database migrations and starts the API. Open `https://playcircle-api.onrender.com/health`: it must answer ok.
5. Keep the service on the **Starter** plan or higher with **one instance**. The free plan sleeps after 15 minutes idle, which would drop live games and timers, and a second instance would break matches.
6. Optional: add your own domain (`api.yourdomain.com`) in Render, Settings, Custom Domains.

## 3. Admin website
Build it (`VITE_API_URL=https://playcircle-api.onrender.com npx vite build` inside `admin`) and host the `dist` folder as a Render **Static Site** (or Cloudflare Pages / Netlify). Then put its address in `CORS_ORIGINS` in the Render dashboard.

Make yourself admin: register in the app, then in the Render dashboard open the service, **Shell**, and run `npm run make-admin -- you@email.com`.

## 4. Mobile app
Set `EXPO_PUBLIC_API_URL=https://playcircle-api.onrender.com` (or your custom domain) in `mobile/.env`, then build with EAS as described in `DEPLOY.md`, step 6.

## 5. Backups and safety
- Supabase Pro keeps daily backups; also take your own occasionally: Supabase, Database, Backups.
- The coin ledger is the money record; never edit it by hand in the table editor.
- Never put the Supabase `service_role` key or database password in the mobile app. Only the API knows them.

## Troubleshooting
- "self-signed certificate in certificate chain": `DATABASE_SSL=no-verify` is missing on Render.
- "too many connections" or "max clients reached": lower `DATABASE_POOL_MAX` (try 5).
- Migration hangs or fails with "prepared statement" errors: you used the transaction pooler (port 6543); switch to the session pooler (5432).
- Cannot reach the database at all: you used the direct connection host; use the pooler host.
