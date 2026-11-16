import { createFileRoute } from "@tanstack/react-router";

function readSessionCookie(cookieHeader: string | null): string | null {
  const value = cookieHeader
    ?.split(";")
    .map(part => part.trim())
    .find(part => part.startsWith("votefy_session="))
    ?.slice("votefy_session=".length);
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/api/rooms")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const roomId = url.searchParams.get("roomId");
          const { getRoomSnapshot, listActiveRooms } = await import("@/lib/neon-database.server");
          const { getAuthSession } = await import("@/lib/neon-database.server");
          const authenticatedUser = await getAuthSession(readSessionCookie(request.headers.get("cookie")));
          const userId = authenticatedUser?.id ?? url.searchParams.get("userId") ?? undefined;

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
            { error: "Erro ao buscar salas." },
            { status: 500 }
          );
        }
      },

      POST: async ({ request }) => {
        try {
          const origin = request.headers.get("origin");
          if (!origin || origin !== new URL(request.url).origin) {
            return Response.json({ error: "Solicitação inválida." }, { status: 403 });
          }
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
          const authenticatedUser = await db.getAuthSession(readSessionCookie(request.headers.get("cookie")));
          // A valid account cookie takes precedence over browser-supplied identity values.
          const userId = authenticatedUser?.id ?? body.userId;
          const userName = authenticatedUser?.username ?? body.userName;

          switch (body.action) {
            case "create": {
              if (!body.name?.trim() || !userId || !userName?.trim()) {
                return Response.json({ error: "Nome da sala e do host são obrigatórios." }, { status: 400 });
              }
              const room = await db.createMusicRoom(body.name, userId, userName);
              return Response.json(room, { status: 201 });
            }

            case "join": {
              if (!body.roomId?.trim() || !userId || !userName?.trim()) {
                return Response.json({ error: "Código da sala e seu nome são obrigatórios." }, { status: 400 });
              }
              const room = await db.joinMusicRoom(body.roomId, userId, userName);
              return Response.json(room);
            }

            case "vote": {
              if (!body.roomId || !userId || !body.trackId) {
                return Response.json({ error: "Dados de voto inválidos." }, { status: 400 });
              }
              const room = await db.castRoomVote(body.roomId, userId, body.trackId, Boolean(body.isGolden));
              return Response.json(room);
            }

            case "skipVote": {
              if (!body.roomId || !userId) {
                return Response.json({ error: "Dados de skip inválidos." }, { status: 400 });
              }
              const result = await db.voteSkipRoomTrack(body.roomId, userId);
              return Response.json(result);
            }

            case "next": {
              if (!body.roomId || !userId) {
                return Response.json({ error: "ID da sala obrigatório." }, { status: 400 });
              }
              const currentRoom = await db.getRoomSnapshot(body.roomId, userId, false);
              if (!currentRoom || currentRoom.admin !== userId) {
                return Response.json({ error: "Somente o host pode avançar a música." }, { status: 403 });
              }
              const updatedRoom = await db.advanceRoomTrack(body.roomId, body.trackId);
              return Response.json(updatedRoom);
            }

            case "controls": {
              if (!body.roomId || !body.patch || !userId) {
                return Response.json({ error: "Dados de controle inválidos." }, { status: 400 });
              }
              const currentRoom = await db.getRoomSnapshot(body.roomId, userId, false);
              if (!currentRoom || currentRoom.admin !== userId) {
                return Response.json({ error: "Somente o host pode alterar os controles." }, { status: 403 });
              }
              const updatedRoom = await db.updateRoomControls(body.roomId, body.patch);
              return Response.json(updatedRoom);
            }

            case "chat": {
              if (!body.roomId || !userId || !body.text) {
                return Response.json({ error: "Mensagem inválida." }, { status: 400 });
              }
              const room = await db.sendRoomChatMessage(body.roomId, userId, body.text);
              return Response.json(room);
            }

            case "leave": {
              if (!body.roomId || !userId) {
                return Response.json({ error: "Dados inválidos." }, { status: 400 });
              }
              const room = await db.getRoomSnapshot(body.roomId, userId, false);
              if (!room || (body.targetUserId && room.admin !== userId && body.targetUserId !== userId)) {
                return Response.json({ error: "Ação não permitida." }, { status: 403 });
              }
              await db.leaveOrRemoveFromRoom(body.roomId, body.targetUserId ?? userId);
              return Response.json({ ok: true });
            }

            case "close": {
              if (!body.roomId || !userId) {
                return Response.json({ error: "Dados inválidos." }, { status: 400 });
              }
              await db.closeMusicRoom(body.roomId, userId);
              return Response.json({ ok: true });
            }

            default:
              return Response.json({ error: "Ação desconhecida." }, { status: 400 });
          }
        } catch (error) {
          console.error("Erro em POST /api/rooms:", error);
          return Response.json(
            { error: "Erro ao processar a ação da sala." },
            { status: 400 }
          );
        }
      },
    },
  },
});
