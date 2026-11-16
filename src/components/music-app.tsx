import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { Home, Search, Library, Heart, ListMusic, Radio, Plus, Link2, ChevronLeft, ChevronRight, Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Volume2, VolumeX, Music2, ArrowUpRight, MoreHorizontal, Menu, X, Trash2, Send, Users, Check, Headphones, Globe, Clock, LogOut, ThumbsUp, UserRound, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useMusic, type CloudTrack } from './music-provider';
import { Artwork } from './artwork';
import { candidates, vote, time, type Room } from '@/lib/music';
import { AuthButton, AuthForm } from '@/components/auth-modal';
import hero from '@/assets/music-cover.jpg';

export function IconButton({ label, children, onClick, active, disabled, className = '' }: { label: string; children: ReactNode; onClick?: () => void; active?: boolean; disabled?: boolean; className?: string }) {
  return <Button variant="ghost" size="icon" title={label} aria-label={label} onClick={onClick} disabled={disabled} className={`${active ? 'text-primary' : 'muted-control'} ${className}`}>{children}</Button>;
}

function TrackCover({ track, index = 0 }: { track: CloudTrack; index?: number }) {
  const [imgFailed, setImgFailed] = useState(false);
  if (track.coverUrl && !imgFailed) {
    return (
      <img
        src={track.coverUrl}
        alt={track.title}
        className="w-full h-full object-cover"
        onError={() => setImgFailed(true)}
      />
    );
  }
  return <Artwork cover={track.cover} art={index} />;
}

function parseAccentColor(value: string): string | null {
  const color = value.trim();
  const hex = color.match(/^#?([\da-f]{3}|[\da-f]{6})$/i);
  if (hex) {
    const raw = hex[1]!.length === 3 ? [...hex[1]!].map(char => char + char).join('') : hex[1]!;
    return `#${raw.toLowerCase()}`;
  }
  const rgb = color.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i)
    ?? color.match(/^(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})$/);
  if (!rgb) return null;
  const channels = rgb.slice(1, 4).map(Number);
  if (channels.some(channel => channel < 0 || channel > 255)) return null;
  return `#${channels.map(channel => channel.toString(16).padStart(2, '0')).join('')}`;
}

function hexToRgb(value: string): string {
  const hex = parseAccentColor(value) || '#f04452';
  const channels = hex.slice(1).match(/.{2}/g)!.map(channel => parseInt(channel, 16));
  return channels.join(', ');
}

