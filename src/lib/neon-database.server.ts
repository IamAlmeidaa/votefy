import { env } from "node:process";
import { Buffer } from "node:buffer";
import { neon } from "@neondatabase/serverless";
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { promisify } from "node:util";
import type { Room, RoomVote } from "@/lib/music";

export async function checkNeonDatabase() {
  const databaseUrl = env["DATABASE_URL"];
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }

  const sql = neon(databaseUrl);
  const [result] = await sql`SELECT 1 AS connected`;
  if (result?.["connected"] !== 1) {
    throw new Error("Neon Postgres connectivity check returned an unexpected result");
  }

  return { status: "ok", service: "postgres" };
}

export interface SongRecord {
  id: number;
  title: string;
  artist: string;
  media_url: string;
  youtube_id: string | null;
  cover_url: string | null;
  votes: number;
  created_at: string;
}

function getDb() {
  const url = env["DATABASE_URL"] ?? process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL não encontrada no .env.local");
  return neon(url);
}

function extractYouTubeId(url: string): string | null {
  if (url.startsWith("data:")) return null;
  const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  const match = url.match(regex);
  return match?.[1] ?? null;
}

export async function listSongs(): Promise<SongRecord[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT * FROM songs
    ORDER BY votes DESC, created_at DESC
  `;
  return rows as SongRecord[];
}

export async function createSong(
  mediaUrl: string,
  customTitle?: string,
  customArtist?: string,
  customCoverUrl?: string
): Promise<SongRecord> {
  const sql = getDb();
  const youtubeId = extractYouTubeId(mediaUrl);

  let title = customTitle?.trim() || "Música da Comunidade";
  let artist = customArtist?.trim() || "Votefy";
  let coverUrl = customCoverUrl?.trim() || "/music-cover.jpg";

  if (youtubeId) {
    coverUrl = `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`;
    try {
      const res = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${youtubeId}`);
      const meta = (await res.json()) as { title?: string; author_name?: string };
      if (!customTitle && meta.title) title = meta.title;
      if (!customArtist && meta.author_name) artist = meta.author_name;
    } catch {
      // Mantém padrão
    }
  } else {
    try {
      const spotifyUrl = new URL(mediaUrl);
      if (spotifyUrl.protocol === "https:" && spotifyUrl.hostname === "open.spotify.com" && /\/(track|album|playlist|episode|show)\/[^/]+/.test(spotifyUrl.pathname)) {
        const response = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyUrl.toString())}`, { signal: AbortSignal.timeout(4000) });
        if (response.ok) {
          const metadata = (await response.json()) as { title?: string; thumbnail_url?: string };
          if (!customTitle && metadata.title) title = metadata.title;
          if (metadata.thumbnail_url && new URL(metadata.thumbnail_url).hostname === "i.scdn.co") coverUrl = metadata.thumbnail_url;
        }
      }
    } catch {
      // Links externos continuam salvos mesmo se a prévia não estiver disponível.
    }
  }

  const rows = await sql`
    INSERT INTO songs (title, artist, media_url, youtube_id, cover_url)
    VALUES (${title}, ${artist}, ${mediaUrl}, ${youtubeId}, ${coverUrl})
    RETURNING *
  `;

  return rows[0] as SongRecord;
}

export async function incrementSongVote(songId: number): Promise<SongRecord> {
  const sql = getDb();
  const rows = await sql`
    UPDATE songs
    SET votes = votes + 1
    WHERE id = ${songId}
    RETURNING *
  `;
  return rows[0] as SongRecord;
}

// ============================================================================
// SALAS MUSICAIS (NEON POSTGRES + AUTO-LIMPEZA + SKIP 2/3 + VOTO DE OURO 3X)
// ============================================================================

let roomsSchemaPromise: Promise<void> | null = null;

async function ensureRoomsSchema() {
  if (!roomsSchemaPromise) {
    roomsSchemaPromise = (async () => {
      const sql = getDb();
      await sql`
        CREATE TABLE IF NOT EXISTS rooms (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          host_id TEXT NOT NULL,
          current_track_id TEXT,
          options JSONB NOT NULL DEFAULT '[]'::jsonb,
          voting_open BOOLEAN NOT NULL DEFAULT TRUE,
          queue JSONB NOT NULL DEFAULT '[]'::jsonb,
          history JSONB NOT NULL DEFAULT '[]'::jsonb,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS room_participants (
          room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'guest',
          golden_used BOOLEAN NOT NULL DEFAULT FALSE,
          last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (room_id, user_id)
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS room_votes (
          room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL,
          track_id TEXT NOT NULL,
          weight INT NOT NULL DEFAULT 1 CHECK (weight IN (1, 3)),
          PRIMARY KEY (room_id, user_id)
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS room_skip_votes (
          room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
          track_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          PRIMARY KEY (room_id, track_id, user_id)
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS room_chat (
          id SERIAL PRIMARY KEY,
          room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL,
          user_name TEXT NOT NULL,
          text TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
    })().catch(err => {
      roomsSchemaPromise = null;
      throw err;
    });
  }
  await roomsSchemaPromise;
}

async function cleanupStaleRooms() {
  const sql = getDb();
  // Remove usuários que fecharam o navegador/aba há mais de 40 segundos
  await sql`
    DELETE FROM room_participants
    WHERE last_seen_at < NOW() - INTERVAL '40 seconds'
  `;
  // Apaga salas que ficaram vazias (sem nenhum participante conectado)
  await sql`
    DELETE FROM rooms
    WHERE created_at < NOW() - INTERVAL '15 seconds'
      AND NOT EXISTS (
        SELECT 1 FROM room_participants rp WHERE rp.room_id = rooms.id
      )
  `;
}

function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)] ?? "X";
  }
  return code;
}

function pickCandidates(allSongIds: string[], excludeId?: string | null): string[] {
  const pool = [...new Set(allSongIds)].filter(id => id !== excludeId);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = pool[i];
    const b = pool[j];
    if (a !== undefined && b !== undefined) {
      pool[i] = b;
      pool[j] = a;
    }
  }
  return pool.slice(0, 4);
}

function parseJsonArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export async function listActiveRooms(userId?: string): Promise<Room[]> {
  await ensureRoomsSchema();
  await cleanupStaleRooms();
  const sql = getDb();
  const roomRows = await sql`
    SELECT id FROM rooms
    WHERE is_active = TRUE
    ORDER BY created_at DESC
  `;
  const rooms: Room[] = [];
  for (const row of roomRows) {
    const roomId = String(row["id"]);
    const full = await getRoomSnapshot(roomId, userId, false);
    if (full) rooms.push(full);
  }
  return rooms;
}

export async function getRoomSnapshot(
  rawRoomId: string,
  userId?: string,
  touchHeartbeat = true
): Promise<Room | null> {
  await ensureRoomsSchema();
  const sql = getDb();
  const roomId = rawRoomId.trim().toUpperCase();

  if (touchHeartbeat && userId) {
    await sql`
      UPDATE room_participants
      SET last_seen_at = NOW()
      WHERE room_id = ${roomId} AND user_id = ${userId}
    `;
  }

  await cleanupStaleRooms();

  const roomRows = await sql`
    SELECT * FROM rooms
    WHERE id = ${roomId} AND is_active = TRUE
    LIMIT 1
  `;
  const row = roomRows[0];
  if (!row) return null;

  const participantRows = await sql`
    SELECT user_id, name, role, golden_used
    FROM room_participants
    WHERE room_id = ${roomId}
    ORDER BY (role = 'host') DESC, name ASC
  `;

  if (participantRows.length === 0) {
    await sql`DELETE FROM rooms WHERE id = ${roomId}`;
    return null;
  }

  const activeCount = participantRows.length;

  const voteRows = await sql`
    SELECT user_id, track_id, weight
    FROM room_votes
    WHERE room_id = ${roomId}
  `;
  const votes: Record<string, RoomVote> = {};
  for (const v of voteRows) {
    votes[String(v["user_id"])] = {
      track: String(v["track_id"]),
      weight: Number(v["weight"]) || 1,
    };
  }

  const currentTrackId = row["current_track_id"] ? String(row["current_track_id"]) : undefined;

  let skipVotes: string[] = [];
  if (currentTrackId) {
    const skipRows = await sql`
      SELECT sv.user_id
      FROM room_skip_votes sv
      JOIN room_participants rp
        ON rp.room_id = sv.room_id AND rp.user_id = sv.user_id
      WHERE sv.room_id = ${roomId}
        AND sv.track_id = ${currentTrackId}
    `;
    skipVotes = skipRows.map(s => String(s["user_id"]));
  }

  const skipCount = skipVotes.length;
  // Maioria qualificada (~70% / 2/3): 1/1, 2/2, 2/3, 3/4, 4/5, 7/10
  const skipRequired = Math.max(1, Math.ceil(activeCount * 0.66));
  const skipPercentage = activeCount > 0 ? Math.min(100, Math.round((skipCount / activeCount) * 100)) : 0;

  const chatRows = await sql`
    SELECT user_name, text
    FROM room_chat
    WHERE room_id = ${roomId}
    ORDER BY id DESC
    LIMIT 60
  `;

  return {
    id: roomId,
    name: String(row["name"]),
    admin: String(row["host_id"]),
    active: String(row["host_id"]),
    participants: participantRows.map(p => ({
      id: String(p["user_id"]),
      name: String(p["name"]),
      role: String(p["role"]) === "host" ? "host" : "guest",
      goldenUsed: Boolean(p["golden_used"]),
    })),
    activeCount,
    current: currentTrackId,
    options: parseJsonArray<string>(row["options"]),
    votes,
    open: Boolean(row["voting_open"]),
    queue: parseJsonArray<string>(row["queue"]),
    history: parseJsonArray<{ track: string; votes: number }>(row["history"]),
    chat: chatRows.reverse().map(c => ({
      name: String(c["user_name"]),
      text: String(c["text"]),
    })),
    skipVotes,
    skipCount,
    skipRequired,
    skipPercentage,
  };
}

export async function createMusicRoom(name: string, hostId: string, hostName: string): Promise<Room> {
  await ensureRoomsSchema();
  const sql = getDb();

  let roomId = generateRoomCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await sql`SELECT id FROM rooms WHERE id = ${roomId}`;
    if (existing.length === 0) break;
    roomId = generateRoomCode();
  }

  const songRows = await sql`SELECT id FROM songs ORDER BY created_at DESC`;
  const allSongIds = songRows.map(s => String(s["id"]));
  const initialOptions = pickCandidates(allSongIds);

  await sql`
    INSERT INTO rooms (id, name, host_id, options, voting_open)
    VALUES (${roomId}, ${name.trim().slice(0, 70)}, ${hostId}, ${JSON.stringify(initialOptions)}::jsonb, TRUE)
  `;

  await sql`
    INSERT INTO room_participants (room_id, user_id, name, role, golden_used, last_seen_at)
    VALUES (${roomId}, ${hostId}, ${hostName.trim().slice(0, 40) || "Host"}, 'host', FALSE, NOW())
  `;

  const created = await getRoomSnapshot(roomId, hostId, false);
  if (!created) throw new Error("Falha ao criar a sala.");
  return created;
}

