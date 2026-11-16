import { env } from "node:process";
import { neon } from "@neondatabase/serverless";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
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

let usersSchemaPromise: Promise<void> | null = null;

async function ensureUsersSchema() {
  if (!usersSchemaPromise) {
    usersSchemaPromise = (async () => {
      const sql = getDb();
      await sql`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx
          ON users (LOWER(username))
      `;
    })().catch(err => {
      usersSchemaPromise = null;
      throw err;
    });
  }
  await usersSchemaPromise;
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, key] = stored.split(":");
  if (!salt || !key) return false;
  const hashBuffer = scryptSync(password, salt, 64);
  const keyBuffer = Buffer.from(key, "hex");
  if (hashBuffer.length !== keyBuffer.length) return false;
  return timingSafeEqual(hashBuffer, keyBuffer);
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
  const passwordHash = hashPassword(password);

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
  if (!cleanUsername || !password) {
    throw new Error("Preencha usuário e senha.");
  }

  const rows = await sql`
    SELECT id, username, password_hash, created_at
    FROM users
    WHERE LOWER(username) = LOWER(${cleanUsername})
    LIMIT 1
  `;
  const user = rows[0];
  if (!user || !verifyPassword(password, String(user["password_hash"]))) {
    throw new Error("Usuário ou senha inválidos.");
  }

  return {
    id: String(user["id"]),
    username: String(user["username"]),
    created_at: String(user["created_at"]),
  };
}