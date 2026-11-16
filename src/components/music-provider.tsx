import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { candidates, winner, loadTracks, saveTrack, deleteTrack, vote, type Track, type Playlist, type Room, type Participant } from '@/lib/music';
import { createLanPeer, decodeSignal, encodeSignal, parseLanMessage, toSharedTracks, waitForCandidates, type LanMessage, type SharedTrack } from '@/lib/lan';

export type Membership = { role: 'host' | 'guest'; participantId: string; status: 'waiting' | 'connected' | 'disconnected'; answerCode?: string };
export type Invite = { id: string; roomId: string; code: string; status: 'waiting' | 'connecting' | 'connected'; participantName?: string };
type HostConnection = { id: string; roomId: string; peer: RTCPeerConnection; channel: RTCDataChannel; participant?: Participant; closed: boolean };
type GuestConnection = { roomId: string; name: string; peer: RTCPeerConnection; channel?: RTCDataChannel; participantId: string; closed: boolean };

function useMusicState() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [memberships, setMemberships] = useState<Record<string, Membership>>({});
  const [remoteTracks, setRemoteTracks] = useState<Record<string, SharedTrack[]>>({});
  const [invites, setInvites] = useState<Invite[]>([]);
  const [creatingInvite, setCreatingInvite] = useState(false);
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
  const tracksRef = useRef<Track[]>([]);
  const roomsRef = useRef<Room[]>([]);
  const membershipsRef = useRef<Record<string, Membership>>({});
  const hostConnections = useRef(new Map<string, HostConnection>());
  const guestConnection = useRef<GuestConnection | undefined>(undefined);

  const commitRooms = (next: Room[], broadcast = true) => {
    roomsRef.current = next;
    setRooms(next);
    if (broadcast) for (const room of next) if (membershipsRef.current[room.id]?.role === 'host') broadcastRoom(room.id);
  };
  const commitMemberships = (next: Record<string, Membership>) => {
    membershipsRef.current = next;
    setMemberships(next);
  };
  const patchMembership = (roomId: string, patch: Partial<Membership>) => {
    const previous = membershipsRef.current[roomId];
    if (previous) commitMemberships({ ...membershipsRef.current, [roomId]: { ...previous, ...patch } });
  };
  const send = (channel: RTCDataChannel | undefined, message: LanMessage) => {
    if (channel?.readyState === 'open') channel.send(JSON.stringify(message));
  };
  function broadcastRoom(roomId: string) {
    const room = roomsRef.current.find(item => item.id === roomId);
    if (!room || membershipsRef.current[roomId]?.role !== 'host') return;
    const message: LanMessage = { type: 'snapshot', room, tracks: toSharedTracks(tracksRef.current) };
    for (const connection of hostConnections.current.values()) if (connection.roomId === roomId && connection.participant) send(connection.channel, message);
  }
  const updateRoom = (id: string, change: (room: Room) => Room) => {
    if (membershipsRef.current[id]?.role !== 'host') return;
    const room = roomsRef.current.find(item => item.id === id);
    if (!room) return;
    const changed = change(room);
    if (changed === room) return;
    commitRooms(roomsRef.current.map(item => item.id === id ? changed : item));
  };
  const cleanupHostConnection = (connection: HostConnection) => {
    if (connection.closed) return;
    connection.closed = true;
    hostConnections.current.delete(connection.id);
    setInvites(all => all.filter(invite => invite.id !== connection.id));
    const participant = connection.participant;
    connection.channel.onmessage = null;
    connection.channel.onclose = null;
    connection.peer.onconnectionstatechange = null;
    try { connection.channel.close(); connection.peer.close(); } catch { /* Already closed. */ }
    if (participant) updateRoom(connection.roomId, room => ({ ...room, participants: room.participants.filter(person => person.id !== participant.id), votes: Object.fromEntries(Object.entries(room.votes).filter(([person]) => person !== participant.id)) }));
  };
  const handleHostMessage = (connection: HostConnection, raw: unknown) => {
    const message = parseLanMessage(raw);
    if (!message) return;
    if (message.type === 'hello') {
      if (connection.participant || connection.closed) return;
      const participant = { id: crypto.randomUUID(), name: String(message.name).trim().slice(0, 40) || 'Convidado' };
      connection.participant = participant;
      setInvites(all => all.map(invite => invite.id === connection.id ? { ...invite, status: 'connected', participantName: participant.name } : invite));
      send(connection.channel, { type: 'welcome', participantId: participant.id });
      updateRoom(connection.roomId, room => ({ ...room, participants: [...room.participants.filter(person => person.id !== participant.id), participant] }));
      return;
    }
    if (!connection.participant) return;
    if (message.type === 'vote') updateRoom(connection.roomId, room => vote(room, connection.participant!.id, String(message.track), tracksRef.current.map(track => track.id)));
    if (message.type === 'chat') {
      const text = String(message.text).trim().slice(0, 500);
      if (text) updateRoom(connection.roomId, room => ({ ...room, chat: [...room.chat, { name: connection.participant!.name, text }].slice(-100) }));
    }
    if (message.type === 'leave') cleanupHostConnection(connection);
  };

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
      setPlaylists(state.playlists || []);
      setFavorites(state.favorites || []);
      setVolume(state.volume ?? .7);
      setShuffle(state.shuffle || false);
      setRepeat(state.repeat || false);
    } catch { setNotice('Não foi possível recuperar as preferências salvas.'); }
    loadTracks().then(loaded => { tracksRef.current = loaded; setTracks(loaded); }).catch(() => setNotice('Armazenamento indisponível. Verifique as permissões do navegador.')).finally(() => setReady(true));
    return () => {
      element.pause();
      element.src = '';
      if (url.current) URL.revokeObjectURL(url.current);
      for (const connection of hostConnections.current.values()) { connection.closed = true; connection.peer.close(); }
      if (guestConnection.current) { guestConnection.current.closed = true; guestConnection.current.peer.close(); }
    };
  }, []);
  useEffect(() => { if (ready) { try { localStorage.setItem('onda-state', JSON.stringify({ playlists, favorites, volume, shuffle, repeat })); } catch { setNotice('Não foi possível salvar. O armazenamento pode estar cheio.'); } } }, [ready, playlists, favorites, volume, shuffle, repeat]);
  useEffect(() => { if (audio.current) audio.current.volume = volume; }, [volume]);
  useEffect(() => { tracksRef.current = tracks; for (const room of roomsRef.current) broadcastRoom(room.id); }, [tracks]);
  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(''), 6500); return () => clearTimeout(timer); } return undefined; }, [notice]);

  const play = (id: string, ids?: string[], roomId?: string) => {
    const track = tracksRef.current.find(item => item.id === id);
    const element = audio.current;
    if (!track || !element || (roomId && membershipsRef.current[roomId]?.role !== 'host')) return;
    playbackVersion.current++;
    const version = playbackVersion.current;
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = URL.createObjectURL(track.file);
    element.src = url.current;
    setCurrent(id);
    setElapsed(0);
    setDuration(track.duration);
    setActiveRoom(roomId);
    if (ids) setQueue(ids);
    if (roomId) updateRoom(roomId, room => ({ ...room, current: id, options: candidates(tracksRef.current.map(item => item.id), id), votes: {}, open: true }));
    element.play().catch(error => { if (version === playbackVersion.current && error.name !== 'AbortError') setNotice('Reprodução indisponível. Tente outro formato de áudio.'); });
    try { const history = JSON.parse(localStorage.getItem('onda-history') || '[]'); localStorage.setItem('onda-history', JSON.stringify([id, ...history].slice(0, 100))); } catch { /* History is optional. */ }
  };
  const finishRound = (id: string, manual?: string) => {
    if (membershipsRef.current[id]?.role !== 'host') return;
    const room = roomsRef.current.find(item => item.id === id);
    if (!room) return;
    const next = manual || room.queue.find(trackId => tracksRef.current.some(track => track.id === trackId)) || winner(room, tracksRef.current.map(track => track.id));
    if (!next) { setNotice('Adicione mais músicas para iniciar outra rodada.'); return; }
    const count = Object.values(room.votes).filter(value => value === next).length;
    updateRoom(id, currentRoom => ({ ...currentRoom, history: [...currentRoom.history, { track: next, votes: count }], queue: currentRoom.queue.filter(trackId => trackId !== next), open: false }));
    play(next, undefined, id);
  };
  const skip = (direction = 1) => {
    if (activeRoom && direction === 1) { finishRound(activeRoom); return; }
    const ids = (queue.length ? queue : tracks.map(track => track.id)).filter(id => tracks.some(track => track.id === id));
    if (!ids.length) return;
    const index = ids.indexOf(current || '');
    const next = ids[shuffle ? Math.floor(Math.random() * ids.length) : (index + direction + ids.length) % ids.length];
    if (next) play(next, ids);
  };
  useEffect(() => { if (audio.current) audio.current.onended = () => { if (activeRoom) finishRound(activeRoom); else if (repeat && audio.current) { audio.current.currentTime = 0; void audio.current.play(); } else skip(); }; });
  const toggle = () => { if (!audio.current) return; if (!current) { if (tracks[0]) play(tracks[0].id); return; } if (playing) audio.current.pause(); else audio.current.play().catch(() => setNotice('Não foi possível reproduzir este arquivo.')); };
  const seek = (value: number) => { if (audio.current && Number.isFinite(audio.current.duration)) { audio.current.currentTime = value; setElapsed(value); } };
  const importFiles = async (files: File[]) => {
    setImporting(true);
    let added = 0;
    let failed = 0;
    for (const file of files) {
      if (!file.type.startsWith('audio/') && !/\.(mp3|wav|ogg|flac|m4a|aac|opus|aiff|webm)$/i.test(file.name)) { failed++; continue; }
      try {
        const { parseBlob } = await import('music-metadata');
        const metadata = await parseBlob(file).catch(() => undefined);
        const picture = metadata?.common.picture?.[0];
        const track: Track = { id: crypto.randomUUID(), title: metadata?.common.title || file.name.replace(/\.[^.]+$/, ''), artist: metadata?.common.artist || 'Artista desconhecido', album: metadata?.common.album || 'Músicas locais', filename: file.name, duration: metadata?.format.duration || 0, file, cover: picture ? new Blob([new Uint8Array(picture.data)], { type: picture.format }) : undefined, added: Date.now() };
        await saveTrack(track);
        setTracks(previous => [...previous, track]);
        added++;
      } catch { failed++; }
    }
    setImporting(false);
    setNotice(`${added} música${added === 1 ? '' : 's'} adicionada${added === 1 ? '' : 's'}${failed ? ` · ${failed} arquivo(s) não importado(s)` : ''}.`);
  };
  const removeTrack = async (id: string) => {
    try {
      await deleteTrack(id);
      setTracks(all => all.filter(track => track.id !== id));
      setFavorites(all => all.filter(trackId => trackId !== id));
      setPlaylists(all => all.map(playlist => ({ ...playlist, tracks: playlist.tracks.filter(trackId => trackId !== id) })));
      commitRooms(roomsRef.current.map(room => ({ ...room, options: room.options.filter(trackId => trackId !== id), queue: room.queue.filter(trackId => trackId !== id), votes: Object.fromEntries(Object.entries(room.votes).filter(([, trackId]) => trackId !== id)) })));
      if (current === id) { audio.current?.pause(); setCurrent(undefined); }
    } catch { setNotice('Não foi possível excluir a música.'); }
  };
  const favorite = (id: string) => setFavorites(all => all.includes(id) ? all.filter(trackId => trackId !== id) : [...all, id]);

  const createRoom = (name: string, hostName: string) => {
    const participantId = crypto.randomUUID();
    const id = crypto.randomUUID().slice(0, 8).toUpperCase();
    const room: Room = { id, name: name.trim(), admin: participantId, active: participantId, participants: [{ id: participantId, name: hostName.trim() }], options: [], votes: {}, open: true, queue: [], history: [], chat: [] };
    commitMemberships({ ...membershipsRef.current, [id]: { role: 'host', participantId, status: 'connected' } });
    commitRooms([...roomsRef.current, room], false);
    return id;
  };
  const createInvite = async (roomId: string) => {
    if (membershipsRef.current[roomId]?.role !== 'host') throw new Error('Somente o host pode criar convites.');
    setCreatingInvite(true);
    const peer = createLanPeer();
    const id = crypto.randomUUID();
    const channel = peer.createDataChannel('votefy-lan');
    const connection: HostConnection = { id, roomId, peer, channel, closed: false };
    hostConnections.current.set(id, connection);
    channel.onmessage = event => handleHostMessage(connection, event.data);
    channel.onclose = () => cleanupHostConnection(connection);
    peer.onconnectionstatechange = () => { if (['failed', 'closed'].includes(peer.connectionState)) cleanupHostConnection(connection); };
    try {
      await peer.setLocalDescription(await peer.createOffer());
      await waitForCandidates(peer);
      if (!peer.localDescription) throw new Error('Não foi possível preparar a conexão local.');
      const code = encodeSignal(roomId, peer.localDescription);
      setInvites(all => [...all, { id, roomId, code, status: 'waiting' }]);
      return code;
    } catch (error) {
      cleanupHostConnection(connection);
      throw error;
    } finally { setCreatingInvite(false); }
  };
  const acceptAnswer = async (inviteId: string, code: string) => {
    const connection = hostConnections.current.get(inviteId);
    if (!connection) throw new Error('Este convite não está mais disponível.');
    const signal = decodeSignal(code, 'answer');
    if (signal.room !== connection.roomId) throw new Error('Esta resposta pertence a outra sala.');
    await connection.peer.setRemoteDescription(signal.description);
    setInvites(all => all.map(invite => invite.id === inviteId ? { ...invite, status: 'connecting' } : invite));
  };
  const joinRoom = async (code: string, name: string) => {
    const signal = decodeSignal(code, 'offer');
    if (guestConnection.current) {
      const previous = guestConnection.current;
      previous.closed = true;
      previous.peer.close();
    }
    const peer = createLanPeer();
    const connection: GuestConnection = { roomId: signal.room, name: name.trim().slice(0, 40), peer, participantId: '', closed: false };
    guestConnection.current = connection;
    commitMemberships({ ...membershipsRef.current, [signal.room]: { role: 'guest', participantId: '', status: 'waiting' } });
    const placeholder: Room = { id: signal.room, name: 'Sala do host', admin: '', active: '', participants: [], options: [], votes: {}, open: false, queue: [], history: [], chat: [] };
    commitRooms([...roomsRef.current.filter(room => room.id !== signal.room), placeholder], false);
    peer.ondatachannel = event => {
      connection.channel = event.channel;
      event.channel.onopen = () => send(event.channel, { type: 'hello', name: connection.name });
      event.channel.onmessage = messageEvent => {
        const message = parseLanMessage(messageEvent.data);
        if (!message) return;
        if (message.type === 'welcome') {
          connection.participantId = message.participantId;
          patchMembership(signal.room, { participantId: message.participantId, status: 'connected' });
        }
        if (message.type === 'snapshot' && message.room?.id === signal.room && Array.isArray(message.tracks)) {
          commitRooms([...roomsRef.current.filter(room => room.id !== signal.room), message.room], false);
          setRemoteTracks(all => ({ ...all, [signal.room]: message.tracks }));
          if (connection.participantId) patchMembership(signal.room, { status: 'connected' });
        }
      };
      event.channel.onclose = () => { if (!connection.closed) patchMembership(signal.room, { status: 'disconnected' }); };
    };
    peer.onconnectionstatechange = () => { if (['failed', 'closed'].includes(peer.connectionState) && !connection.closed) patchMembership(signal.room, { status: 'disconnected' }); };
    try {
      await peer.setRemoteDescription(signal.description);
      await peer.setLocalDescription(await peer.createAnswer());
      await waitForCandidates(peer);
      if (!peer.localDescription) throw new Error('Não foi possível preparar sua resposta.');
      const answer = encodeSignal(signal.room, peer.localDescription);
      patchMembership(signal.room, { answerCode: answer });
      return { roomId: signal.room, answer };
    } catch (error) {
      connection.closed = true;
      peer.close();
      throw error;
    }
  };
  const castVote = (roomId: string, trackId: string) => {
    const membership = membershipsRef.current[roomId];
    if (membership?.role === 'host') updateRoom(roomId, room => vote(room, membership.participantId, trackId, tracksRef.current.map(track => track.id)));
    else if (membership?.role === 'guest' && membership.status === 'connected') send(guestConnection.current?.channel, { type: 'vote', track: trackId });
  };
  const sendChat = (roomId: string, value: string) => {
    const text = value.trim().slice(0, 500);
    const membership = membershipsRef.current[roomId];
    if (!text || !membership) return;
    if (membership.role === 'host') {
      const name = roomsRef.current.find(room => room.id === roomId)?.participants.find(person => person.id === membership.participantId)?.name || 'Host';
      updateRoom(roomId, room => ({ ...room, chat: [...room.chat, { name, text }].slice(-100) }));
    } else if (membership.status === 'connected') send(guestConnection.current?.channel, { type: 'chat', text });
  };
  const removeParticipant = (roomId: string, participantId: string) => {
    if (membershipsRef.current[roomId]?.role !== 'host') return;
    for (const connection of hostConnections.current.values()) if (connection.roomId === roomId && connection.participant?.id === participantId) cleanupHostConnection(connection);
  };
  const leaveRoom = (roomId: string) => {
    const membership = membershipsRef.current[roomId];
    if (membership?.role !== 'guest') return;
    const connection = guestConnection.current;
    if (connection?.roomId === roomId) {
      send(connection.channel, { type: 'leave' });
      connection.closed = true;
      connection.peer.close();
      guestConnection.current = undefined;
    }
    const nextMemberships = { ...membershipsRef.current };
    delete nextMemberships[roomId];
    commitMemberships(nextMemberships);
    commitRooms(roomsRef.current.filter(room => room.id !== roomId), false);
    setRemoteTracks(all => { const next = { ...all }; delete next[roomId]; return next; });
  };
  const closeRoom = (roomId: string) => {
    if (membershipsRef.current[roomId]?.role !== 'host') return;
    for (const connection of [...hostConnections.current.values()]) if (connection.roomId === roomId) cleanupHostConnection(connection);
    const nextMemberships = { ...membershipsRef.current };
    delete nextMemberships[roomId];
    commitMemberships(nextMemberships);
    setInvites(all => all.filter(invite => invite.roomId !== roomId));
    commitRooms(roomsRef.current.filter(room => room.id !== roomId), false);
    if (activeRoom === roomId) { audio.current?.pause(); setActiveRoom(undefined); }
  };

  return { tracks, playlists, setPlaylists, favorites, favorite, rooms, memberships, remoteTracks, invites, creatingInvite, ready, current, playing, elapsed, duration, volume, setVolume, shuffle, setShuffle, repeat, setRepeat, play, toggle, skip, seek, importFiles, importing, notice, setNotice, removeTrack, activeRoom, setActiveRoom, finishRound, updateRoom, createRoom, createInvite, acceptAnswer, joinRoom, castVote, sendChat, removeParticipant, leaveRoom, closeRoom };
}
type MusicState = ReturnType<typeof useMusicState>;
const MusicContext = createContext<MusicState | null>(null);
export function MusicProvider({ children }: { children: ReactNode }) { const state = useMusicState(); return <MusicContext.Provider value={state}>{children}</MusicContext.Provider>; }
export function useMusic() { const state = useContext(MusicContext); if (!state) throw new Error('Music provider missing'); return state; }
