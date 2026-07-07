# Prompt — Rebuild "EV Charging Station Booking" as a Native Android App

Copy everything between the lines into your Android Studio AI assistant (Gemini in Android Studio, Cursor, Claude, etc.) or hand it to an Android developer.

---

**You are building a production-ready native Android application that replicates my existing EV Charging Station booking web app feature-for-feature. The Android app MUST connect to my existing Lovable Cloud (Supabase) backend — same project URL, same publishable/anon key, same database schema, same RLS policies, same server functions, same Razorpay integration, same webhook. Do NOT create a new backend, do NOT modify the database schema, do NOT duplicate business logic that already lives in server functions.**

## 1. Tech Stack (mandatory)

- **IDE:** Android Studio (latest stable, Koala or newer)
- **Language:** Kotlin 2.0+
- **UI:** Jetpack Compose (BOM latest) + Material 3
- **Min SDK:** 24  •  **Target/Compile SDK:** 34  •  **JVM target:** 17
- **Build:** Gradle Kotlin DSL, Version Catalog (`libs.versions.toml`)
- **Architecture:** MVVM + Clean (data / domain / ui layers) with Repository pattern
- **State:** `ViewModel` + `StateFlow` + `SharedFlow` (no LiveData)
- **DI:** Hilt
- **Async:** Kotlin Coroutines + Flow
- **Navigation:** Navigation-Compose with type-safe routes (kotlinx.serialization)
- **Networking / Backend SDK:** `io.github.jan-tennert.supabase` (`postgrest-kt`, `auth-kt`, `realtime-kt`, `storage-kt`, `functions-kt`) + Ktor CIO engine
- **Serialization:** kotlinx.serialization
- **Images:** Coil 3 (Compose)
- **Maps:** `com.google.maps.android:maps-compose` + Google Maps SDK for Android
- **Location:** Google Play Services Location (`FusedLocationProviderClient`)
- **QR Scanning:** ML Kit Barcode Scanning + CameraX (Preview + ImageAnalysis)
- **Payments:** Razorpay Android Checkout SDK (`com.razorpay:checkout`)
- **Local persistence:** Jetpack DataStore (Preferences) for session/user prefs
- **Logging:** Timber
- **Testing:** JUnit5, Turbine, MockK, Compose UI tests
- **Lint/Format:** ktlint + detekt

## 2. Backend Connection (REUSE my existing Supabase project)

Read these values from `local.properties` and expose via `BuildConfig`:

```
SUPABASE_URL=<paste from existing web .env>
SUPABASE_PUBLISHABLE_KEY=<paste from existing web .env>
GOOGLE_MAPS_API_KEY=<your Maps SDK for Android key>
RAZORPAY_KEY_ID=<existing Razorpay publishable key id>
```

Initialize Supabase client as a Hilt singleton. Use the **same** `user_roles` table and `has_role(uuid, app_role)` RPC the web app uses. Never embed the service role key. Never call admin endpoints from the client. All privileged work goes through the existing server functions / edge endpoints.

## 3. Database Schema (already exists — do not recreate)

Tables (already deployed, with RLS): `profiles`, `user_roles` (enum `app_role`: user/operator/admin), `stations`, `chargers` (note: `price_per_kwh` is nullable — render "N/A" when null), `bookings`, `payments`, `subscriptions`, `plans`, `vehicles`, `favorites`, `reviews`, `station_operators`, `helpline_messages`, `support_tickets`, `chat_messages`, `notifications`.

## 4. Auth & Roles

- Email/password sign-up + sign-in via Supabase Auth (Gotrue).
- Google sign-in via Supabase OAuth (Android OAuth client + SHA-1 registered in Google Cloud Console; deep link `com.<yourapp>://login-callback`).
- After session restore, read role from `user_roles` via `has_role()` RPC.
- Three role-based nav graphs:
  - **user** → full mobile UX
  - **operator** → scanner UX
  - **admin** → show a "Admin dashboard is available on web only" screen with a link to the web URL (matches existing `src/lib/platform.ts` behavior)
- Persist session via Supabase's built-in `SettingsSessionManager` backed by DataStore. Auto-refresh tokens. Sign-out clears DataStore.

## 5. Screens (mirror the web routes 1:1)

### User flow
1. **Splash** — restore session, route by role.
2. **Auth** — email/password tabs + Google button + forgot password.
3. **Dashboard / Home** — greeting, quick actions, nearby stations preview, active booking card.
4. **Station Map** (`/map`) — Google Maps with charger pins, city filter, "use my location" FAB, bottom sheet preview on pin tap.
5. **Station Details** (`/stations/:id`) — gallery, address, amenities, list of chargers showing connector type, power kW, status, and price. **If `price_per_kwh` is null, render the badge "N/A" instead of a number.**
6. **Booking Dialog** — pick vehicle, date, start time, duration (5/15/30/60 min). **Overlap guard (client-side preflight + server validation):** before submit, query the user's `bookings` for any row where the requested window overlaps an existing one. If overlap exists, block submit and show exactly: *"You already booked a slot from {start} to {end}. You can book another slot after {end}."* Do not change any other booking logic.
7. **My Bookings** (`/bookings`) — upcoming + past tabs, cancel action, receipt link.
8. **Vehicles** (`/vehicles`) — CRUD.
9. **Subscription** (`/subscription`) — list `plans`, current subscription, upgrade via Razorpay.
10. **Profile** (`/profile`) — edit name, phone, avatar (Supabase Storage).
11. **Helpline** (`/helpline`) — submit request, threaded messages.
12. **Chatbot** — call existing chat server route.
13. **Notifications** — list + mark read.

