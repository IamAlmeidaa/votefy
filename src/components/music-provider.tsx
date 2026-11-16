import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { type Track, type Playlist, type Room } from '@/lib/music';

export type Membership = {
  role: 'host' | 'guest';
  participantId: string;
  status: 'waiting' | 'connected' | 'disconnected';
  answerCode?: string;
};
export type Invite = {
  id: string;
  roomId: string;
  code: string;
  status: 'waiting' | 'connecting' | 'connected';
  participantName?: string;
};

export type CloudTrack = Track & {
  mediaUrl: string;
  youtubeId: string | null;
  spotifyUri: string | null;
  coverUrl: string | null;
  votes: number;
};

export type CurrentUser = {
  id: string;
  username: string;
};

interface ApiSongRecord {
  id: number | string;
  title: string;
  artist: string;
  media_url: string;
  youtube_id: string | null;
  cover_url: string | null;
  votes: number;
  created_at: string;
}

interface YTPlayerInstance {
  loadVideoById: (videoId: string) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setVolume: (volume: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  destroy: () => void;
}

interface SpotifyEmbedController {
  loadUri: (uri: string) => void;
  loadEntity: (uri: string) => void;
  play: () => void;
  pause: () => void;
  seek: (milliseconds: number) => void;
  addListener: (event: string, callback: (event: { data: { isPaused?: boolean; duration?: number; position?: number } }) => void) => void;
}

interface SpotifyIframeApi {
  createController: (element: HTMLElement, options: { uri: string; width?: string; height?: string }, callback: (controller: SpotifyEmbedController) => void) => void;
}

declare global {
  interface Window {
    YT?: {
      Player: new (
        elementId: string,
        options: {
          height?: string | number;
          width?: string | number;
          videoId?: string;
          playerVars?: Record<string, number | string>;
          events?: {
            onReady?: () => void;
            onStateChange?: (event: { data: number }) => void;
            onError?: () => void;
          };
        }
      ) => YTPlayerInstance;
    };
    onYouTubeIframeAPIReady?: () => void;
    onSpotifyIframeApiReady?: (api: SpotifyIframeApi) => void;
  }
}

function getOrCreateClientUserId(): string {
  if (typeof window === 'undefined') return 'server-user';
  const key = 'votefy_user_id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

function mapSongToTrack(song: ApiSongRecord): CloudTrack {
  const spotifyMatch = song.media_url.match(/^https?:\/\/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(track|album|playlist|episode|show)\/([A-Za-z0-9]+)(?:[/?#]|$)/i);
  return {
    id: String(song.id),
    title: song.title || 'Música da Comunidade',
    artist: song.artist || 'Votefy',
    album: 'Comunidade Votefy',
    filename: song.media_url,
    duration: 0,
    file: new File([], song.title || 'stream'),
    cover: undefined,
    added: song.created_at ? new Date(song.created_at).getTime() : Date.now(),
    mediaUrl: song.media_url,
    youtubeId: song.youtube_id,
    spotifyUri: spotifyMatch ? `spotify:${spotifyMatch[1]!.toLowerCase()}:${spotifyMatch[2]}` : null,
    coverUrl: song.cover_url,
    votes: Number(song.votes) || 1,
  };
}

function useMusicState() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [userId, setUserId] = useState<string>(() => getOrCreateClientUserId());
  const [tracks, setTracks] = useState<CloudTrack[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [memberships, setMemberships] = useState<Record<string, Membership>>({});
  const [invites] = useState<Invite[]>([]);
  const [creatingInvite] = useState(false);
  const [ready, setReady] = useState(false);
  const [current, setCurrent] = useState<string>();
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [queue, setQueue] = useState<string[]>([]);
  const [activeRoom, setActiveRoom] = useState<string>();
  const [notice, setNotice] = useState('');
  const [importing, setImporting] = useState(false);

  const audio = useRef<HTMLAudioElement | null>(null);
  const ytPlayer = useRef<YTPlayerInstance | null>(null);
  const ytReady = useRef(false);
  const pendingYtId = useRef<string | null>(null);
  const spotifyApi = useRef<SpotifyIframeApi | null>(null);
  const spotifyController = useRef<SpotifyEmbedController | null>(null);
  const spotifyLoadedUri = useRef<string | null>(null);
  const pendingSpotifyUri = useRef<string | null>(null);
  const pendingSpotifyPlay = useRef(false);
  const spotifyEndedUri = useRef<string | null>(null);
  const playbackVersion = useRef(0);
  const tracksRef = useRef<CloudTrack[]>([]);
  const currentRef = useRef<string | undefined>(undefined);
  const volumeRef = useRef(volume);
  const roomsRef = useRef<Room[]>([]);
  const activeRoomRef = useRef<string | undefined>(undefined);
  const userIdRef = useRef<string>(userId);
  const onEndedRef = useRef<() => void>(() => {});

  currentRef.current = current;
  volumeRef.current = volume;
  activeRoomRef.current = activeRoom;
  userIdRef.current = userId;

  const upsertRoomInState = (room: Room) => {
    const activeUserId = userIdRef.current;
    const next = [...roomsRef.current.filter(r => r.id !== room.id), room];
    roomsRef.current = next;
    setRooms(next);

    const me = room.participants.find(p => p.id === activeUserId);
    if (me) {
      setMemberships(prev => ({
        ...prev,
        [room.id]: {
          role: room.admin === activeUserId ? 'host' : 'guest',
          participantId: activeUserId,
          status: 'connected',
        },
      }));
    }
  };

  const refreshTracks = async () => {
    try {
      const response = await fetch('/api/songs');
      if (!response.ok) return;
      const data = (await response.json()) as ApiSongRecord[];
      if (Array.isArray(data)) {
        const mapped = data.map(mapSongToTrack);
        tracksRef.current = mapped;
        setTracks(mapped);
      }
    } catch {
      // Silencia falhas temporárias
    }
  };

  const refreshRooms = async () => {
    try {
      const activeUserId = userIdRef.current;
      const response = await fetch(`/api/rooms?userId=${encodeURIComponent(activeUserId)}`);
      if (!response.ok) return;
      const data = (await response.json()) as Room[];
      if (Array.isArray(data)) {
        roomsRef.current = data;
        setRooms(data);
        const nextMemberships: Record<string, Membership> = {};
        for (const room of data) {
          if (room.participants.some(p => p.id === activeUserId)) {
            nextMemberships[room.id] = {
              role: room.admin === activeUserId ? 'host' : 'guest',
              participantId: activeUserId,
              status: 'connected',
            };
          }
        }
        setMemberships(nextMemberships);
      }
    } catch {
      // Silencia falhas temporárias
    }
  };

  const syncRoom = async (roomId: string): Promise<Room | null> => {
    try {
      const activeUserId = userIdRef.current;
      const response = await fetch(
        `/api/rooms?roomId=${encodeURIComponent(roomId)}&userId=${encodeURIComponent(activeUserId)}`
      );
      if (!response.ok) return null;
      const room = (await response.json()) as Room;
      upsertRoomInState(room);

      if (
        room.admin === activeUserId &&
        activeRoomRef.current === room.id &&
        room.current &&
        room.current !== currentRef.current
      ) {
        playLocalAudio(room.current, room.id);
      }

      return room;
    } catch {
      return null;
    }
  };

  // --- AUTENTICAÇÃO (NEON POSTGRES) ---
  const login = async (username: string, password: string) => {
    const response = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', username, password }),
    });
    const payload = (await response.json()) as CurrentUser & { error?: string };
    if (!response.ok) {
      throw new Error(payload.error || 'Não foi possível entrar.');
    }
    const session: CurrentUser = { id: payload.id, username: payload.username };
    setCurrentUser(session);
    setUserId(session.id);
    userIdRef.current = session.id;
    setNotice(`Bem-vindo de volta, ${session.username}!`);
    void refreshRooms();
    return session;
  };

  const register = async (username: string, password: string, confirmPassword: string) => {
    const response = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'register', username, password, confirmPassword }),
    });
    const payload = (await response.json()) as CurrentUser & { error?: string };
    if (!response.ok) {
      throw new Error(payload.error || 'Não foi possível criar a conta.');
    }
    const session: CurrentUser = { id: payload.id, username: payload.username };
    setCurrentUser(session);
    setUserId(session.id);
    userIdRef.current = session.id;
    setNotice(`Conta criada! Você entrou como ${session.username}.`);
    void refreshRooms();
    return session;
  };

  const logout = () => {
    void fetch('/api/auth', { method: 'DELETE' });
    const guestId = getOrCreateClientUserId();
    setCurrentUser(null);
    setUserId(guestId);
    userIdRef.current = guestId;
    setNotice('Você saiu da sua conta.');
    void refreshRooms();
  };

  useEffect(() => {
    const createPlayer = () => {
      if (!window.YT?.Player || ytPlayer.current || !document.getElementById('votefy-yt-player')) return;
      ytPlayer.current = new window.YT.Player('votefy-yt-player', {
        height: '200',
        width: '200',
        playerVars: {
          autoplay: 1,
          controls: 1,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
        },
        events: {
          onReady: () => {
            ytReady.current = true;
            ytPlayer.current?.setVolume(Math.round(volumeRef.current * 100));
            if (pendingYtId.current) {
              ytPlayer.current?.loadVideoById(pendingYtId.current);
              pendingYtId.current = null;
            }
          },
          onStateChange: event => {
            if (event.data === 1) setPlaying(true);
            if (event.data === 2) setPlaying(false);
            if (event.data === 0) onEndedRef.current();
          },
          onError: () => {
            setNotice('Este vídeo do YouTube bloqueou reprodução incorporada. Tente outro link.');
            setPlaying(false);
          },
        },
      });
    };

    if (window.YT?.Player) {
      createPlayer();
    } else {
      window.onYouTubeIframeAPIReady = createPlayer;
      if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.body.appendChild(tag);
      }
    }

    window.onSpotifyIframeApiReady = api => {
      spotifyApi.current = api;
      const pendingUri = pendingSpotifyUri.current;
      if (pendingUri) {
        const element = document.getElementById('votefy-spotify-player');
        if (element && !spotifyController.current) createSpotifyController(api, element, pendingUri);
      }
    };
    if (!document.querySelector('script[src="https://open.spotify.com/embed/iframe-api/v1"]')) {
      const tag = document.createElement('script');
      tag.src = 'https://open.spotify.com/embed/iframe-api/v1';
      tag.async = true;
      document.body.appendChild(tag);
    }
  }, []);

  function createSpotifyController(api: SpotifyIframeApi, element: HTMLElement, uri: string) {
    api.createController(element, { uri, width: '100%', height: '152' }, controller => {
      spotifyController.current = controller;
      spotifyLoadedUri.current = uri;
      controller.addListener('playback_update', event => {
        if (typeof event.data.isPaused === 'boolean') setPlaying(!event.data.isPaused);
        if (typeof event.data.position === 'number') setElapsed(event.data.position / 1000);
        if (typeof event.data.duration === 'number') setDuration(event.data.duration / 1000);
        if (event.data.duration && typeof event.data.position === 'number' && event.data.position >= event.data.duration - 500 && spotifyEndedUri.current !== spotifyLoadedUri.current) {
          spotifyEndedUri.current = spotifyLoadedUri.current;
          onEndedRef.current();
        }
      });
      if (pendingSpotifyPlay.current) {
        pendingSpotifyPlay.current = false;
        controller.play();
      }
    });
  }

  function playSpotifyTrack(uri: string) {
    pendingSpotifyUri.current = uri;
    spotifyEndedUri.current = null;
    pendingSpotifyPlay.current = true;
    if (!spotifyController.current) {
      const element = document.getElementById('votefy-spotify-player');
      if (element && spotifyApi.current) createSpotifyController(spotifyApi.current, element, uri);
      else setNotice('Carregando o player do Spotify… tente reproduzir novamente em instantes.');
      return;
    }
    if (spotifyLoadedUri.current !== uri) {
      spotifyController.current.loadUri(uri);
      spotifyLoadedUri.current = uri;
    }
    spotifyController.current.play();
    pendingSpotifyPlay.current = false;
  }

  useEffect(() => {
    const activeTrack = tracks.find(t => t.id === current);
    if (!playing || !activeTrack?.youtubeId) return;
    const timer = setInterval(() => {
      if (ytPlayer.current && ytReady.current) {
        const cur = ytPlayer.current.getCurrentTime();
        const dur = ytPlayer.current.getDuration();
        if (Number.isFinite(cur)) setElapsed(cur);
        if (Number.isFinite(dur) && dur > 0) setDuration(dur);
      }
    }, 500);
    return () => clearInterval(timer);
  }, [playing, current, tracks]);

  useEffect(() => {
    audio.current = new Audio();
    const element = audio.current;
    element.ontimeupdate = () => setElapsed(element.currentTime);
    element.onloadedmetadata = () => setDuration(element.duration);
    element.onplay = () => setPlaying(true);
    element.onpause = () => setPlaying(false);
    element.onerror = () => setNotice('Este link de áudio não pôde ser reproduzido.');

    try {
      localStorage.removeItem('votefy_auth_user');
      const state = JSON.parse(localStorage.getItem('onda-state') || '{}');
      setPlaylists(state.playlists || []);
      setFavorites(state.favorites || []);
      setVolume(state.volume ?? 0.7);
      setShuffle(state.shuffle || false);
      setRepeat(state.repeat || false);
    } catch {
      setNotice('Não foi possível recuperar as preferências salvas.');
    }

    const restoreSession = async () => {
      try {
        const response = await fetch('/api/auth', { cache: 'no-store' });
        if (response.ok) {
          const payload = (await response.json()) as { user?: CurrentUser | null };
          if (payload.user?.id && payload.user.username) {
            setCurrentUser(payload.user);
            setUserId(payload.user.id);
            userIdRef.current = payload.user.id;
          }
        }
      } catch {
        // A navegação como visitante continua disponível se a restauração falhar.
      }
    };

    void restoreSession().finally(() => {
      void Promise.all([refreshTracks(), refreshRooms()]).finally(() => setReady(true));
    });
    const syncInterval = setInterval(() => {
      void refreshTracks();
      void refreshRooms();
    }, 5000);

    return () => {
      clearInterval(syncInterval);
      element.pause();
      element.src = '';
    };
  }, []);

  useEffect(() => {
    if (ready) {
      try {
        localStorage.setItem('onda-state', JSON.stringify({ playlists, favorites, volume, shuffle, repeat }));
      } catch {
        setNotice('Não foi possível salvar preferências locais.');
      }
    }
  }, [ready, playlists, favorites, volume, shuffle, repeat]);

  useEffect(() => {
    if (audio.current) audio.current.volume = volume;
    if (ytPlayer.current && ytReady.current) ytPlayer.current.setVolume(Math.round(volume * 100));
  }, [volume]);

  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);

  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(''), 6500);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [notice]);

  const playLocalAudio = (id: string, roomId?: string, ids?: string[]) => {
    const track = tracksRef.current.find(item => item.id === id);
    if (!track) return;
    playbackVersion.current++;
    const version = playbackVersion.current;

    setCurrent(id);
    currentRef.current = id;
    setElapsed(0);
    setDuration(track.duration || 0);
    setActiveRoom(roomId);
    activeRoomRef.current = roomId;
    if (ids) setQueue(ids);

    if (track.youtubeId) {
      audio.current?.pause();
      spotifyController.current?.pause();
      if (ytPlayer.current && ytReady.current) {
        ytPlayer.current.loadVideoById(track.youtubeId);
      } else {
        pendingYtId.current = track.youtubeId;
      }
      setPlaying(true);
    } else if (track.spotifyUri) {
      audio.current?.pause();
      if (ytPlayer.current && ytReady.current) {
        try {
          ytPlayer.current.pauseVideo();
        } catch {
          /* ignore */
        }
      }
      playSpotifyTrack(track.spotifyUri);
    } else if (audio.current) {
      spotifyController.current?.pause();
      if (ytPlayer.current && ytReady.current) {
        try { ytPlayer.current.pauseVideo(); } catch { /* ignore */ }
      }
      audio.current.src = track.mediaUrl;
      audio.current.play().catch(error => {
        if (version === playbackVersion.current && error.name !== 'AbortError') {
          setNotice('Reprodução indisponível para este link.');
        }
      });
    }
  };

  const play = (id: string, ids?: string[], roomId?: string) => {
    playLocalAudio(id, roomId, ids);
    if (roomId) {
      void fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'next', roomId, trackId: id, userId: userIdRef.current }),
      })
        .then(r => (r.ok ? r.json() : null))
        .then((updated: Room | null) => {
          if (updated) upsertRoomInState(updated);
        });
    }
  };

  const finishRound = async (id: string, manual?: string) => {
    const response = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'next', roomId: id, trackId: manual, userId: userIdRef.current }),
    });
    const payload = (await response.json()) as Room & { error?: string };
    if (!response.ok) {
      setNotice(payload.error || 'Adicione mais músicas para iniciar outra rodada.');
      return;
    }
    upsertRoomInState(payload);
    if (payload.current && payload.admin === userIdRef.current) {
      playLocalAudio(payload.current, id);
    }
  };

  const skip = (direction = 1) => {
    if (activeRoom && direction === 1) {
      void finishRound(activeRoom);
      return;
    }
    const ids = (queue.length ? queue : tracksRef.current.map(track => track.id)).filter(id =>
      tracksRef.current.some(track => track.id === id)
    );
    if (!ids.length) return;
    const index = ids.indexOf(currentRef.current || '');
    const next =
      ids[shuffle ? Math.floor(Math.random() * ids.length) : (index + direction + ids.length) % ids.length];
    if (next) play(next, ids);
  };

  onEndedRef.current = () => {
    const activeTrack = tracksRef.current.find(t => t.id === currentRef.current);
    if (activeRoom) {
      void finishRound(activeRoom);
    } else if (repeat) {
      if (activeTrack?.youtubeId && ytPlayer.current && ytReady.current) {
        ytPlayer.current.seekTo(0, true);
        ytPlayer.current.playVideo();
      } else if (activeTrack?.spotifyUri && spotifyController.current) {
        spotifyEndedUri.current = null;
        spotifyController.current.seek(0);
        spotifyController.current.play();
      } else if (audio.current) {
        audio.current.currentTime = 0;
        void audio.current.play();
      }
    } else {
      skip();
    }
  };

  useEffect(() => {
    if (audio.current) audio.current.onended = () => onEndedRef.current();
  }, []);

  useEffect(() => {
    if (!currentUser || !playing) return;
    const interval = setInterval(() => {
      void fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'listen' }),
      }).catch(() => {});
    }, 60_000);
    return () => clearInterval(interval);
  }, [currentUser, playing]);

  const toggle = () => {
    const activeTrack = tracksRef.current.find(t => t.id === currentRef.current);
    if (!activeTrack) {
      const first = tracksRef.current[0];
      if (first) play(first.id);
      return;
    }
    if (activeTrack.youtubeId && ytPlayer.current && ytReady.current) {
      if (playing) ytPlayer.current.pauseVideo();
      else ytPlayer.current.playVideo();
      return;
    }
    if (activeTrack.spotifyUri && spotifyController.current) {
      if (playing) spotifyController.current.pause();
      else spotifyController.current.play();
      return;
    }
    if (!audio.current) return;
    if (playing) audio.current.pause();
    else audio.current.play().catch(() => setNotice('Não foi possível reproduzir este link.'));
  };

  const seek = (value: number) => {
    const activeTrack = tracksRef.current.find(t => t.id === currentRef.current);
    if (activeTrack?.youtubeId && ytPlayer.current && ytReady.current) {
      ytPlayer.current.seekTo(value, true);
      setElapsed(value);
      return;
    }
    if (activeTrack?.spotifyUri && spotifyController.current) {
      spotifyController.current.seek(value * 1000);
      setElapsed(value);
      return;
    }
    if (audio.current && Number.isFinite(audio.current.duration)) {
      audio.current.currentTime = value;
      setElapsed(value);
    }
  };

  const addSongByUrl = async (mediaUrl: string, customTitle?: string) => {
    setImporting(true);
    try {
      const response = await fetch('/api/songs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaUrl, title: customTitle }),
      });

      const payload = (await response.json()) as ApiSongRecord & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Não foi possível salvar a música.');
      }

      const savedTrack = mapSongToTrack(payload);
      setTracks(prev => [savedTrack, ...prev.filter(item => item.id !== savedTrack.id)]);
      setNotice(`"${savedTrack.title}" salva na nuvem para todos ouvirem!`);
      return savedTrack;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro ao salvar música na Neon.';
      setNotice(msg);
      throw error;
    } finally {
      setImporting(false);
    }
  };

  const voteSong = async (id: string) => {
    try {
      const response = await fetch('/api/songs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'vote', id: Number(id) }),
      });
      if (response.ok) {
        const updated = (await response.json()) as ApiSongRecord;
        setTracks(prev =>
          prev
            .map(t => (t.id === id ? { ...t, votes: Number(updated.votes) } : t))
            .sort((a, b) => b.votes - a.votes)
        );
        setNotice('Voto registrado!');
      }
    } catch {
      setNotice('Não foi possível registrar o voto agora.');
    }
  };

  const removeTrack = async (id: string) => {
    setTracks(all => all.filter(track => track.id !== id));
    setFavorites(all => all.filter(trackId => trackId !== id));
    setPlaylists(all => all.map(playlist => ({ ...playlist, tracks: playlist.tracks.filter(trackId => trackId !== id) })));
    if (current === id) {
      audio.current?.pause();
      if (ytPlayer.current && ytReady.current) {
        try {
          ytPlayer.current.stopVideo();
        } catch {
          /* ignore */
        }
      }
      setCurrent(undefined);
      setPlaying(false);
    }
  };

  const favorite = (id: string) =>
    setFavorites(all => (all.includes(id) ? all.filter(trackId => trackId !== id) : [...all, id]));

  // --- SALAS MUSICAIS (NEON POSTGRES) ---
  const createRoom = async (name: string, hostName: string) => {
    const response = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', name, userId: userIdRef.current, userName: hostName }),
    });
    const payload = (await response.json()) as Room & { error?: string };
    if (!response.ok) throw new Error(payload.error || 'Erro ao criar sala.');
    upsertRoomInState(payload);
    return payload.id;
  };

  const joinRoom = async (code: string, name: string) => {
    const response = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'join', roomId: code, userId: userIdRef.current, userName: name }),
    });
    const payload = (await response.json()) as Room & { error?: string };
    if (!response.ok) throw new Error(payload.error || 'Não foi possível entrar na sala.');
    upsertRoomInState(payload);
    return { roomId: payload.id };
  };

  const castVote = async (roomId: string, trackId: string, isGolden = false) => {
    const response = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'vote', roomId, userId: userIdRef.current, trackId, isGolden }),
    });
    const payload = (await response.json()) as Room & { error?: string };
    if (!response.ok) {
      setNotice(payload.error || 'Não foi possível votar.');
      return;
    }
    upsertRoomInState(payload);
    if (isGolden) setNotice('Voto de Ouro (+3) aplicado!');
  };

  const voteSkip = async (roomId: string) => {
    const response = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'skipVote', roomId, userId: userIdRef.current }),
    });
    const payload = (await response.json()) as { room: Room; skipped: boolean; error?: string };
    if (!response.ok) {
      setNotice(payload.error || 'Não foi possível registrar o voto de skip.');
      return;
    }
    upsertRoomInState(payload.room);
    if (payload.skipped) {
      setNotice('70% atingido! Pulando para a próxima música...');
      if (payload.room.admin === userIdRef.current && activeRoomRef.current === roomId && payload.room.current) {
        playLocalAudio(payload.room.current, roomId);
      }
    }
  };

  const controlRoom = async (
    roomId: string,
    patch: {
      open?: boolean;
      rerollOptions?: boolean;
      clearVotes?: boolean;
      addToQueue?: string;
      removeFromQueueIndex?: number;
    }
  ) => {
    const response = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'controls', roomId, patch, userId: userIdRef.current }),
    });
    const payload = (await response.json()) as Room & { error?: string };
    if (!response.ok) {
      setNotice(payload.error || 'Erro ao atualizar controles da sala.');
      return;
    }
    upsertRoomInState(payload);
  };

  const sendChat = async (roomId: string, value: string) => {
    const text = value.trim().slice(0, 500);
    if (!text) return;
    const response = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'chat', roomId, userId: userIdRef.current, text }),
    });
    const payload = (await response.json()) as Room & { error?: string };
    if (response.ok) upsertRoomInState(payload);
  };

  const removeParticipant = async (roomId: string, participantId: string) => {
    await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'leave', roomId, userId: userIdRef.current, targetUserId: participantId }),
    });
    await syncRoom(roomId);
  };

  const leaveRoom = async (roomId: string) => {
    await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'leave', roomId, userId: userIdRef.current }),
    });
    setMemberships(prev => {
      const next = { ...prev };
      delete next[roomId];
      return next;
    });
    setRooms(prev => prev.filter(r => r.id !== roomId));
  };

  const closeRoom = async (roomId: string) => {
    await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'close', roomId, userId: userIdRef.current }),
    });
    setMemberships(prev => {
      const next = { ...prev };
      delete next[roomId];
      return next;
    });
    setRooms(prev => prev.filter(r => r.id !== roomId));
    if (activeRoom === roomId) {
      audio.current?.pause();
      setActiveRoom(undefined);
    }
  };

  return {
    userId,
    currentUser,
    login,
    register,
    logout,
    tracks,
    playlists,
    setPlaylists,
    favorites,
    favorite,
    rooms,
    setRooms,
    memberships,
    remoteTracks: {} as Record<string, CloudTrack[]>,
    invites,
    creatingInvite,
    ready,
    current,
    playing,
    elapsed,
    duration,
    volume,
    setVolume,
    shuffle,
    setShuffle,
    repeat,
    setRepeat,
    play,
    toggle,
    skip,
    seek,
    addSongByUrl,
    voteSong,
    refreshTracks,
    importing,
    notice,
    setNotice,
    removeTrack,
    activeRoom,
    setActiveRoom,
    finishRound,
    syncRoom,
    controlRoom,
    createRoom,
    createInvite: async () => '',
    acceptAnswer: async () => {},
    joinRoom,
    castVote,
    voteSkip,
    sendChat,
    removeParticipant,
    leaveRoom,
    closeRoom,
  };
}

type MusicState = ReturnType<typeof useMusicState>;
const MusicContext = createContext<MusicState | null>(null);

export function MusicProvider({ children }: { children: ReactNode }) {
  const state = useMusicState();
  return <MusicContext.Provider value={state}>{children}</MusicContext.Provider>;
}

export function useMusic() {
  const state = useContext(MusicContext);
  if (!state) throw new Error('Music provider missing');
  return state;
}