export async function joinMusicRoom(rawCode: string, userId: string, userName: string): Promise<Room> {
  await ensureRoomsSchema();
  const sql = getDb();

  const cleaned = rawCode.trim().replace(/\/+$/, "");
  const lastSegment = cleaned.split("/").pop() ?? cleaned;
  const roomId = lastSegment.toUpperCase();

  const roomRows = await sql`
    SELECT id, host_id FROM rooms
    WHERE id = ${roomId} AND is_active = TRUE
    LIMIT 1
  `;
  const roomRow = roomRows[0];
  if (!roomRow) {
    throw new Error("Sala não encontrada ou já encerrada. Confira o código.");
  }

  const role = String(roomRow["host_id"]) === userId ? "host" : "guest";

  await sql`
    INSERT INTO room_participants (room_id, user_id, name, role, golden_used, last_seen_at)
    VALUES (${roomId}, ${userId}, ${userName.trim().slice(0, 40) || "Convidado"}, ${role}, FALSE, NOW())
    ON CONFLICT (room_id, user_id)
    DO UPDATE SET
      name = EXCLUDED.name,
      last_seen_at = NOW()
  `;

  const room = await getRoomSnapshot(roomId, userId, false);
  if (!room) throw new Error("Não foi possível carregar a sala.");
  return room;
}

export async function castRoomVote(
  rawRoomId: string,
  userId: string,
  trackId: string,
  isGolden: boolean
): Promise<Room> {
  await ensureRoomsSchema();
  const sql = getDb();
  const roomId = rawRoomId.trim().toUpperCase();

  const room = await getRoomSnapshot(roomId, userId, true);
  if (!room) throw new Error("Sala não encontrada.");
  if (!room.open) throw new Error("A votação desta rodada já foi encerrada.");
  if (!room.options.includes(trackId)) throw new Error("Esta música não está nas opções da rodada.");

  const participantRows = await sql`
    SELECT golden_used FROM room_participants
    WHERE room_id = ${roomId} AND user_id = ${userId}
    LIMIT 1
  `;
  const participant = participantRows[0];
  if (!participant) throw new Error("Entre na sala antes de votar.");

  const existingVote = room.votes[userId];

  if (isGolden) {
    if (Boolean(participant["golden_used"])) {
      throw new Error("Você já usou seu Voto de Ouro nesta sala.");
    }
    const updated = await sql`
      UPDATE room_participants
      SET golden_used = TRUE, last_seen_at = NOW()
      WHERE room_id = ${roomId} AND user_id = ${userId} AND golden_used = FALSE
      RETURNING user_id
    `;
    if (updated.length === 0) {
      throw new Error("Você já usou seu Voto de Ouro nesta sala.");
    }

    await sql`
      INSERT INTO room_votes (room_id, user_id, track_id, weight)
      VALUES (${roomId}, ${userId}, ${trackId}, 3)
      ON CONFLICT (room_id, user_id)
      DO UPDATE SET track_id = EXCLUDED.track_id, weight = 3
    `;
  } else {
    if (existingVote?.weight === 3) {
      throw new Error("Seu Voto de Ouro (+3) já está aplicado nesta rodada.");
    }
    await sql`
      INSERT INTO room_votes (room_id, user_id, track_id, weight)
      VALUES (${roomId}, ${userId}, ${trackId}, 1)
      ON CONFLICT (room_id, user_id)
      DO UPDATE SET track_id = EXCLUDED.track_id, weight = 1
    `;
  }

  const next = await getRoomSnapshot(roomId, userId, false);
  if (!next) throw new Error("Sala não encontrada.");
  return next;
}

export async function voteSkipRoomTrack(
  rawRoomId: string,
  userId: string
): Promise<{ room: Room; skipped: boolean }> {
  await ensureRoomsSchema();
  const sql = getDb();
  const roomId = rawRoomId.trim().toUpperCase();

  const room = await getRoomSnapshot(roomId, userId, true);
  if (!room) throw new Error("Sala não encontrada.");
  if (!room.current) throw new Error("Nenhuma música tocando no momento.");

  const alreadyVoted = room.skipVotes.includes(userId);
  if (alreadyVoted) {
    await sql`
      DELETE FROM room_skip_votes
      WHERE room_id = ${roomId} AND track_id = ${room.current} AND user_id = ${userId}
    `;
  } else {
    await sql`
      INSERT INTO room_skip_votes (room_id, track_id, user_id)
      VALUES (${roomId}, ${room.current}, ${userId})
      ON CONFLICT DO NOTHING
    `;
  }

  const refreshed = await getRoomSnapshot(roomId, userId, false);
  if (!refreshed) throw new Error("Sala não encontrada.");

  if (refreshed.skipCount >= refreshed.skipRequired && refreshed.skipCount > 0) {
    const advanced = await advanceRoomTrack(roomId);
    return { room: advanced, skipped: true };
  }

  return { room: refreshed, skipped: false };
}

export async function advanceRoomTrack(rawRoomId: string, manualTrackId?: string): Promise<Room> {
  await ensureRoomsSchema();
  const sql = getDb();
  const roomId = rawRoomId.trim().toUpperCase();

  const room = await getRoomSnapshot(roomId, undefined, false);
  if (!room) throw new Error("Sala não encontrada.");

  const songRows = await sql`SELECT id FROM songs ORDER BY created_at DESC`;
  const allSongIds = songRows.map(s => String(s["id"]));

  let nextTrackId = manualTrackId;

  if (!nextTrackId && room.queue.length > 0) {
    nextTrackId = room.queue.find(id => allSongIds.includes(id));
  }

  if (!nextTrackId) {
    const validOptions = room.options.filter(id => allSongIds.includes(id) && id !== room.current);
    if (validOptions.length > 0) {
      const scores = validOptions.map(id =>
        Object.values(room.votes)
          .filter(v => v.track === id)
          .reduce((sum, v) => sum + v.weight, 0)
      );
      const highest = Math.max(0, ...scores);
      const top = validOptions.filter((_, idx) => scores[idx] === highest);
      nextTrackId = top[Math.floor(Math.random() * top.length)];
    } else {
      nextTrackId = allSongIds.find(id => id !== room.current) ?? allSongIds[0];
    }
  }

  if (!nextTrackId) {
    throw new Error("Adicione músicas na biblioteca antes de iniciar.");
  }

  const winningVotes = Object.values(room.votes)
    .filter(v => v.track === nextTrackId)
    .reduce((sum, v) => sum + v.weight, 0);

  const nextHistory = [...room.history, { track: nextTrackId, votes: winningVotes }].slice(-30);
  const nextQueue = room.queue.filter(id => id !== nextTrackId);
  const nextOptions = pickCandidates(allSongIds, nextTrackId);

  await sql`DELETE FROM room_votes WHERE room_id = ${roomId}`;
  await sql`DELETE FROM room_skip_votes WHERE room_id = ${roomId}`;

  await sql`
    UPDATE rooms
    SET current_track_id = ${nextTrackId},
        options = ${JSON.stringify(nextOptions)}::jsonb,
        voting_open = TRUE,
        queue = ${JSON.stringify(nextQueue)}::jsonb,
        history = ${JSON.stringify(nextHistory)}::jsonb,
        updated_at = NOW()
    WHERE id = ${roomId}
  `;

  const updated = await getRoomSnapshot(roomId, undefined, false);
  if (!updated) throw new Error("Sala não encontrada.");
  return updated;
}

