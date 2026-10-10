# Sameta frontend

React 18 + Vite single-page app for Sameta. See the [main README](../README.md) for the full setup, architecture and environment variables.

## Run

```bash
cp .env.example .env.local   # set VITE_API_URL, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
npm install
npm run dev                  # http://localhost:5173
```

Requires Node 22.12+. Only the public Supabase anon key belongs here; the service role key stays on the server.

## Structure

- `src/main.jsx`: routes. `/invite/staff/:token` and `/track/:token` are public; everything under `/app` needs a signed-in staff member.
- `src/context/Session.jsx`: Supabase session, then `GET /me/access` for the mill, role and permissions.
- `src/layouts/AppLayout.jsx`: office layout with the sidebar navigation, filtered by permission. `FloorLayout.jsx` is the tablet layout for floor roles.
- `src/features/`: one component per screen.
- `src/lib/api.js`: fetch wrapper for `/api/v1` with the token, a 15 s timeout and a typed `ApiError`.

## Checks

```bash
npm test
npm run build
```

## Deploy (Vercel)

Root `client`, build `npm run build`, output `dist`. `vercel.json` rewrites every route to `index.html`. Set the three `VITE_*` variables, and set the server's `CLIENT_URL` to the deployed origin.
