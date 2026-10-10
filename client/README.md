# Sameta frontend

Member B foundation: React/Vite/JavaScript with Ant Design, Tailwind utilities, Router and TanStack Query. See `../docs/04_HACKATHON_DELIVERY.md` for team scope and `../docs/05_FRONTEND_CONTRACT.md` for required API response shapes.

## Run

1. Use Node 22.12 or newer; `npm ci` in this directory after the lockfile exists.
2. Copy `.env.example` to `.env.local`; set your public Supabase URL/anon key and API origin. Never use a service role key in frontend variables.
3. `npm run dev` then open http://localhost:5173.
4. `npm test` and `npm run build` for local verification.

Without credentials the application displays setup instructions. With credentials it uses Supabase sign-in and live backend requests. There is no fake data fallback. Backend must implement the documented endpoints and seed a manufacturer membership, permissions, buyer contacts and items before the workflow can be exercised.

## Delivered screens

Login, organization switching, permission gates, responsive shell, order search/filter/pagination, draft order form, order detail/confirm, paginated stock with low-stock highlights, machine board polling. Query keys isolate user/organization and requests capture the tenant header explicitly. Unauthorized HTTP responses are displayed; server permissions remain authoritative.

## Remaining work

DB/API integration and persistence proof; receipt entry, production mutation, QC, dispatch, costing/finance, buyer portal and deployment. This frontend alone does not satisfy the full project acceptance criteria. QR, charts, realtime sockets and AI are deferred until their core screens exist.

Vercel: root `client`, build `npm run build`, output `dist`; SPA rewrite included. Set API/Supabase environment variables and backend CORS/auth redirect URLs to deployed origins.
