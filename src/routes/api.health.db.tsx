import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/health/db")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { checkNeonDatabase } = await import("@/lib/neon-database.server");
          return Response.json(await checkNeonDatabase());
        } catch (error) {
          console.error("Falha na verificação do banco de dados:", error);
          return Response.json({ error: "Serviço de banco indisponível." }, { status: 503 });
        }
      },
    },
  },
});
