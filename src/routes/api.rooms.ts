import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/rooms")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const roomId = url.searchParams.get("roomId");
          const userId = url.searchParams.get("userId") ?? undefined;

          const { getRoomSnapshot, listActiveRooms } = await import("@/lib/neon-database.server");

          if (roomId) {
            const room = await getRoomSnapshot(roomId, userId, true);
            if (!room) {
              return Response.json({ error: "Sala não encontrada." }, { status: 404 });
            }
            return Response.json(room);
          }

          const rooms = await listActiveRooms(userId);
          return Response.json(rooms);
        } catch (error) {
          console.error("Erro em GET /api/rooms:", error);
          return Response.json(
            { error: error instanceof Error ? error.message : "Erro ao buscar salas." },
            { status: 500 }
          );
        }
      },

      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as {
            action?: string;
            roomId?: string;
            userId?: string;
            targetUserId?: string;
            name?: string;
            userName?: string;
            trackId?: string;
            isGolden?: boolean;
            text?: string;
            patch?: {
              open?: boolean;
              rerollOptions?: boolean;
              clearVotes?: boolean;
              addToQueue?: string;
              removeFromQueueIndex?: number;
            };
          };

          const db = await import("@/lib/neon-database.server");

          switch (body.action) {
            case "create": {
              if (!body.name?.trim() || !body.userId || !body.userName?.trim()) {
                return Response.json({ error: "Nome da sala e do host são obrigatórios." }, { status: 400 });
              }
              const room = await db.createMusicRoom(body.name, body.userId, body.userName);
              return Response.json(room, { status: 201 });
            }

            case "join": {
              if (!body.roomId?.trim() || !body.userId || !body.userName?.trim()) {
                return Response.json({ error: "Código da sala e seu nome são obrigatórios." }, { status: 400 });
              }
              const room = await db.joinMusicRoom(body.roomId, body.userId, body.userName);
              return Response.json(room);
            }

            case "vote": {
              if (!body.roomId || !body.userId || !body.trackId) {
                return Response.json({ error: "Dados de voto inválidos." }, { status: 400 });
              }
              const room = await db.castRoomVote(body.roomId, body.userId, body.trackId, Boolean(body.isGolden));
              return Response.json(room);
            }

            case "skipVote": {
              if (!body.roomId || !body.userId) {
                return Response.json({ error: "Dados de skip inválidos." }, { status: 400 });
              }
              const result = await db.voteSkipRoomTrack(body.roomId, body.userId);
              return Response.json(result);
            }

            case "next": {
              if (!body.roomId) {
                return Response.json({ error: "ID da sala obrigatório." }, { status: 400 });
              }
              const room = await db.advanceRoomTrack(body.roomId, body.trackId);
              return Response.json(room);
            }

            case "controls": {
              if (!body.roomId || !body.patch) {
                return Response.json({ error: "Dados de controle inválidos." }, { status: 400 });
              }
              const room = await db.updateRoomControls(body.roomId, body.patch);
              return Response.json(room);
            }

            case "chat": {
              if (!body.roomId || !body.userId || !body.text) {
                return Response.json({ error: "Mensagem inválida." }, { status: 400 });
              }
              const room = await db.sendRoomChatMessage(body.roomId, body.userId, body.text);
              return Response.json(room);
            }

            case "leave": {
              if (!body.roomId || !body.userId) {
                return Response.json({ error: "Dados inválidos." }, { status: 400 });
              }
              await db.leaveOrRemoveFromRoom(body.roomId, body.targetUserId ?? body.userId);
              return Response.json({ ok: true });
            }

            case "close": {
              if (!body.roomId || !body.userId) {
                return Response.json({ error: "Dados inválidos." }, { status: 400 });
              }
              await db.closeMusicRoom(body.roomId, body.userId);
              return Response.json({ ok: true });
            }

            default:
              return Response.json({ error: "Ação desconhecida." }, { status: 400 });
          }
        } catch (error) {
          console.error("Erro em POST /api/rooms:", error);
          return Response.json(
            { error: error instanceof Error ? error.message : "Erro ao processar ação da sala." },
            { status: 400 }
          );
        }
      },
    },
  },
});