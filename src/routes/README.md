# Routes

TanStack Start uses **file-based routing**. Every `.tsx` file in this directory
defines a route. Do **not** create `src/pages/`, `src/routes/_app/index.tsx`, or
`app/layout.tsx` — those are Next.js / Remix conventions. The only root layout
is `src/routes/__root.tsx`.

## Conventions

| File | URL |
| --- | --- |
| `index.tsx` | `/` |
| `about.tsx` | `/about` |
| `users/index.tsx` | `/users` |
| `users/$id.tsx` | `/users/:id` (dynamic — bare `$`, no curly braces) |
| `posts/{-$category}.tsx` | `/posts/:category?` (optional segment) |
| `files/$.tsx` | `/files/*` (splat — read via `_splat` param, never `*`) |
| `_layout.tsx` | layout route (renders children via `<Outlet />`) |
| `__root.tsx` | app shell — wraps every page; preserve `<Outlet />` |

`routeTree.gen.ts` is auto-generated. Don't edit it by hand.

## Founder / admin access

1. Log in normally at `/login` with the founder account.
2. Go to `/admin` — it redirects to `/admin/dashboard`. Once the account holds
   the `admin` role, the account menu also shows a **Founder dashboard** link.
3. Access is enforced in the database, not the UI: every dashboard RPC
   (`admin_dashboard_kpis`, `_trends`, `_breakdowns`) re-checks
   `is_platform_admin(auth.uid())` and refuses everyone else. The nav link and
   the `useIsPlatformAdmin` hook are convenience only.
4. Admin paths are `noindex` and excluded from `robots.txt` and the sitemap.
