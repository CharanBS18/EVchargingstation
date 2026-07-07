# EV ChargeHub — Local Development

Smart EV charging-station booking platform for India. TanStack Start
(React 19 + Vite) frontend and server, Supabase for database/auth,
Razorpay for payments, and a configurable AI provider for the support
chatbot.

This README covers running the project **entirely locally in VS Code**,
outside the Lovable platform.

---

## 1. Prerequisites

| Tool                 | Version                                              |
| -------------------- | ---------------------------------------------------- |
| Node.js              | **20.x or 22.x** (Vite 8 requires ≥ 20.19 or ≥ 22.12) |
| npm / bun            | npm 10+, or `bun` 1.1+                               |
| A Supabase project   | Free tier at <https://supabase.com>                  |
| (optional) Android Studio | only if you want to build the APK              |
| (optional) Supabase CLI | `npm i -g supabase` — applies migrations         |

---

## 2. Install dependencies

```bash
npm install
# or: bun install
```

> **Blocker to be aware of.** `devDependencies` still contains
> `@lovable.dev/vite-tanstack-config`. That package is a pre-bundled
> Vite preset (TanStack Start plugin + React + Tailwind v4 +
> `vite-tsconfig-paths` + Nitro Cloudflare adapter + dev helpers).
> `npm install` pulls it from the public npm registry, so **install
> works on any machine** — but if you want to fully sever the Lovable
> dependency, see **Section 8: Replacing the Vite preset**.

---

## 3. Environment variables

Copy the example and fill in real values:

```bash
cp .env.example .env
```

All variables are documented in `.env.example`. The minimum to boot the
UI is `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` +
`SUPABASE_URL` + `SUPABASE_PUBLISHABLE_KEY`. Chat, payments and admin
require their respective sections.

---

## 4. Supabase setup

1. Create a project at <https://supabase.com>.
2. Copy **Project URL**, **anon (publishable) key**, and **service_role
   key** from *Project Settings → API* into `.env`.
3. Apply the schema shipped in `supabase/migrations/`:

   ```bash
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```

   Alternatively, open the SQL editor in Supabase and paste each
   migration file in order.

4. In *Authentication → Providers*, enable **Email** (and Google if you
   want social sign-in — you'll need Google OAuth client credentials
   from Google Cloud Console).

Row-Level Security policies, roles (`admin`, `operator`, `user`), the
`has_role` function, and the trigger-driven profile creation all live
inside those migrations.

### Fully offline Supabase (optional)

Run Supabase locally with Docker instead of using the hosted service:

```bash
npx supabase start        # boots Postgres + Auth + Storage + Studio
npx supabase db reset     # applies all migrations to the local DB
```

Then point `.env` at the local URLs printed by `supabase start`
(usually `http://127.0.0.1:54321`).

---

## 5. Run the app

```bash
npm run dev          # dev server on http://localhost:3000
npm run build        # production build
npm run build:dev    # build with development mode (skips prerender auth)
npm run preview      # preview the production build
npm run lint
```

There is no separate backend server — API endpoints live in
`src/routes/api/**` and run inside the same TanStack Start process.

---

## 6. Chatbot provider

The `/api/chat` endpoint is provider-agnostic. Configure via `.env`:

| `AI_PROVIDER` | Uses                                             | Env vars needed                       |
| ------------- | ------------------------------------------------ | ------------------------------------- |
| `openai` (default) | OpenAI                                      | `OPENAI_API_KEY`                      |
| `lovable`     | Lovable AI Gateway                               | `LOVABLE_API_KEY`                     |
| *(any)*       | Any OpenAI-compatible endpoint (Groq, Ollama, …) | `AI_BASE_URL` + `AI_API_KEY` + `AI_MODEL` |

Override the model with `AI_MODEL` (defaults: `gpt-4o-mini` for OpenAI,
`google/gemini-3-flash-preview` for Lovable).

---

## 7. Payments (Razorpay)

