import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/health/db")({
  server: {
    handlers: {
      GET: async () => {
        const { checkNeonDatabase } = await import("@/lib/neon-database.server");
        return Response.json(await checkNeonDatabase());
      },
    },
  },
});
