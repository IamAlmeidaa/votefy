import { describe, expect, it } from 'vitest';
import { decodeSignal, encodeSignal, toSharedTracks } from '@/lib/lan';
import type { Track } from '@/lib/music';

const track: Track = { id: 'song-1', title: 'Música do host', artist: 'Artista', album: 'Álbum', filename: 'musica.mp3', duration: 123, added: 42, file: new Blob(['audio']), cover: new Blob(['cover']) };

describe('LAN room exchange', () => {
  it('shares the host music metadata without transferring audio or cover files', () => {
    const shared = toSharedTracks([track]);
    expect(shared).toEqual([{ id: 'song-1', title: 'Música do host', artist: 'Artista', album: 'Álbum', filename: 'musica.mp3', duration: 123, added: 42 }]);
    expect(shared[0]).not.toHaveProperty('file');
    expect(shared[0]).not.toHaveProperty('cover');
  });
  it('round-trips a host offer and its room identity', () => {
    const code = encodeSignal('ROOM1234', { type: 'offer', sdp: 'v=0\r\na=candidate:1 1 UDP 1 192.168.1.10 5000 typ host' });
    expect(decodeSignal(code, 'offer')).toEqual({ room: 'ROOM1234', description: { type: 'offer', sdp: 'v=0\r\na=candidate:1 1 UDP 1 192.168.1.10 5000 typ host' } });
  });
  it('rejects an answer where the host offer is required', () => {
    const answer = encodeSignal('ROOM1234', { type: 'answer', sdp: 'v=0' });
    expect(() => decodeSignal(answer, 'offer')).toThrow('Código de convite inválido.');
  });
  it('rejects malformed invitation codes', () => expect(() => decodeSignal('not-an-invitation')).toThrow('Código de convite inválido.'));
});