export function MusicShell({ children }: { children: ReactNode }) {
  const m = useMusic();
  const nav = useNavigate();
  const path = useRouterState({ select: s => s.location.pathname });
  const [mobile, setMobile] = useState(false);
  const [query, setQuery] = useState('');
  const [queueOpen, setQueueOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [mediaUrl, setMediaUrl] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [accentHex, setAccentHex] = useState(m.accentColor);
  const [accentRgb, setAccentRgb] = useState(() => hexToRgb(m.accentColor));
  useEffect(() => { setAccentHex(m.accentColor); setAccentRgb(hexToRgb(m.accentColor)); }, [m.accentColor]);
  const updateAccent = (value: string) => {
    const hex = parseAccentColor(value);
    if (!hex) return false;
    m.setAccentColor(hex);
    return true;
  };
  if (path === '/') {
    if (!m.ready || !m.currentUser) {
      return (
        <main className="auth-page">
          <div className="auth-page-top"><span /><Link className="auth-brand" to="/" aria-label="Votefy início"><span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>Votefy</Link></div>
          <section className="auth-card" aria-labelledby="auth-title">
            <div className="auth-card-heading"><span className="auth-icon"><Radio size={21} /></span><span className="eyebrow">Sua comunidade musical</span><h1 id="auth-title">Sua música. Sua conta.</h1><p>Entre para votar, criar salas e curtir música junto com todo mundo.</p></div>
            {!m.ready ? <div className="auth-loading" role="status">Carregando sua conta…</div> : <AuthForm />}
            <p className="auth-privacy"><ShieldCheck size={14} /> Acesso protegido em conexão segura</p>
          </section>
          <p className="auth-footer">Votefy <span>·</span> Música é melhor quando compartilhada.</p>
        </main>
      );
    }
  }

  const track = m.tracks.find(t => t.id === m.current);
  const items = [
    { to: '/', label: 'Início', icon: Home },
    { to: '/search', label: 'Buscar músicas', icon: Search },
    { to: '/library', label: 'Biblioteca da comunidade', icon: Library },
    { to: '/favorites', label: 'Músicas favoritas', icon: Heart },
    { to: '/playlists', label: 'Playlists', icon: ListMusic },
    { to: '/rooms', label: 'Salas musicais', icon: Radio },
  ] as const;

  const handleSaveLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mediaUrl.trim()) return;
    try {
      const saved = await m.addSongByUrl(mediaUrl.trim(), customTitle.trim() || undefined);
      setMediaUrl('');
      setCustomTitle('');
      setAddOpen(false);
      m.play(saved.id);
    } catch {
      // Aviso já exibido pelo MusicProvider
    }
  };

  return (
    <div className="app-shell">
      <button type="button" data-open-add-song hidden onClick={() => setAddOpen(true)} />

      <aside className={`sidebar ${mobile ? 'mobile-open' : ''}`}>
        <Link to="/" className="brand" onClick={() => setMobile(false)}>
          <span className="brand-mark"><i/><i/><i/><i/><i/></span>Votefy<span className="text-primary">.</span>
        </Link>
        <nav>
          {items.slice(0, 3).map(item => (
            <Link key={item.to} to={item.to} className={`nav-link ${path === item.to ? 'active' : ''}`} onClick={() => setMobile(false)}>
              <item.icon/>{item.label}
            </Link>
          ))}
          <div className="nav-divider"/>
          <div className="nav-label">Sua coleção</div>
          {items.slice(3).map(item => (
            <Link key={item.to} to={item.to} className={`nav-link ${path.startsWith(item.to) ? 'active' : ''}`} onClick={() => setMobile(false)}>
              <item.icon/>{item.label}
              {item.to === '/rooms' && <span className="small-tag ml-auto">AO VIVO</span>}
            </Link>
          ))}
        </nav>
        <div className="nav-divider"/>
        <div className="flex justify-between items-center px-3">
          <span className="nav-label !m-0">Suas playlists</span>
          <IconButton label="Criar playlist" onClick={() => void nav({ to: '/playlists', search: { create: true } })}><Plus/></IconButton>
        </div>
        <div className="sidebar-playlists">
          {m.playlists.slice(0, 5).map(p => (
            <Link to="/playlists/$playlistId" params={{ playlistId: p.id }} key={p.id} onClick={() => setMobile(false)}>{p.name}</Link>
          ))}
          {!m.playlists.length && <span>Sua próxima seleção começa aqui</span>}
        </div>
        <div className="sidebar-bottom">
          <Button className="w-full" onClick={() => setAddOpen(true)} disabled={m.importing}>
            <Plus/>{m.importing ? 'Salvando...' : 'Adicionar música'}
          </Button>
          <div className="local-label"><Globe size={13}/>Salvo na nuvem · Neon DB</div>
        </div>
      </aside>

      <header className="topbar">
        <IconButton label={mobile ? 'Fechar menu' : 'Abrir menu'} className="mobile-menu" onClick={() => setMobile(!mobile)}>
          {mobile ? <X/> : <Menu/>}
        </IconButton>
        <div className="desktop-arrows flex gap-1">
          <IconButton label="Voltar" onClick={() => window.history.back()}><ChevronLeft/></IconButton>
          <IconButton label="Avançar" onClick={() => window.history.forward()}><ChevronRight/></IconButton>
        </div>
        <div className="search-box">
          <Search size={17}/>
          <input
            aria-label="Buscar músicas"
            placeholder="O que você quer ouvir?"
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              void nav({ to: '/search', search: { q: e.target.value } });
            }}
          />
        </div>
        <div className="topbar-right">
          <span className="local-badge"><span className="status-dot"/>Sincronizado</span>
          <div className="accent-picker" role="group" aria-label="Personalizar cor do site">
            <label className="color-wheel-label" title="Escolher cor"><input aria-label="Roda de cores" type="color" value={m.accentColor} onChange={event => updateAccent(event.target.value)} /></label>
            <label className="accent-input-label"><span>HEX</span><input aria-label="Código hexadecimal da cor" value={accentHex} maxLength={7} spellCheck={false} onChange={event => { setAccentHex(event.target.value); if (updateAccent(event.target.value)) setAccentRgb(hexToRgb(event.target.value)); }} onBlur={() => { const hex = parseAccentColor(accentHex); if (hex) setAccentHex(hex); else setAccentHex(m.accentColor); }} /></label>
            <label className="accent-input-label rgb-input"><span>RGB</span><input aria-label="Valores RGB da cor" value={accentRgb} spellCheck={false} onChange={event => { setAccentRgb(event.target.value); updateAccent(event.target.value); }} onBlur={() => { const hex = parseAccentColor(accentRgb); if (hex) { setAccentHex(hex); setAccentRgb(hexToRgb(hex)); } else setAccentRgb(hexToRgb(m.accentColor)); }} /></label>
          </div>
          <Button variant="outline" className="upload-top" size="sm" onClick={() => setAddOpen(true)}>
            <Link2/>Adicionar link
          </Button>
          {m.currentUser ? (
            <Link to="/login" className="profile-top-link" aria-label="Abrir meu perfil">
              <UserRound size={15} /> Perfil
            </Link>
          ) : <AuthButton />}
        </div>
      </header>

      {children}

      <div aria-hidden="true" className="yt-audio-host"><div id="votefy-yt-player" /></div>
      <div className={`spotify-embed-host ${track?.spotifyUri ? 'spotify-embed-active' : ''}`} aria-label={track?.spotifyUri ? 'Player Spotify' : undefined}>
        <div id="votefy-spotify-player" />
      </div>

      <footer className="player">
        <div className="now-track">
          {track ? (
            <div className="w-12 h-12 rounded-md overflow-hidden shrink-0">
              <TrackCover track={track} index={m.tracks.indexOf(track)} />
            </div>
          ) : (
            <div className="room-symbol"><Music2 size={22}/></div>
          )}
          <div className="now-text">
            <strong>{track?.title || 'Sua trilha começa aqui'}</strong>
            <span>{track?.artist || 'Escolha uma música da comunidade'}</span>
          </div>
          <IconButton
            label="Favoritar música atual"
            active={!!track && m.favorites.includes(track.id)}
            disabled={!track}
            onClick={() => track && m.favorite(track.id)}
          >
            <Heart fill={track && m.favorites.includes(track.id) ? 'currentColor' : 'none'}/>
          </IconButton>
        </div>

        <div className="player-center">
          <div className="play-controls">
            <IconButton label="Aleatório" active={m.shuffle} onClick={() => m.setShuffle(!m.shuffle)} className="optional-control">
              <Shuffle size={15}/>
            </IconButton>
            <IconButton label="Música anterior" disabled={!m.tracks.length} onClick={() => m.skip(-1)}>
              <SkipBack fill="currentColor"/>
            </IconButton>
            <Button
              variant="ghost"
              size="icon"
              className="main-play"
              aria-label={m.playing ? 'Pausar' : 'Reproduzir'}
              disabled={!m.tracks.length}
              onClick={m.toggle}
            >
              {m.playing ? <Pause fill="currentColor"/> : <Play fill="currentColor"/>}
            </Button>
            <IconButton label="Próxima música" disabled={!m.tracks.length} onClick={() => m.skip()}>
              <SkipForward fill="currentColor"/>
            </IconButton>
            <IconButton label="Repetir música" active={m.repeat} onClick={() => m.setRepeat(!m.repeat)} className="optional-control">
              <Repeat/>
            </IconButton>
          </div>
          <div className="timeline">
            <span>{time(m.elapsed)}</span>
            <input
              aria-label="Progresso da música"
              type="range"
              min="0"
              max={m.duration || 1}
              step=".1"
              value={Math.min(m.elapsed, m.duration || 1)}
              onChange={e => m.seek(Number(e.target.value))}
              disabled={!track}
            />
            <span>{time(m.duration)}</span>
          </div>
        </div>

        <div className={`volume-control ${track?.spotifyUri ? 'spotify-volume' : ''}`}>
          {track?.spotifyUri && <span className="spotify-volume-note">Volume pelo player Spotify</span>}
          <IconButton label="Fila de reprodução" onClick={() => setQueueOpen(true)}><ListMusic/></IconButton>
          <IconButton label={m.volume ? 'Silenciar' : 'Ativar som'} onClick={() => m.setVolume(m.volume ? 0 : .7)}>
            {m.volume ? <Volume2/> : <VolumeX/>}
          </IconButton>
          <input
            aria-label="Volume"
            type="range"
            min="0"
            max="1"
            step=".01"
            value={m.volume}
            onChange={e => m.setVolume(Number(e.target.value))}
          />
        </div>
      </footer>

      {m.notice && <div className="notice" role="status">{m.notice}</div>}

      {/* Modal para adicionar música por link (YouTube ou URL direta) */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogTitle>Adicionar música à comunidade</DialogTitle>
          <DialogDescription>
            Adicione um link do YouTube, Spotify ou um endereço direto de áudio compatível.
          </DialogDescription>
          <p className="text-xs text-muted-foreground">Links do Spotify usam o player oficial. Links de outros serviços devem apontar diretamente para um arquivo ou stream de áudio.</p>
          <form className="dialog-form" onSubmit={handleSaveLink}>
            <label>
              Link da música (YouTube, Spotify ou áudio)
              <Input
                type="url"
                placeholder="https://open.spotify.com/track/..."
                aria-label="Link da música"
                required
                value={mediaUrl}
                onChange={e => setMediaUrl(e.target.value)}
              />
            </label>
            <label>
              Nome da música (opcional)
              <Input
                placeholder="Deixe vazio para preencher automaticamente"
                aria-label="Nome da música"
                maxLength={120}
                value={customTitle}
                onChange={e => setCustomTitle(e.target.value)}
              />
            </label>
            <Button type="submit" disabled={m.importing}>
              <Plus/>{m.importing ? 'Salvando na nuvem...' : 'Salvar e ouvir agora'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={queueOpen} onOpenChange={setQueueOpen}>
        <DialogContent>
          <DialogTitle>Fila de reprodução</DialogTitle>
          <DialogDescription>Músicas salvas na comunidade</DialogDescription>
          <div className="add-list">
            {m.tracks.map(t => (
              <div key={t.id} className="add-row">
                <IconButton label={`Tocar ${t.title}`} onClick={() => m.play(t.id)}><Play/></IconButton>
                <span className="truncate">{t.title}</span>
                {t.id === m.current && <span className="text-primary ml-auto">Tocando</span>}
              </div>
            ))}
            {!m.tracks.length && <p className="text-sm text-muted-foreground">Nenhuma música salva ainda.</p>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SectionHeading({ title, icon, to }: { title: string; icon?: ReactNode; to?: '/' | '/library' | '/favorites' | '/playlists' | '/rooms' }) {
  return (
    <div className="section-heading">
      <h2>{icon}{title}</h2>
      {to && <Link to={to}>Ver tudo <ChevronRight size={12} className="inline"/></Link>}
    </div>
  );
}

function ImportButton({ label = 'Adicionar música', variant = 'default' }: { label?: string; variant?: 'default' | 'outline' }) {
  return (
    <Button
      variant={variant}
      onClick={() => document.querySelector<HTMLButtonElement>('[data-open-add-song]')?.click()}
    >
      <Plus/>{label}
    </Button>
  );
}

function Empty({ title = 'A biblioteca da comunidade está vazia', description = 'Adicione um link do YouTube, Spotify ou áudio direto para todo mundo ouvir.' }: { title?: string; description?: string | undefined }) {
  return (
    <div className="empty-state">
      <Headphones/>
      <h2>{title}</h2>
      <p>{description}</p>
      <ImportButton/>
    </div>
  );
}

export function TrackCard({ track, index = 0 }: { track: CloudTrack; index?: number }) {
  const m = useMusic();
  return (
    <article className="music-card">
      <div className="cover-wrap">
        <TrackCover track={track} index={index}/>
        <Button size="icon" className="card-play" aria-label={`Tocar ${track.title}`} onClick={() => m.play(track.id)}>
          <Play fill="currentColor"/>
        </Button>
      </div>
      <div className="flex items-center gap-1">
        <div className="card-title flex-1">{track.title}</div>
        <IconButton label={`Votar em ${track.title}`} onClick={() => void m.voteSong(track.id)}>
          <ThumbsUp size={15}/>
        </IconButton>
        <IconButton label={`Favoritar ${track.title}`} active={m.favorites.includes(track.id)} onClick={() => m.favorite(track.id)}>
          <Heart fill={m.favorites.includes(track.id) ? 'currentColor' : 'none'}/>
        </IconButton>
      </div>
      <p className="card-description">{track.artist} · {track.votes} {track.votes === 1 ? 'voto' : 'votos'}</p>
    </article>
  );
}

export function HomePage() {
  const m = useMusic();
  const recent = [...m.tracks].sort((a, b) => b.added - a.added).slice(0, 4);
  const favorites = m.tracks.filter(t => m.favorites.includes(t.id));

  return (
    <main className="page">
      <div className="greeting">
        <div>
          <h1>Entre na sua onda.</h1>
          <p>Adicione links, vote nas melhores e ouça junto com a galera.</p>
        </div>
        <span className="eyebrow">STREAMING COMPARTILHADO</span>
      </div>

      <div className="tabs-row">
        <Button size="sm" className="pill">Tudo</Button>
        <Button variant="secondary" size="sm" asChild className="pill"><Link to="/library">Músicas</Link></Button>
        <Button variant="secondary" size="sm" asChild className="pill"><Link to="/playlists">Playlists</Link></Button>
        <Button variant="secondary" size="sm" asChild className="pill"><Link to="/rooms">Salas musicais</Link></Button>
      </div>

      <section className="music-hero">
        <img src={hero} alt="Fones de ouvido cromados e uma fita cassete vermelha" width={1536} height={768}/>
        <div className="hero-copy">
          <span className="eyebrow"><Music2 size={12}/> SEM BAIXAR MP3 · 100% ONLINE</span>
          <h2>Votefy.<br/>A música é nossa.</h2>
              <p>Cole um link do YouTube, Spotify ou áudio direto.<br/>Fica salvo no banco para todos ouvirem agora.</p>
          <ImportButton label="Adicionar música por link"/>
        </div>
      </section>

      <section className="section">
        <SectionHeading title="Adicionadas pela comunidade" to="/library"/>
        {recent.length ? (
          <div className="art-grid">
            {recent.map((t, i) => <TrackCard key={t.id} track={t} index={i}/>)}
          </div>
        ) : (
          <div className="skeleton-card">
            <Link2 size={27}/>
            <div>
              <strong className="text-sm">Seja o primeiro a adicionar uma música</strong>
              <p>Cole um link do YouTube, Spotify ou stream direto de áudio.</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto"
              aria-label="Adicionar link"
              onClick={() => document.querySelector<HTMLButtonElement>('[data-open-add-song]')?.click()}
            >
              <ArrowUpRight/>
            </Button>
          </div>
        )}
      </section>

      <section className="section">
        <SectionHeading title="No seu ritmo" to="/playlists"/>
        <div className="art-grid">
          {[
            { name: 'Energia lá em cima', desc: 'Um novo ritmo para o seu dia.', art: 0 },
            { name: 'Desacelere', desc: 'Seu momento. Sem pressa.', art: 1 },
            { name: 'Foco no agora', desc: 'Menos ruído, mais você.', art: 2 },
            { name: 'Suas favoritas', desc: `${favorites.length} músicas que têm seu coração.`, art: 0 },
          ].map((p, i) => (
            <Link className="music-card" key={p.name} to={i === 3 ? '/favorites' : '/playlists'}>
              <div className="cover-wrap">
                <Artwork art={p.art}/>
                {i === 3 && <Heart className="absolute inset-0 m-auto text-foreground" size={54} fill="currentColor"/>}
              </div>
              <h3 className="card-title">{p.name}</h3>
              <p className="card-description">{p.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      {favorites.length > 0 && (
        <section className="section">
          <SectionHeading title="Suas músicas favoritas" icon={<Heart/>} to="/favorites"/>
          <div className="art-grid">
            {favorites.slice(0, 4).map((t, i) => <TrackCard key={t.id} track={t} index={i}/>)}
          </div>
        </section>
      )}

      <section className="section">
        <SectionHeading title="Salas musicais" icon={<Radio/>} to="/rooms"/>
        <div className="room-preview">
          <div className="room-symbol"><Radio/></div>
          <div>
            <h3>Uma sala. Várias escolhas.</h3>
            <p>Vote na próxima faixa usando as músicas salvas na comunidade.</p>
          </div>
          <div className="room-actions">
            <Button variant="outline" size="sm" asChild><Link to="/rooms">Explorar salas</Link></Button>
            <Button size="sm" asChild><Link to="/rooms" search={{ create: true }}><Plus/>Criar sala</Link></Button>
          </div>
        </div>
      </section>

      <div className="footer-note">
        <span className="flex gap-2 items-center"><span className="brand-mark !h-3"><i/><i/><i/></span>Votefy. · Streaming colaborativo.</span>
        <span>Banco sincronizado na Neon · Sem downloads.</span>
      </div>
    </main>
  );
}

export function TrackTable({ tracks, playlistId }: { tracks: CloudTrack[]; playlistId?: string }) {
  const m = useMusic();
  const [adding, setAdding] = useState<string>();

  return (
    <>
      <table className="track-table">
        <thead>
          <tr>
            <th className="hide-mobile">#</th>
            <th>Título</th>
            <th className="hide-mobile">Votos</th>
            <th className="hide-mobile">Origem</th>
            <th/>
          </tr>
        </thead>
        <tbody>
          {tracks.map((t, i) => (
            <tr key={t.id}>
              <td className="hide-mobile">{i + 1}</td>
              <td>
                <div className="track-info">
                  <div className="w-10 h-10 rounded overflow-hidden shrink-0">
                    <TrackCover track={t} index={i}/>
                  </div>
                  <div>
                    <strong className={m.current === t.id ? 'text-primary' : ''}>{t.title}</strong>
                    <small>{t.artist}</small>
                  </div>
                </div>
              </td>
              <td className="hide-mobile text-muted-foreground">{t.votes}</td>
              <td className="hide-mobile text-muted-foreground">{t.youtubeId ? 'YouTube' : t.spotifyUri ? 'Spotify' : 'Áudio / stream'}</td>
              <td>
                <div className="track-actions">
                  <IconButton label={`Tocar ${t.title}`} onClick={() => m.play(t.id, tracks.map(item => item.id))}><Play/></IconButton>
                  <IconButton label={`Votar em ${t.title}`} onClick={() => void m.voteSong(t.id)}><ThumbsUp/></IconButton>
                  <IconButton label={`Favoritar ${t.title}`} active={m.favorites.includes(t.id)} onClick={() => m.favorite(t.id)}>
                    <Heart fill={m.favorites.includes(t.id) ? 'currentColor' : 'none'}/>
                  </IconButton>
                  <IconButton label={`Adicionar ${t.title} à playlist`} onClick={() => setAdding(t.id)}><Plus/></IconButton>
                  {playlistId && (
                    <IconButton
                      label={`Remover ${t.title} da playlist`}
                      onClick={() => m.setPlaylists(all => all.map(p => p.id === playlistId ? { ...p, tracks: p.tracks.filter(id => id !== t.id) } : p))}
                    >
                      <Trash2/>
                    </IconButton>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <Dialog open={!!adding} onOpenChange={() => setAdding(undefined)}>
        <DialogContent>
          <DialogTitle>Adicionar à playlist</DialogTitle>
          <DialogDescription>Escolha uma das suas seleções.</DialogDescription>
          {m.playlists.map(p => (
            <Button
              variant="secondary"
              key={p.id}
              onClick={() => {
                m.setPlaylists(all => all.map(item => item.id === p.id && adding ? { ...item, tracks: [...new Set([...item.tracks, adding])] } : item));
                setAdding(undefined);
              }}
            >
              {p.name}
            </Button>
          ))}
          {!m.playlists.length && <Button asChild><Link to="/playlists" onClick={() => setAdding(undefined)}>Criar uma playlist</Link></Button>}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function LibraryPage({ kind = 'library', query = '' }: { kind?: 'library' | 'favorites' | 'search'; query?: string }) {
  const m = useMusic();
  const tracks = m.tracks
    .filter(t => kind !== 'favorites' || m.favorites.includes(t.id))
    .filter(t => `${t.title} ${t.artist} ${t.filename}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const title = kind === 'favorites' ? 'Músicas favoritas' : kind === 'search' ? 'Buscar músicas' : 'Biblioteca da comunidade';

  return (
    <main className="page">
      <div className="greeting">
        <div>
          <h1>{title}</h1>
          <p>{tracks.length} músicas salvas · Streaming para todos</p>
        </div>
        <ImportButton/>
      </div>
      {tracks.length ? (
        <>
          <div className="mb-6">
            <Button onClick={() => { const first = tracks[0]; if (first) m.play(first.id, tracks.map(t => t.id)); }}>
              <Play fill="currentColor"/>Reproduzir tudo
            </Button>
          </div>
          <TrackTable tracks={tracks}/>
        </>
      ) : (
        <Empty
          title={query ? 'Nenhuma música encontrada' : kind === 'favorites' ? 'Guarde o que você ama' : 'Nenhuma música na nuvem ainda'}
          description={query ? `Nenhum resultado para “${query}”.` : kind === 'favorites' ? 'Suas músicas com coração aparecem aqui.' : undefined}
        />
      )}
    </main>
  );
}

export function PlaylistsPage({ create = false }: { create?: boolean | undefined }) {
  const m = useMusic();
  const [open, setOpen] = useState(create ?? false);
  useEffect(() => { if (create) setOpen(true); }, [create]);
  const [name, setName] = useState('');

  return (
    <main className="page">
      <div className="greeting">
        <div>
          <h1>Suas playlists</h1>
          <p>Uma seleção para cada versão de você.</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus/>Criar playlist</Button>
      </div>
      <div className="art-grid">
        {m.playlists.map(p => (
          <Link key={p.id} to="/playlists/$playlistId" params={{ playlistId: p.id }} className="music-card">
            <div className="cover-wrap"><Artwork art={p.art}/></div>
            <h3 className="card-title">{p.name}</h3>
            <p className="card-description">{p.tracks.length} músicas · Sua playlist</p>
          </Link>
        ))}
      </div>
      {!m.playlists.length && (
        <div className="empty-state">
          <ListMusic/>
          <h2>O próximo mix é seu</h2>
          <p>Comece uma nova seleção com as músicas da comunidade.</p>
          <Button onClick={() => setOpen(true)}><Plus/>Criar playlist</Button>
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>Nova playlist</DialogTitle>
          <DialogDescription>Qual é o nome da sua próxima seleção?</DialogDescription>
          <form
            className="dialog-form"
            onSubmit={e => {
              e.preventDefault();
              if (!name.trim()) return;
              m.setPlaylists(all => [...all, { id: crypto.randomUUID(), name: name.trim(), tracks: [], art: all.length % 3 }]);
              setOpen(false);
              setName('');
            }}
          >
            <Input placeholder="Nome da playlist" aria-label="Nome da playlist" required maxLength={80} value={name} onChange={e => setName(e.target.value)}/>
            <Button type="submit"><Plus/>Criar playlist</Button>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}

export function PlaylistPage({ id }: { id: string }) {
  const m = useMusic();
  const nav = useNavigate();
  const p = m.playlists.find(item => item.id === id);
  const [open, setOpen] = useState(false);

  if (!p) return <main className="page"><h1>Playlist não encontrada</h1><Link to="/playlists">Voltar às playlists</Link></main>;
  const tracks = p.tracks.flatMap(trackId => { const t = m.tracks.find(item => item.id === trackId); return t ? [t] : []; });

  return (
    <main className="page">
      <div className="library-banner">
        <Artwork art={p.art}/>
        <div>
          <span className="eyebrow">SUA PLAYLIST</span>
          <h1>{p.name}</h1>
          <p>{tracks.length} músicas · Criada por você</p>
        </div>
      </div>
      <div className="flex gap-3 flex-wrap mb-7">
        <Button disabled={!tracks.length} onClick={() => { const first = tracks[0]; if (first) m.play(first.id, p.tracks); }}>
          <Play fill="currentColor"/>Reproduzir
        </Button>
        <Button variant="outline" onClick={() => setOpen(true)}><Plus/>Adicionar músicas</Button>
        <IconButton
          label="Renomear playlist"
          onClick={() => {
            const newName = window.prompt('Novo nome da playlist', p.name);
            if (newName?.trim()) m.setPlaylists(all => all.map(item => item.id === p.id ? { ...item, name: newName.trim() } : item));
          }}
        >
          <MoreHorizontal/>
        </IconButton>
        <IconButton
          label="Excluir playlist"
          onClick={() => {
            if (window.confirm(`Excluir a playlist "${p.name}"?`)) {
              m.setPlaylists(all => all.filter(item => item.id !== p.id));
              void nav({ to: '/playlists' });
            }
          }}
        >
          <Trash2/>
        </IconButton>
      </div>
      <TrackTable tracks={tracks} playlistId={p.id}/>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>Adicionar músicas</DialogTitle>
          <DialogDescription>{p.name}</DialogDescription>
          <div className="add-list">
            {m.tracks.map(t => (
              <label className="add-row" key={t.id}>
                <input
                  type="checkbox"
                  checked={p.tracks.includes(t.id)}
                  onChange={e => m.setPlaylists(all => all.map(item => item.id === p.id ? { ...item, tracks: e.target.checked ? [...item.tracks, t.id] : item.tracks.filter(trackId => trackId !== t.id) } : item))}
                />
                {t.title}
              </label>
            ))}
            {!m.tracks.length && <ImportButton/>}
          </div>
          <Button onClick={() => setOpen(false)}><Check/>Concluir</Button>
        </DialogContent>
      </Dialog>
    </main>
  );
}
export { RoomsPage, RoomPage } from '@/components/lan-rooms';
