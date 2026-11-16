# Votefy

Votefy is a music community app built with React and TanStack Start. It uses Neon Postgres for songs, accounts, profiles, missions, and rooms.

## Run locally

Install dependencies with Bun or npm, then start the development server:

```sh
bun install
bun run dev
```

Set `DATABASE_URL` in a local environment file before using server features. Keep secrets out of browser code and Git.

## Deploy on Vercel

The GitHub repository is connected to Vercel. Push commits to `main` to trigger a production deployment; pull requests and other branches can create preview deployments according to the Vercel project settings.

Set `DATABASE_URL` in the Vercel project's Environment Variables for the production and preview environments that need the Neon database.
