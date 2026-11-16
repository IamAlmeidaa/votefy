import { openDB } from 'idb';

export type Track = {
  id: string;
  title: string;
  artist: string;
  album: string;
  filename: string;
  duration: number;
  file: Blob;
  cover?: Blob | undefined;
  added: number;
};

export type Playlist = { id: string; name: string; tracks: string[]; art: number };
export type Participant = { id: string; name: string; role?: 'host' | 'guest'; goldenUsed?: boolean };
export type RoomVote = { track: string; weight: number };

export type Room = {
  id: string;
  name: string;
  admin: string;
  active: string;
  participants: Participant[];
  activeCount: number;
  current?: string | undefined;
  options: string[];
  votes: Record<string, RoomVote>;
  open: boolean;
  queue: string[];
  history: { track: string; votes: number }[];
  chat: { name: string; text: string }[];
  skipVotes: string[];
  skipCount: number;
  skipRequired: number;
  skipPercentage: number;
};

export function vote(room: Room, participant: string, track: string, available: string[], isGolden = false): Room {
  if (
    !room.open ||
    !room.participants.some(p => p.id === participant) ||
    !room.options.includes(track) ||
    !available.includes(track) ||
    track === room.current
  ) {
    return room;
  }
  const existing = room.votes[participant];
  if (existing?.weight === 3 && !isGolden) return room;
  const weight = isGolden || existing?.weight === 3 ? 3 : 1;
  return {
    ...room,
    votes: { ...room.votes, [participant]: { track, weight } },
  };
}

export function candidates(ids: string[], current?: string, random = Math.random): string[] {
  const remaining = [...new Set(ids)].filter(id => id !== current);
  for (let i = remaining.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const a = remaining[i];
    const b = remaining[j];
    if (a !== undefined && b !== undefined) {
      remaining[i] = b;
      remaining[j] = a;
    }
  }
  return remaining.slice(0, 4);
}

export function winner(room: Room, available: string[], random = Math.random): string | undefined {
  const valid = room.options.filter(id => available.includes(id) && id !== room.current);
  if (!valid.length) return available.find(id => id !== room.current);
  const scores = valid.map(id =>
    Object.values(room.votes)
      .filter(v => v.track === id)
      .reduce((sum, v) => sum + v.weight, 0)
  );
  const highest = Math.max(0, ...scores);
  const tied = valid.filter((_, i) => scores[i] === highest);
  return tied[Math.floor(random() * tied.length)];
}

const database = () =>
  openDB('onda-library', 1, {
    upgrade(db) {
      db.createObjectStore('tracks', { keyPath: 'id' });
    },
  });

export async function loadTracks(): Promise<Track[]> {
  return (await database()).getAll('tracks');
}
export async function saveTrack(track: Track) {
  return (await database()).put('tracks', track);
}
export async function deleteTrack(id: string) {
  return (await database()).delete('tracks', id);
}
export const time = (seconds: number) => {
  const value = Number.isFinite(seconds) ? Math.floor(seconds) : 0;
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
};