export async function updateRoomControls(
  rawRoomId: string,
  patch: {
    open?: boolean;
    rerollOptions?: boolean;
    clearVotes?: boolean;
    addToQueue?: string;
    removeFromQueueIndex?: number;
  }
): Promise<Room> {
  await ensureRoomsSchema();
  const sql = getDb();
  const roomId = rawRoomId.trim().toUpperCase();

  const room = await getRoomSnapshot(roomId, undefined, false);
  if (!room) throw new Error("Sala não encontrada.");

  let nextOpen = patch.open ?? room.open;
  let nextOptions = room.options;
  let nextQueue = room.queue;

  if (patch.rerollOptions) {
    const songRows = await sql`SELECT id FROM songs ORDER BY created_at DESC`;
    const allSongIds = songRows.map(s => String(s["id"]));
    nextOptions = pickCandidates(allSongIds, room.current);
    nextOpen = true;
    await sql`DELETE FROM room_votes WHERE room_id = ${roomId}`;
  }

  if (patch.clearVotes) {
    await sql`DELETE FROM room_votes WHERE room_id = ${roomId}`;
  }

  if (patch.addToQueue) {
    nextQueue = [...nextQueue, patch.addToQueue];
  }

  if (typeof patch.removeFromQueueIndex === "number") {
    nextQueue = nextQueue.filter((_, idx) => idx !== patch.removeFromQueueIndex);
  }

  await sql`
    UPDATE rooms
    SET voting_open = ${nextOpen},
        options = ${JSON.stringify(nextOptions)}::jsonb,
        queue = ${JSON.stringify(nextQueue)}::jsonb,
        updated_at = NOW()
    WHERE id = ${roomId}
  `;

  const updated = await getRoomSnapshot(roomId, undefined, false);
  if (!updated) throw new Error("Sala não encontrada.");
  return updated;
}

export async function sendRoomChatMessage(rawRoomId: string, userId: string, text: string): Promise<Room> {
  await ensureRoomsSchema();
  const sql = getDb();
  const roomId = rawRoomId.trim().toUpperCase();
  const cleanText = text.trim().slice(0, 500);
  if (!cleanText) throw new Error("Mensagem vazia.");

  const pRows = await sql`
    SELECT name FROM room_participants
    WHERE room_id = ${roomId} AND user_id = ${userId}
    LIMIT 1
  `;
  const sender = pRows[0];
  if (!sender) throw new Error("Você não está conectado nesta sala.");

  await sql`
    INSERT INTO room_chat (room_id, user_id, user_name, text)
    VALUES (${roomId}, ${userId}, ${String(sender["name"])}, ${cleanText})
  `;

  const updated = await getRoomSnapshot(roomId, userId, true);
  if (!updated) throw new Error("Sala não encontrada.");
  return updated;
}

export async function leaveOrRemoveFromRoom(rawRoomId: string, targetUserId: string): Promise<void> {
  await ensureRoomsSchema();
  const sql = getDb();
  const roomId = rawRoomId.trim().toUpperCase();

  await sql`DELETE FROM room_skip_votes WHERE room_id = ${roomId} AND user_id = ${targetUserId}`;
  await sql`DELETE FROM room_votes WHERE room_id = ${roomId} AND user_id = ${targetUserId}`;
  await sql`DELETE FROM room_participants WHERE room_id = ${roomId} AND user_id = ${targetUserId}`;

  // Verifica quem sobrou na sala; se ficou vazia, exclui a sala imediatamente
  const remaining = await sql`
    SELECT user_id FROM room_participants
    WHERE room_id = ${roomId}
    ORDER BY last_seen_at ASC
  `;

  if (remaining.length === 0) {
    await sql`DELETE FROM rooms WHERE id = ${roomId}`;
    return;
  }

  // Se o host saiu mas ainda há pessoas na sala, transfere o host para o próximo participante
  const nextHostId = String(remaining[0]?.["user_id"]);
  await sql`
    UPDATE rooms
    SET host_id = ${nextHostId}
    WHERE id = ${roomId} AND host_id = ${targetUserId}
  `;
  await sql`
    UPDATE room_participants
    SET role = 'host'
    WHERE room_id = ${roomId} AND user_id = ${nextHostId}
  `;

  // Se com a saída os votos de skip restantes atingiram o mínimo, pula a faixa
  const room = await getRoomSnapshot(roomId, undefined, false);
  if (room && room.current && room.skipCount >= room.skipRequired && room.skipCount > 0) {
    await advanceRoomTrack(roomId);
  }
}

export async function closeMusicRoom(rawRoomId: string, hostId: string): Promise<void> {
  await ensureRoomsSchema();
  const sql = getDb();
  const roomId = rawRoomId.trim().toUpperCase();

  await sql`
    DELETE FROM rooms
    WHERE id = ${roomId} AND host_id = ${hostId}
  `;
}
// ============================================================================
// AUTENTICAÇÃO DE USUÁRIOS (NEON POSTGRES)
// ============================================================================

export interface AuthUser {
  id: string;
  username: string;
  created_at: string;
}

