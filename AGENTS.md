# Project instructions

- This app uses React, TanStack Start, and Vite. Keep the root music provider mounted so playback survives route navigation.
- Neon Postgres is accessed from server-only modules. Read `DATABASE_URL` from the server environment and never expose it through client-side `VITE_` variables.
- Vercel is the production deployment target. The repository is connected to Vercel through GitHub; pushes to `main` trigger production deployments.
- Do not hand-edit generated route-tree files.
- Keep personal media uploads scoped to the authenticated account and validate file type and size on the server.
