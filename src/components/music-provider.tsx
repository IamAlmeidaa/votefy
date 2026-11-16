import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { candidates, winner, loadTracks, saveTrack, deleteTrack, type Track, type Playlist, type Room } from '@/lib/music';

function useMusicState() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [ready, setReady] = useState(false);
  const [current, setCurrent] = useState<string>();
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(.7);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [queue, setQueue] = useState<string[]>([]);
  const [activeRoom, setActiveRoom] = useState<string>();
  const [notice, setNotice] = useState('');
  const [importing, setImporting] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const url = useRef<string | undefined>(undefined);
  const playbackVersion = useRef(0);
  useEffect(() => {
    audio.current = new Audio();
    const element = audio.current;
    element.ontimeupdate = () => setElapsed(element.currentTime);
    element.onloadedmetadata = () => setDuration(element.duration);
    element.onplay = () => setPlaying(true);
    element.onpause = () => setPlaying(false);
    element.onerror = () => setNotice('Este arquivo não pode ser reproduzido neste navegador.');
    try {
      const state = JSON.parse(localStorage.getItem('onda-state') || '{}');
      setPlaylists(state.playlists || []); setFavorites(state.favorites || []); setRooms(state.rooms || []);
      setVolume(state.volume ?? .7); setShuffle(state.shuffle || false); setRepeat(state.repeat || false);
    } catch { setNotice('Não foi possível recuperar as preferências salvas.'); }
    loadTracks().then(setTracks).catch(() => setNotice('Armazenamento indisponível. Verifique as permissões do navegador.')).finally(() => setReady(true));
    return () => { element.pause(); element.src = ''; if (url.current) URL.revokeObjectURL(url.current); };
  }, []);
  useEffect(() => { if (ready) { try { localStorage.setItem('onda-state', JSON.stringify({ playlists, favorites, rooms, volume, shuffle, repeat })); } catch { setNotice('Não foi possível salvar. O armazenamento pode estar cheio.'); } } }, [ready, playlists, favorites, rooms, volume, shuffle, repeat]);
  useEffect(() => { if (audio.current) audio.current.volume = volume; }, [volume]);
  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(''), 6500); return () => clearTimeout(timer); } }, [notice]);
  const updateRoom = (id: string, change: (room: Room) => Room) => setRooms(previous => previous.map(room => room.id === id ? change(room) : room));
  const play = (id: string, ids?: string[], roomId?: string) => {
    const track = tracks.find(t => t.id === id); const element = audio.current;
    if (!track || !element) return;
    playbackVersion.current++;
    const version = playbackVersion.current;
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = URL.createObjectURL(track.file); element.src = url.current;
    setCurrent(id); setElapsed(0); setDuration(track.duration); setActiveRoom(roomId);
    if (ids) setQueue(ids);
    if (roomId) updateRoom(roomId, room => ({ ...room, current: id, options: candidates(tracks.map(t => t.id), id), votes: {}, open: true }));
    element.play().catch(error => { if (version === playbackVersion.current && error.name !== 'AbortError') setNotice('Reprodução indisponível. Tente outro formato de áudio.'); });
    try { const history = JSON.parse(localStorage.getItem('onda-history') || '[]'); localStorage.setItem('onda-history', JSON.stringify([id, ...history].slice(0, 100))); } catch { /* History is optional. */ }
  };
  const finishRound = (id: string, manual?: string) => {
    const room = rooms.find(r => r.id === id); if (!room) return;
    const next = manual || room.queue.find(id => tracks.some(t => t.id === id)) || winner(room, tracks.map(t => t.id));
    if (!next) { setNotice('Adicione mais músicas para iniciar outra rodada.'); return; }
    const count = Object.values(room.votes).filter(v => v === next).length;
    updateRoom(id, r => ({ ...r, history: [...r.history, { track: next, votes: count }], queue: r.queue.filter(t => t !== next), open: false }));
    play(next, undefined, id);
  };
  const skip = (direction = 1) => {
    if (activeRoom && direction === 1) { finishRound(activeRoom); return; }
    const ids = (queue.length ? queue : tracks.map(t => t.id)).filter(id => tracks.some(t => t.id === id));
    if (!ids.length) return;
    const index = ids.indexOf(current || '');
    play(ids[shuffle ? Math.floor(Math.random() * ids.length) : (index + direction + ids.length) % ids.length], ids);
  };
  useEffect(() => { if (audio.current) audio.current.onended = () => { if (activeRoom) finishRound(activeRoom); else if (repeat && audio.current) { audio.current.currentTime = 0; void audio.current.play(); } else skip(); }; });
  const toggle = () => { if (!audio.current) return; if (!current) { if (tracks[0]) play(tracks[0].id); return; } if (playing) audio.current.pause(); else audio.current.play().catch(() => setNotice('Não foi possível reproduzir este arquivo.')); };
  const seek = (value: number) => { if (audio.current && Number.isFinite(audio.current.duration)) { audio.current.currentTime = value; setElapsed(value); } };
  const importFiles = async (files: File[]) => {
    setImporting(true); let added = 0; let failed = 0;
    for (const file of files) {
      if (!file.type.startsWith('audio/') && !/\.(mp3|wav|ogg|flac|m4a|aac|opus|aiff|webm)$/i.test(file.name)) { failed++; continue; }
      try {
        const { parseBlob } = await import('music-metadata');
        const metadata = await parseBlob(file).catch(() => undefined);
        const picture = metadata?.common.picture?.[0];
        const track: Track = { id: crypto.randomUUID(), title: metadata?.common.title || file.name.replace(/\.[^.]+$/, ''), artist: metadata?.common.artist || 'Artista desconhecido', album: metadata?.common.album || 'Músicas locais', filename: file.name, duration: metadata?.format.duration || 0, file, cover: picture ? new Blob([new Uint8Array(picture.data)], { type: picture.format }) : undefined, added: Date.now() };
        await saveTrack(track); setTracks(previous => [...previous, track]); added++;
      } catch { failed++; }
    }
    setImporting(false); setNotice(`${added} música${added === 1 ? '' : 's'} adicionada${added === 1 ? '' : 's'}${failed ? ` · ${failed} arquivo(s) não importado(s)` : ''}.`);
  };
  const removeTrack = async (id: string) => {
    try { await deleteTrack(id); setTracks(all => all.filter(t => t.id !== id)); setFavorites(all => all.filter(t => t !== id)); setPlaylists(all => all.map(p => ({ ...p, tracks: p.tracks.filter(t => t !== id) }))); setRooms(all => all.map(r => ({ ...r, options: r.options.filter(t => t !== id), queue: r.queue.filter(t => t !== id), votes: Object.fromEntries(Object.entries(r.votes).filter(([, t]) => t !== id)) }))); if (current === id) { audio.current?.pause(); setCurrent(undefined); } } catch { setNotice('Não foi possível excluir a música.'); }
  };
  const favorite = (id: string) => setFavorites(all => all.includes(id) ? all.filter(t => t !== id) : [...all, id]);
  return { tracks, playlists, setPlaylists, favorites, favorite, rooms, setRooms, updateRoom, ready, current, playing, elapsed, duration, volume, setVolume, shuffle, setShuffle, repeat, setRepeat, play, toggle, skip, seek, importFiles, importing, notice, setNotice, removeTrack, activeRoom, setActiveRoom, finishRound };
}
type MusicState = ReturnType<typeof useMusicState>;
const MusicContext = createContext<MusicState | null>(null);
export function MusicProvider({ children }: { children: ReactNode }) { const state = useMusicState(); return <MusicContext.Provider value={state}>{children}</MusicContext.Provider>; }
export function useMusic() { const state = useContext(MusicContext); if (!state) throw new Error('Music provider missing'); return state; }