export interface UserProfile {
  id: string;
  username: string;
  nickname: string;
  profile_picture: string;
  caption: string;
  bio: string;
  background: string;
  border_color: string;
  achievements: string[];
  listened_minutes: number;
  orbs: number;
  equipped_decoration: string | null;
  missions: ProfileMission[];
  mission_resets_at: string;
  decorations: ProfileDecoration[];
  owned_decorations: string[];
}

export interface ProfileMission {
  id: string;
  title: string;
  description: string;
  kind: "songs" | "listening";
  target: number;
  progress: number;
  reward: number;
  completed: boolean;
}

export interface ProfileDecoration {
  id: string;
  name: string;
  description: string;
  cost: number;
  style: string;
}

export type ProfileImageKind = "avatar" | "banner";

const PROFILE_DECORATIONS: ProfileDecoration[] = [
  { id: "signal-frame", name: "Moldura Sinal", description: "Um contorno de neon para seu avatar.", cost: 60, style: "signal" },
  { id: "aurora-frame", name: "Aurora", description: "Brilho ciano com movimento suave.", cost: 120, style: "aurora" },
  { id: "vinyl-frame", name: "Disco de Ouro", description: "Um aro dourado para quem vive a música.", cost: 220, style: "vinyl" },
  { id: "starlight-frame", name: "Chuva de Estrelas", description: "Pontos de luz em volta do perfil.", cost: 360, style: "starlight" },
  { id: "spectrum-frame", name: "Espectro", description: "Um arco-íris de áudio em loop.", cost: 520, style: "spectrum" },
];

const PROFILE_MISSION_CATALOG = [
  { id: "song-1", title: "Primeiro lançamento", description: "Adicione 1 música à biblioteca.", kind: "songs" as const, target: 1, reward: 15 },
  { id: "song-2", title: "Dois lados do disco", description: "Adicione 2 músicas à biblioteca.", kind: "songs" as const, target: 2, reward: 25 },
  { id: "song-3", title: "Trio em sintonia", description: "Adicione 3 músicas à biblioteca.", kind: "songs" as const, target: 3, reward: 35 },
  { id: "song-5", title: "Curador musical", description: "Adicione 5 músicas à biblioteca.", kind: "songs" as const, target: 5, reward: 55 },
  { id: "song-8", title: "Festival particular", description: "Adicione 8 músicas à biblioteca.", kind: "songs" as const, target: 8, reward: 80 },
  { id: "listen-10", title: "Aquecimento", description: "Ouça música por 10 minutos.", kind: "listening" as const, target: 10, reward: 15 },
  { id: "listen-20", title: "Entrou no ritmo", description: "Ouça música por 20 minutos.", kind: "listening" as const, target: 20, reward: 25 },
  { id: "listen-30", title: "Lado A completo", description: "Ouça música por 30 minutos.", kind: "listening" as const, target: 30, reward: 35 },
  { id: "listen-45", title: "Sessão estendida", description: "Ouça música por 45 minutos.", kind: "listening" as const, target: 45, reward: 50 },
  { id: "listen-60", title: "Uma hora de som", description: "Ouça música por 60 minutos.", kind: "listening" as const, target: 60, reward: 70 },
];

let usersSchemaPromise: Promise<void> | null = null;
const scryptAsync = promisify(scrypt);

