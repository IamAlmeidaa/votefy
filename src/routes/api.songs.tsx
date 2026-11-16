import { createFileRoute } from "@tanstack/react-router";

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
          const body = (await request.json()) as {
            action?: string;
            id?: number | string;
            mediaUrl?: string;
            title?: string;
          };

          const { createSong, incrementSongVote } = await import(
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

          const newSong = await createSong(body.mediaUrl.trim(), body.title);
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