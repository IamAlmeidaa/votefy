import type { Room, Track } from '@/lib/music';

export type SharedTrack = Pick<Track, 'id' | 'title' | 'artist' | 'album' | 'filename' | 'duration' | 'added'>;
export type SignalKind = 'offer' | 'answer';
export type LanMessage =
  | { type: 'hello'; name: string }
  | { type: 'welcome'; participantId: string }
  | { type: 'snapshot'; room: Room; tracks: SharedTrack[] }
  | { type: 'vote'; track: string }
  | { type: 'chat'; text: string }
  | { type: 'leave' };

type SignalPayload = { version: 1; room: string; description: RTCSessionDescriptionInit };
const PREFIX = 'VTF1.';

export function toSharedTracks(tracks: Track[]): SharedTrack[] {
  return tracks.map(({ id, title, artist, album, filename, duration, added }) => ({ id, title, artist, album, filename, duration, added }));
}

export function encodeSignal(room: string, description: RTCSessionDescriptionInit): string {
  const payload: SignalPayload = { version: 1, room, description };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return PREFIX + btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export function decodeSignal(code: string, expected?: SignalKind): { room: string; description: RTCSessionDescriptionInit } {
  try {
    const compact = code.trim().replaceAll(/\s/g, '');
    if (!compact.startsWith(PREFIX)) throw new Error('prefix');
    const encoded = compact.slice(PREFIX.length).replaceAll('-', '+').replaceAll('_', '/');
    const binary = atob(encoded + '='.repeat((4 - encoded.length % 4) % 4));
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as SignalPayload;
    if (payload.version !== 1 || typeof payload.room !== 'string' || !payload.room || !payload.description?.sdp || !['offer', 'answer'].includes(payload.description.type)) throw new Error('payload');
    if (expected && payload.description.type !== expected) throw new Error('kind');
    return { room: payload.room, description: payload.description };
  } catch {
    throw new Error(expected === 'answer' ? 'Código de resposta inválido.' : 'Código de convite inválido.');
  }
}

export function createLanPeer(): RTCPeerConnection {
  // No STUN/TURN servers: only direct candidates, keeping connections on the LAN.
  return new RTCPeerConnection({ iceServers: [] });
}

export function waitForCandidates(peer: RTCPeerConnection, timeout = 7000): Promise<void> {
  if (peer.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise(resolve => {
    const timer = window.setTimeout(done, timeout);
    function done() {
      window.clearTimeout(timer);
      peer.removeEventListener('icegatheringstatechange', check);
      resolve();
    }
    function check() {
      if (peer.iceGatheringState === 'complete') done();
    }
    peer.addEventListener('icegatheringstatechange', check);
  });
}

export function parseLanMessage(value: unknown): LanMessage | undefined {
  try {
    const message = JSON.parse(String(value)) as LanMessage;
    if (!['hello', 'welcome', 'snapshot', 'vote', 'chat', 'leave'].includes(message.type)) return undefined;
    return message;
  } catch {
    return undefined;
  }
}