async function ensureUsersSchema() {
  if (!usersSchemaPromise) {
    usersSchemaPromise = (async () => {
      const sql = getDb();
      await sql`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          nickname TEXT,
          profile_picture TEXT,
          caption TEXT,
          bio TEXT,
          background TEXT,
          border_color TEXT NOT NULL DEFAULT '#e74646',
          achievements JSONB NOT NULL DEFAULT '[]'::jsonb,
          listened_minutes INTEGER NOT NULL DEFAULT 0,
          last_listened_at TIMESTAMPTZ,
          orbs INTEGER NOT NULL DEFAULT 0,
          equipped_decoration TEXT,
          profile_picture_data BYTEA,
          profile_picture_mime TEXT,
          profile_picture_version INTEGER NOT NULL DEFAULT 0,
          banner_data BYTEA,
          banner_mime TEXT,
          banner_version INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS nickname TEXT`;
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_picture TEXT`;
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS caption TEXT`;
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT`;
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS background TEXT`;
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS border_color TEXT NOT NULL DEFAULT '#e74646'`;
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS achievements JSONB NOT NULL DEFAULT '[]'::jsonb`;
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS listened_minutes INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_listened_at TIMESTAMPTZ`;
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS orbs INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS equipped_decoration TEXT`;
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_picture_data BYTEA`;
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_picture_mime TEXT`;
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_picture_version INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS banner_data BYTEA`;
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS banner_mime TEXT`;
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS banner_version INTEGER NOT NULL DEFAULT 0`;
      await sql`
        CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx
          ON users (LOWER(username))
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS auth_sessions (
          token_hash TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS auth_sessions_expiry_idx ON auth_sessions (expires_at)`;
      await sql`
        CREATE TABLE IF NOT EXISTS user_mission_cycles (
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          cycle_id BIGINT NOT NULL,
          songs_added INTEGER NOT NULL DEFAULT 0,
          listened_minutes INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (user_id, cycle_id)
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS user_mission_tasks (
          user_id TEXT NOT NULL,
          cycle_id BIGINT NOT NULL,
          mission_id TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          kind TEXT NOT NULL CHECK (kind IN ('songs', 'listening')),
          target INTEGER NOT NULL,
          progress INTEGER NOT NULL DEFAULT 0,
          reward INTEGER NOT NULL,
          completed_at TIMESTAMPTZ,
          reward_claimed BOOLEAN NOT NULL DEFAULT FALSE,
          PRIMARY KEY (user_id, cycle_id, mission_id),
          FOREIGN KEY (user_id, cycle_id) REFERENCES user_mission_cycles(user_id, cycle_id) ON DELETE CASCADE
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS user_profile_decorations (
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          decoration_id TEXT NOT NULL,
          unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (user_id, decoration_id)
        )
      `;
    })().catch(err => {
      usersSchemaPromise = null;
      throw err;
    });
  }
  await usersSchemaPromise;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, key] = stored.split(":");
  if (!salt || !key) return false;
  const hashBuffer = (await scryptAsync(password, salt, 64)) as Buffer;
  const keyBuffer = Buffer.from(key, "hex");
  if (hashBuffer.length !== keyBuffer.length) return false;
  return timingSafeEqual(hashBuffer, keyBuffer);
}

async function hashPasswordAsync(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
}

export async function registerUser(
  username: string,
  password: string,
  confirmPassword: string
): Promise<AuthUser> {
  await ensureUsersSchema();
  const sql = getDb();

  const cleanUsername = username.trim();
  if (!cleanUsername) {
    throw new Error("Informe um nome de usuário.");
  }
  if (!password) {
    throw new Error("Informe uma senha.");
  }
  if (password.length < 10 || password.length > 128) {
    throw new Error("A senha deve ter entre 10 e 128 caracteres.");
  }
  if (cleanUsername.length > 32 || !/^[\p{L}\p{N}_.-]+$/u.test(cleanUsername)) {
    throw new Error("Use até 32 letras, números, ponto, hífen ou sublinhado no usuário.");
  }
  if (password !== confirmPassword) {
    throw new Error("A senha e a confirmação de senha não coincidem.");
  }

  const existing = await sql`
    SELECT id FROM users
    WHERE LOWER(username) = LOWER(${cleanUsername})
    LIMIT 1
  `;
  if (existing.length > 0) {
    throw new Error("Este nome de usuário já está em uso.");
  }

  const id = crypto.randomUUID();
  const passwordHash = await hashPasswordAsync(password);

  const rows = await sql`
    INSERT INTO users (id, username, password_hash)
    VALUES (${id}, ${cleanUsername}, ${passwordHash})
    RETURNING id, username, created_at
  `;

  const created = rows[0];
  if (!created) throw new Error("Não foi possível criar o usuário.");

  return {
    id: String(created["id"]),
    username: String(created["username"]),
    created_at: String(created["created_at"]),
  };
}

export async function loginUser(username: string, password: string): Promise<AuthUser> {
  await ensureUsersSchema();
  const sql = getDb();

  const cleanUsername = username.trim();
  if (!cleanUsername || cleanUsername.length > 32 || !password) {
    throw new Error("Preencha usuário e senha.");
  }

  if (password.length > 128) throw new Error("Usuário ou senha inválidos.");
  const rows = await sql`
    SELECT id, username, password_hash, created_at
    FROM users
    WHERE LOWER(username) = LOWER(${cleanUsername})
    LIMIT 1
  `;
  const user = rows[0];
  if (!user || !(await verifyPassword(password, String(user["password_hash"])))) {
    throw new Error("Usuário ou senha inválidos.");
  }

  return {
    id: String(user["id"]),
    username: String(user["username"]),
    created_at: String(user["created_at"]),
  };
}

function parseAchievements(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
    } catch {
      return [];
    }
  }
  return [];
}

function toUserProfile(row: Record<string, unknown>): UserProfile {
  const username = String(row["username"] ?? "");
  const pictureVersion = Number(row["profile_picture_version"] ?? 0);
  const bannerVersion = Number(row["banner_version"] ?? 0);
  return {
    id: String(row["id"]),
    username,
    nickname: String(row["nickname"] || username),
    profile_picture: row["has_profile_picture"] ? `/api/auth?image=avatar&v=${pictureVersion}` : "",
    caption: String(row["caption"] ?? ""),
    bio: String(row["bio"] ?? ""),
    background: row["has_banner"] ? `/api/auth?image=banner&v=${bannerVersion}` : "",
    border_color: String(row["border_color"] ?? "#e74646"),
    achievements: parseAchievements(row["achievements"]),
    listened_minutes: Number(row["listened_minutes"] ?? 0),
    orbs: Number(row["orbs"] ?? 0),
    equipped_decoration: row["equipped_decoration"] ? String(row["equipped_decoration"]) : null,
    missions: [],
    mission_resets_at: "",
    decorations: PROFILE_DECORATIONS,
    owned_decorations: [],
  };
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  await ensureUsersSchema();
  const sql = getDb();
  const rows = await sql`
    SELECT id, username, nickname, caption, bio, border_color, achievements, listened_minutes,
           orbs, equipped_decoration, profile_picture_data IS NOT NULL AS has_profile_picture,
           profile_picture_version, banner_data IS NOT NULL AS has_banner, banner_version
    FROM users WHERE id = ${userId} LIMIT 1
  `;
  return rows[0] ? loadProfileDashboard(toUserProfile(rows[0])) : null;
}

function cleanProfileImageUrl(value: string, fieldName: string): string {
  const clean = value.trim();
  if (!clean) return "";
  if (clean.length > 2048) throw new Error(`${fieldName} excede o tamanho permitido.`);
  let url: URL;
  try {
    url = new URL(clean);
  } catch {
    throw new Error(`${fieldName} deve ser um endereço HTTPS válido.`);
  }
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    isIP(host) ||
    host.startsWith("[") ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    throw new Error(`${fieldName} deve ser um endereço HTTPS público.`);
  }
  return url.toString();
}

export async function updateUserProfile(
  userId: string,
  input: Pick<UserProfile, "nickname" | "caption" | "bio" | "border_color">
): Promise<UserProfile> {
  await ensureUsersSchema();
  const sql = getDb();
  const current = await getUserProfile(userId);
  if (!current) throw new Error("Perfil não encontrado.");

  const nickname = input.nickname.trim();
  const caption = input.caption.trim();
  const bio = input.bio.trim();
  const borderColor = input.border_color.trim();
  if (nickname.length > 40) throw new Error("O apelido deve ter até 40 caracteres.");
  if (caption.length > 80) throw new Error("A legenda deve ter até 80 caracteres.");
  if (bio.length > 500) throw new Error("A bio deve ter até 500 caracteres.");
  if (!/^#[\da-f]{6}$/i.test(borderColor)) throw new Error("Escolha uma cor de borda válida.");

  const hasCustomProfile = Boolean(nickname && nickname !== current.username || caption || bio || borderColor !== "#e74646");
  const achievements = new Set(current.achievements);
  if (hasCustomProfile) achievements.add("custom-profile");

  await sql`
    UPDATE users SET
      nickname = ${nickname || current.username},
      caption = ${caption},
      bio = ${bio},
      border_color = ${borderColor},
      achievements = ${JSON.stringify([...achievements])}::jsonb
    WHERE id = ${userId}
  `;
  const updated = await getUserProfile(userId);
  if (!updated) throw new Error("Perfil não encontrado.");
  return updated;
}

export async function recordListenedMinute(userId: string): Promise<void> {
  await ensureUsersSchema();
  const sql = getDb();
  const rows = await sql`
    UPDATE users
    SET listened_minutes = listened_minutes + 1,
        last_listened_at = NOW()
    WHERE id = ${userId}
      AND (last_listened_at IS NULL OR last_listened_at < NOW() - INTERVAL '50 seconds')
    RETURNING listened_minutes
  `;
  const minutes = Number(rows[0]?.["listened_minutes"] ?? 0);
  if (rows.length) {
    const cycleId = await ensureMissionCycle(userId);
    await sql`UPDATE user_mission_cycles SET listened_minutes = listened_minutes + 1 WHERE user_id = ${userId} AND cycle_id = ${cycleId}`;
    await syncMissionProgress(userId, cycleId);
  }
  const profile = await getUserProfile(userId);
  if (!profile || minutes < 60) return;
  const achievements = new Set(profile.achievements);
  if (minutes >= 60) achievements.add("first-hour");
  if (minutes >= 600) achievements.add("ten-hours");
  if (achievements.size !== profile.achievements.length) {
    await sql`UPDATE users SET achievements = ${JSON.stringify([...achievements])}::jsonb WHERE id = ${userId}`;
  }
}

function currentMissionCycle(now = Date.now()) {
  const cycleMs = 6 * 60 * 60 * 1000;
  const cycleId = Math.floor(now / cycleMs);
  return { cycleId, resetsAt: new Date((cycleId + 1) * cycleMs).toISOString() };
}

async function syncMissionProgress(userId: string, cycleId: number) {
  const sql = getDb();
  await sql`
    UPDATE user_mission_tasks AS task
    SET progress = LEAST(task.target, CASE WHEN task.kind = 'songs' THEN cycle.songs_added ELSE cycle.listened_minutes END),
        completed_at = CASE WHEN (CASE WHEN task.kind = 'songs' THEN cycle.songs_added ELSE cycle.listened_minutes END) >= task.target THEN COALESCE(task.completed_at, NOW()) ELSE task.completed_at END
    FROM user_mission_cycles AS cycle
    WHERE task.user_id = ${userId} AND task.cycle_id = ${cycleId}
      AND cycle.user_id = task.user_id AND cycle.cycle_id = task.cycle_id
  `;
  await sql`
    WITH claimed AS (
      UPDATE user_mission_tasks SET reward_claimed = TRUE
      WHERE user_id = ${userId} AND cycle_id = ${cycleId} AND progress >= target AND reward_claimed = FALSE
      RETURNING reward
    ), total AS (SELECT COALESCE(SUM(reward), 0)::INTEGER AS amount FROM claimed)
    UPDATE users SET orbs = orbs + (SELECT amount FROM total)
    WHERE id = ${userId} AND (SELECT amount FROM total) > 0
  `;
}

async function ensureMissionCycle(userId: string) {
  const sql = getDb();
  const { cycleId } = currentMissionCycle();
  await sql`INSERT INTO user_mission_cycles (user_id, cycle_id) VALUES (${userId}, ${cycleId}) ON CONFLICT DO NOTHING`;
  const existing = await sql`SELECT mission_id FROM user_mission_tasks WHERE user_id = ${userId} AND cycle_id = ${cycleId}`;
  if (existing.length < 3) {
    const previous = await sql`SELECT mission_id FROM user_mission_tasks WHERE user_id = ${userId} AND cycle_id = ${cycleId - 1}`;
    const recentlyUsed = new Set(previous.map(row => String(row["mission_id"])));
    const seed = createHash("sha256").update(`${userId}:${cycleId}`).digest();
    let state = seed.readUInt32BE(0) || 1;
    const random = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 0x100000000; };
    const songs = PROFILE_MISSION_CATALOG.filter(item => item.kind === "songs" && !recentlyUsed.has(item.id));
    const listening = PROFILE_MISSION_CATALOG.filter(item => item.kind === "listening" && !recentlyUsed.has(item.id));
    const choose = (items: typeof PROFILE_MISSION_CATALOG) => items.splice(Math.floor(random() * items.length), 1)[0]!;
    const chosen = [choose(songs), choose(listening)];
    const remaining = PROFILE_MISSION_CATALOG.filter(item => !recentlyUsed.has(item.id) && !chosen.some(selected => selected.id === item.id));
    chosen.push(choose(remaining));
    for (const mission of chosen) {
      await sql`INSERT INTO user_mission_tasks (user_id, cycle_id, mission_id, title, description, kind, target, reward) VALUES (${userId}, ${cycleId}, ${mission.id}, ${mission.title}, ${mission.description}, ${mission.kind}, ${mission.target}, ${mission.reward}) ON CONFLICT DO NOTHING`;
    }
  }
  await syncMissionProgress(userId, cycleId);
  await sql`DELETE FROM user_mission_cycles WHERE user_id = ${userId} AND cycle_id < ${cycleId - 8}`;
  return cycleId;
}

async function loadProfileDashboard(profile: UserProfile): Promise<UserProfile> {
  const sql = getDb();
  const cycleId = await ensureMissionCycle(profile.id);
  const [tasks, owned, updated] = await Promise.all([
    sql`SELECT mission_id, title, description, kind, target, progress, reward FROM user_mission_tasks WHERE user_id = ${profile.id} AND cycle_id = ${cycleId} ORDER BY mission_id`,
    sql`SELECT decoration_id FROM user_profile_decorations WHERE user_id = ${profile.id}`,
    sql`SELECT orbs, equipped_decoration FROM users WHERE id = ${profile.id} LIMIT 1`,
  ]);
  return {
    ...profile,
    orbs: Number(updated[0]?.["orbs"] ?? 0),
    equipped_decoration: updated[0]?.["equipped_decoration"] ? String(updated[0]["equipped_decoration"]) : null,
    missions: tasks.map(row => ({ id: String(row["mission_id"]), title: String(row["title"]), description: String(row["description"]), kind: String(row["kind"]) as "songs" | "listening", target: Number(row["target"]), progress: Number(row["progress"]), reward: Number(row["reward"]), completed: Number(row["progress"]) >= Number(row["target"]) })),
    mission_resets_at: currentMissionCycle().resetsAt,
    owned_decorations: owned.map(row => String(row["decoration_id"])),
  };
}

export async function storeProfileImage(userId: string, kind: ProfileImageKind, mime: string, bytes: Buffer) {
  await ensureUsersSchema();
  const sql = getDb();
  if (kind === "avatar") await sql`UPDATE users SET profile_picture_data = ${bytes}, profile_picture_mime = ${mime}, profile_picture_version = profile_picture_version + 1 WHERE id = ${userId}`;
  else await sql`UPDATE users SET banner_data = ${bytes}, banner_mime = ${mime}, banner_version = banner_version + 1 WHERE id = ${userId}`;
}

export async function getProfileImage(userId: string, kind: ProfileImageKind) {
  await ensureUsersSchema();
  const sql = getDb();
  const rows = kind === "avatar"
    ? await sql`SELECT profile_picture_mime AS mime, encode(profile_picture_data, 'base64') AS data FROM users WHERE id = ${userId} AND profile_picture_data IS NOT NULL LIMIT 1`
    : await sql`SELECT banner_mime AS mime, encode(banner_data, 'base64') AS data FROM users WHERE id = ${userId} AND banner_data IS NOT NULL LIMIT 1`;
  if (!rows[0]) return null;
  return { mime: String(rows[0]["mime"]), bytes: Buffer.from(String(rows[0]["data"]), "base64") };
}

export async function recordSongMissionProgress(userId: string) {
  await ensureUsersSchema();
  const cycleId = await ensureMissionCycle(userId);
  const sql = getDb();
  await sql`UPDATE user_mission_cycles SET songs_added = songs_added + 1 WHERE user_id = ${userId} AND cycle_id = ${cycleId}`;
  await syncMissionProgress(userId, cycleId);
}

export async function redeemProfileDecoration(userId: string, decorationId: string) {
  await ensureUsersSchema();
  const decoration = PROFILE_DECORATIONS.find(item => item.id === decorationId);
  if (!decoration) throw new Error("DecoraÃ§Ã£o invÃ¡lida.");
  const sql = getDb();
  const rows = await sql`
    WITH debited AS (
      UPDATE users SET orbs = orbs - ${decoration.cost}
      WHERE id = ${userId} AND orbs >= ${decoration.cost}
        AND NOT EXISTS (SELECT 1 FROM user_profile_decorations WHERE user_id = ${userId} AND decoration_id = ${decorationId})
      RETURNING id
    )
    INSERT INTO user_profile_decorations (user_id, decoration_id)
    SELECT id, ${decorationId} FROM debited
    ON CONFLICT DO NOTHING
    RETURNING user_id
  `;
  if (!rows.length) throw new Error("Orbs insuficientes ou decoraÃ§Ã£o jÃ¡ resgatada.");
  return getUserProfile(userId);
}

export async function equipProfileDecoration(userId: string, decorationId: string | null) {
  await ensureUsersSchema();
  const sql = getDb();
  if (decorationId === null) await sql`UPDATE users SET equipped_decoration = NULL WHERE id = ${userId}`;
  else {
    if (!PROFILE_DECORATIONS.some(item => item.id === decorationId)) throw new Error("DecoraÃ§Ã£o invÃ¡lida.");
    const rows = await sql`UPDATE users SET equipped_decoration = ${decorationId} WHERE id = ${userId} AND EXISTS (SELECT 1 FROM user_profile_decorations WHERE user_id = ${userId} AND decoration_id = ${decorationId}) RETURNING id`;
    if (!rows.length) throw new Error("Resgate esta decoraÃ§Ã£o antes de equipÃ¡-la.");
  }
  return getUserProfile(userId);
}

export async function createAuthSession(userId: string): Promise<string> {
  await ensureUsersSchema();
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const sql = getDb();
  await sql`DELETE FROM auth_sessions WHERE expires_at <= NOW()`;
  await sql`
    INSERT INTO auth_sessions (token_hash, user_id, expires_at)
    VALUES (${tokenHash}, ${userId}, NOW() + INTERVAL '30 days')
  `;
  return token;
}

export async function getAuthSession(token: string | null): Promise<AuthUser | null> {
  if (!token || token.length > 128) return null;
  await ensureUsersSchema();
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const sql = getDb();
  const rows = await sql`
    SELECT u.id, u.username, u.created_at
    FROM auth_sessions s
    INNER JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ${tokenHash} AND s.expires_at > NOW()
    LIMIT 1
  `;
  const user = rows[0];
  if (!user) return null;
  return {
    id: String(user["id"]),
    username: String(user["username"]),
    created_at: String(user["created_at"]),
  };
}

export async function revokeAuthSession(token: string | null): Promise<void> {
  if (!token || token.length > 128) return;
  await ensureUsersSchema();
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const sql = getDb();
  await sql`DELETE FROM auth_sessions WHERE token_hash = ${tokenHash}`;
}