### Operator flow
1. **Operator Login** (`/operator/login`)
2. **Operator Home** (`/operator`) — assigned stations, today's bookings.
3. **Scan** (`/operator/scan`) — **Behavior must match the web exactly:** a "Scan Now" button opens a CameraX + ML Kit QR scanner overlay. On a successful scan the scanner closes, the scanned booking/charger is **appended** to a list below. Tapping "Scan Now" again opens the scanner again and appends the next result below the previous one. No auto-rescanning, no duplicate spam from a single open session — one tap = one scan = one appended row. Each row shows booking id, user, charger, time, status, and an action to verify/complete.

### Admin flow
- Single screen: "Admin dashboard is web-only. Open in browser." with the deep link.

## 6. Payments

Use Razorpay Android Checkout. Create the order by invoking the **existing** server function (same one the web uses) — do not re-implement order creation. Pass `key_id` from BuildConfig. Handle `PaymentResultListener` (success / error). Do **not** verify signatures on device — the existing public webhook (`/api/public/webhooks/razorpay`) is the source of truth; just poll the booking/payment row for status after checkout closes.

## 7. Permissions (AndroidManifest + runtime)

`INTERNET`, `ACCESS_NETWORK_STATE`, `CAMERA` (operator scan), `ACCESS_FINE_LOCATION` + `ACCESS_COARSE_LOCATION` (map), `POST_NOTIFICATIONS` (Android 13+). Request at point of use with a rationale dialog. Camera and Location are runtime-gated.

## 8. Design System

Match the web app's visual language:
- Material 3 with a custom `ColorScheme` derived from the web's primary/secondary tokens (pull the HSL/HEX from `src/styles.css`).
- Typography: Compose Material 3 type scale, headings slightly tighter.
- Rounded 16dp cards, soft elevation, 12dp content padding, 8-point spacing grid.
- Dark mode fully supported (system + manual toggle in Profile).
- Reusable Composables: `PrimaryButton`, `SecondaryButton`, `SectionCard`, `EmptyState`, `LoadingShimmer`, `ErrorState`, `ChargerBadge`, `PriceBadge` (renders "N/A" when null).

## 9. Project Structure

```text
app/
 ├─ build.gradle.kts
 └─ src/main/
     ├─ AndroidManifest.xml
     ├─ res/ (icons, splash, strings, themes, google_maps_api.xml)
     └─ java/com/<org>/evcharge/
         ├─ App.kt                 (Hilt @HiltAndroidApp)
         ├─ MainActivity.kt
         ├─ di/                    (SupabaseModule, NetworkModule, RepoModule)
         ├─ data/
         │   ├─ remote/            (SupabaseClient, DTOs, mappers)
         │   ├─ repo/              (AuthRepo, StationRepo, BookingRepo, VehicleRepo, PaymentRepo, OperatorRepo, HelplineRepo, ChatRepo, NotificationRepo)
         │   └─ local/             (DataStore prefs)
         ├─ domain/                (models, usecases: CheckBookingOverlapUseCase, CreateBookingUseCase, …)
         ├─ ui/
         │   ├─ theme/             (Color.kt, Type.kt, Theme.kt)
         │   ├─ components/
         │   ├─ auth/              (AuthScreen, AuthViewModel)
         │   ├─ user/
         │   │   ├─ home/  map/  stationDetails/  booking/  bookings/
         │   │   ├─ vehicles/  subscription/  profile/  helpline/  chatbot/  notifications/
         │   ├─ operator/          (login, home, scan)
         │   └─ admin/             (WebOnlyScreen)
         ├─ navigation/            (NavGraph.kt, Routes.kt, RoleGate.kt)
         └─ util/                  (Result, Flow extensions, date/time, formatters)
```

## 10. Deliverables

1. A complete Android Studio project that compiles and runs on an emulator (API 34) and a physical device.
2. `README.md` with: prerequisites, where to paste `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `GOOGLE_MAPS_API_KEY`, `RAZORPAY_KEY_ID`; how to add `google-services.json`; SHA-1 registration for Google sign-in; how to run debug/release.
3. Signed `app-release.apk` build instructions and a working `app-debug.apk`.
4. Working end-to-end flows verified:
   - Sign up → sign in → role routing
   - Browse map → open station → book a slot → Razorpay checkout → see booking confirmed via webhook
   - Overlap rule rejects a second concurrent booking with the exact required message
   - Operator: login → tap Scan Now → scan QR → row appended; tap Scan Now again → second row appended below
   - Admin user → sees "web only" screen
5. Unit tests for `CheckBookingOverlapUseCase` and repository mappers; one Compose UI test for the Scan screen append behavior.

## 11. Hard Constraints

- Do NOT introduce new tables, columns, RLS policies, or server functions.
- Do NOT bundle the service role key.
- Do NOT change the booking, payment, or scan business logic — only mirror it.
- Do NOT use deprecated libraries (no `LiveData`, no `findViewById`, no XML layouts for screens — Compose only; XML is allowed only for themes/splash).
- Do NOT add analytics, ads, or third-party SDKs beyond those listed.
- All network calls go through repositories; ViewModels never touch the Supabase client directly.
- All user-facing strings live in `strings.xml` (i18n-ready), English default.

Deliver the complete project now.

---

Tell me which parts to expand (Gradle files, exact dependency versions, sample ViewModels, OAuth deep-link setup, or a shorter "MVP" variant) and I'll extend the prompt.
