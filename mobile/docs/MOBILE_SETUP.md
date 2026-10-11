# SAMETA mobile app: setup

The app is an Expo (SDK 57) React Native app that talks to the same Express API as the web app. It has **two modes**, which must not be confused:

| | **Live mode** (normal) | **Preview mode** (development only) |
|---|---|---|
| Needs | the API running, Supabase, a real login | nothing |
| Data | the real mill database | made-up sample data |
| Turn on | default | development bundle **and** `EXPO_PUBLIC_PREVIEW=1` |
| Release builds | the only mode | **cannot be switched on**: the preview code is not in a release bundle |
| Screen | normal | red "PREVIEW: sample data only" banner on every screen |

Preview signs nobody in and saves nothing. It is for looking at screens only.

## Prerequisites
- Node.js 20 or newer, and a phone (Android: USB debugging, or the Expo Go app) or an Android emulator.
- The backend running (see the root README): `cd server && npm run dev`. It listens on `0.0.0.0:4000` (`HOST` in `server/.env`), so a phone on the same Wi-Fi can reach it.
- Windows firewall: allow inbound TCP 4000 for Node on a **private** network.

## Configure
```bash
cd mobile
npm install                 # installs the versions in package-lock.json
copy .env.example .env      # (macOS/Linux: cp .env.example .env)
```
Fill **`mobile/.env`** (names only here; there are no defaults, and the app shows a "not set up yet" screen listing any missing one):

| Variable | Meaning |
|---|---|
| `EXPO_PUBLIC_API_URL` | the API's address **without** `/api/v1`, e.g. `http://<your-computer's-LAN-IP>:4000`. Never `localhost` on a phone |
| `EXPO_PUBLIC_SUPABASE_URL` | the same Supabase project as the server's `SUPABASE_URL` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | its **public** (publishable / anon) key. Never the service-role key |
| `EXPO_PUBLIC_PREVIEW` | optional, `1` = preview mode (development only) |

`EXPO_PUBLIC_*` values are compiled **into** the app and are readable by anyone who has it. Put nothing secret in them. Restart Expo after changing `.env`.

Find your computer's address with `ipconfig` (Windows, "IPv4 Address") or `ifconfig`. Check it from the phone's browser: `http://<ip>:4000/health` should answer `{"ok":true}`.

## Run
```bash
npm start                   # Expo dev server; scan the QR code with Expo Go, or press a for an Android emulator/USB phone
npm run check               # static check: every file parses, every import resolves and is exported
npm test                    # unit tests (token refresh, pending entries, attendance times, session storage)
npx expo-doctor             # dependency and config check
npx expo install --check    # are the packages the versions SDK 57 expects?
npx expo export --platform android   # does the JavaScript bundle build for Android?
```
USB phone: `adb devices` must list it, then `npm start` and press `a`.

## Sign-in requirements (live mode)
Signing in is **not** enough. The person must (1) have a Supabase account with email + password, (2) have a `profiles` row with a role (an owner invites them, or the seed created them), (3) be `active`. Otherwise the app says "Waiting for access" or "Account disabled" and shows no data. Roles decide the menu: see `src/navigation/menu.js`. The Employee role only has "My work" and requires the account to be linked to a worker record.

## Build an installable APK (not done in this repository's checks)
```bash
npx eas-cli@latest login
npx eas-cli@latest init            # once: writes the real project id into app config
npx eas-cli@latest build -p android --profile preview
```
`eas.json` has `development`, `preview` (APK) and `production` profiles. Environment values for a cloud build are set in EAS, not read from `mobile/.env`.

## Common problems
- **"SAMETA is not set up yet"**: one of the variables above is empty. Fix `.env`, restart Expo.
- **"Cannot reach the server"**: wrong address, phone on a different network, firewall, or the server is not running. Test `http://<ip>:4000/health` in the phone's browser.
- **"Waiting for access"**: the account has no role yet.
- **Camera does not open**: allow the camera in the phone's settings; the roll number can always be typed instead.
- **adb not found**: add Android SDK `platform-tools` to PATH.