Populate `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and
`RAZORPAY_WEBHOOK_SECRET` in `.env`. The webhook endpoint is:

```
POST /api/public/webhooks/razorpay
```

For local webhook testing use `ngrok`/`cloudflared` to expose
`localhost:3000` and register that URL in the Razorpay dashboard.

---

## 8. Replacing the Vite preset (remaining Lovable blocker)

`vite.config.ts` still imports `@lovable.dev/vite-tanstack-config`. It
works from the public npm registry so **install and dev do not require
Lovable infrastructure**, but if you want to eliminate every Lovable
package do the following:

1. `npm remove @lovable.dev/vite-tanstack-config`
2. Install the pieces it bundles:
   ```bash
   npm i -D @tanstack/router-plugin @vitejs/plugin-react \
           @tailwindcss/vite vite-tsconfig-paths
   ```
3. Replace `vite.config.ts` with:
   ```ts
   import { defineConfig } from "vite";
   import { tanstackStart } from "@tanstack/react-start/plugin/vite";
   import react from "@vitejs/plugin-react";
   import tailwindcss from "@tailwindcss/vite";
   import tsconfigPaths from "vite-tsconfig-paths";

   export default defineConfig({
     server: { port: 3000 },
     plugins: [
       tsconfigPaths(),
       tailwindcss(),
       tanstackStart({ target: "node-server", server: { entry: "server" } }),
       react(),
     ],
   });
   ```
4. Remove `nitro` from `devDependencies` (only needed for the Cloudflare
   target the Lovable preset ships).

I did not run this swap automatically because it changes the build
target from Cloudflare Workers to plain Node and cannot be verified
without booting the dev server on your machine.

---

## 9. Android (optional)

The `android/` folder is a Capacitor WebView wrapper. Set
`CAP_SERVER_URL` in `.env` to your dev machine's LAN URL (or the emulator
loopback `http://10.0.2.2:3000`) and run:

```bash
npm run build
npx cap sync android
```

Then open `android/` in Android Studio and press ▶.

---

## 10. What was changed to make this run locally

Full change log lives in the commit that shipped alongside this README.
Summary:

| File                                    | Change                                                              | Why                                                                          |
| --------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `src/routes/api/chat.ts`                | Configurable AI provider (`AI_PROVIDER`, `AI_BASE_URL`, `AI_MODEL`) | Defaults to OpenAI so you don't need Lovable AI Gateway                      |
| `src/integrations/lovable/index.ts`     | Rewritten to call `supabase.auth.signInWithOAuth` directly          | Removes runtime dependency on `@lovable.dev/cloud-auth-js` (imported by nothing critical) |
| `capacitor.config.ts`                   | `server.url` reads from `CAP_SERVER_URL`, defaults to emulator loopback | Removes hardcoded preview URL                                                |
| `src/routes/sitemap[.]xml.ts`           | `BASE_URL` from `process.env.SITE_URL`                              | Removes hardcoded `chargehub-ev-spark.lovable.app`                           |
| `src/routes/__root.tsx`                 | Removed preview screenshot og:image/twitter:image                   | Removes hardcoded Lovable CDN URL                                            |
| All `_authenticated/*.tsx` routes + `auth.tsx` | Stripped `og:url`/`canonical` tags pointing at the preview host | Same                                                                         |
| `.env.example`                          | New file listing every variable                                     | So you can `cp .env.example .env` and go                                     |
| `README.md`                             | This file                                                           | Setup instructions                                                           |

### Lovable pieces still present (and why)

| Item                                | Kept because                                                                                       |
| ----------------------------------- | -------------------------------------------------------------------------------------------------- |
| `@lovable.dev/vite-tanstack-config` | Removing it means reconstructing the entire Vite preset (see Section 8). It installs fine from npm. |
| `@lovable.dev/cloud-auth-js`        | Listed in `package.json` but no longer imported. Safe to remove with `npm remove @lovable.dev/cloud-auth-js`. |
| `SUPABASE_PROJECT_ID`               | This is your Supabase project ref, not Lovable — required by the Supabase CLI and integration.     |

No other Lovable-hosted service is required at runtime.
# EVchargingstation
