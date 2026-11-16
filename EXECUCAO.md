# Execução do Votefy

## Desenvolvimento local

Instale Bun ou Node.js. Na pasta do projeto, execute:

```sh
bun install
bun run dev
```

Configure `DATABASE_URL` no ambiente local para ativar cadastro, login, perfis e os recursos conectados ao Neon.

## Publicação

O projeto é publicado pela Vercel a partir do repositório GitHub. Um push para `main` inicia o deploy de produção. Configure `DATABASE_URL` em **Vercel → Project Settings → Environment Variables** para os ambientes necessários.
