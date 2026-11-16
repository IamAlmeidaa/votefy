import { env } from "node:process";
import { neon } from "@neondatabase/serverless";

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

// Busca todas as músicas salvas na Neon
export async function listSongs(): Promise<SongRecord[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT * FROM songs
    ORDER BY votes DESC, created_at DESC
  `;
  return rows as SongRecord[];
}

// Salva uma nova música (via link do YouTube, URL direta ou arquivo MP3 em Base64)
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
      // Mantém os valores padrão caso a busca de metadados falhe
    }
  }

  const rows = await sql`
    INSERT INTO songs (title, artist, media_url, youtube_id, cover_url)
    VALUES (${title}, ${artist}, ${mediaUrl}, ${youtubeId}, ${coverUrl})
    RETURNING *
  `;

  return rows[0] as SongRecord;
}

// Soma +1 voto na música
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