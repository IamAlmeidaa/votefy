import { createFileRoute } from "@tanstack/react-router";

function readSessionCookie(cookieHeader: string | null): string | null {
  const value = cookieHeader?.split(";").map(part => part.trim()).find(part => part.startsWith("votefy_session="))?.slice("votefy_session=".length);
  if (!value) return null;
  try { return decodeURIComponent(value); } catch { return null; }
}

export const Route = createFileRoute("/api/songs")({
  server: {
    handlers: {
      // Lista todas as músicas salvas na Neon
      GET: async () => {
        try {
          const { listSongs } = await import("@/lib/neon-database.server");
          const songs = await listSongs();
          return Response.json(songs);
        } catch (error) {
          console.error("Erro ao listar músicas:", error);
          return Response.json(
            { error: "Erro ao buscar músicas no banco de dados." },
            { status: 500 }
          );
        }
      },

      // Salva uma nova música ou registra um voto
      POST: async ({ request }) => {
        try {
          const origin = request.headers.get("origin");
          if (!origin || origin !== new URL(request.url).origin) return Response.json({ error: "SolicitaÃ§Ã£o invÃ¡lida." }, { status: 403 });
          const body = (await request.json()) as {
            action?: string;
            id?: number | string;
            mediaUrl?: string;
            title?: string;
          };

          const { createSong, incrementSongVote, getAuthSession, recordSongMissionProgress } = await import(
            "@/lib/neon-database.server"
          );

          // Caso seja um voto numa música existente
          if (body.action === "vote" && body.id) {
            const updated = await incrementSongVote(Number(body.id));
            return Response.json(updated);
          }

          // Caso seja o cadastro de uma nova música por link
          if (!body.mediaUrl || !body.mediaUrl.trim()) {
            return Response.json(
              { error: "O link da música é obrigatório." },
              { status: 400 }
            );
          }

          const user = await getAuthSession(readSessionCookie(request.headers.get("cookie")));
          if (!user) {
            return Response.json(
              { error: "Entre na sua conta para adicionar músicas." },
              { status: 401 }
            );
          }
          const newSong = await createSong(body.mediaUrl.trim(), body.title);
          await recordSongMissionProgress(user.id);
          return Response.json(newSong, { status: 201 });
        } catch (error) {
          console.error("Erro ao processar requisição em /api/songs:", error);
          return Response.json(
            { error: "Falha ao salvar a música." },
            { status: 500 }
          );
        }
      },
    },
  },
});
