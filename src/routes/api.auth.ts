import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as {
            action?: "login" | "register";
            username?: string;
            password?: string;
            confirmPassword?: string;
          };

          const { loginUser, registerUser } = await import("@/lib/neon-database.server");

          if (body.action === "register") {
            const user = await registerUser(
              body.username ?? "",
              body.password ?? "",
              body.confirmPassword ?? ""
            );
            return Response.json(user, { status: 201 });
          }

          if (body.action === "login") {
            const user = await loginUser(body.username ?? "", body.password ?? "");
            return Response.json(user);
          }

          return Response.json({ error: "Ação inválida." }, { status: 400 });
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : "Erro ao autenticar." },
            { status: 400 }
          );
        }
      },
    },
  },
});
