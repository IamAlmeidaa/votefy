import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { Home, Search, Library, Heart, ListMusic, Radio, Plus, Link2, ChevronLeft, ChevronRight, Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Volume2, VolumeX, Music2, ArrowUpRight, MoreHorizontal, Menu, X, Trash2, Send, Users, Check, Headphones, Globe, Clock, LogOut, ThumbsUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useMusic, type CloudTrack } from './music-provider';
import { Artwork } from './artwork';
import { candidates, vote, time, type Room } from '@/lib/music';
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
          <Button variant="outline" className="upload-top" size="sm" onClick={() => setAddOpen(true)}>
            <Link2/>Adicionar link
          </Button>
          <span className="avatar" title="Comunidade Votefy">VF</span>
        </div>
      </header>

      {children}

      {/* Container do player YouTube para streaming direto sem baixar MP3 */}
      <div
        className={`fixed bottom-24 right-4 z-40 overflow-hidden rounded-xl border border-border bg-card shadow-2xl transition-opacity duration-200 ${
          track?.youtubeId ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none w-0 h-0'
        }`}
      >
        <div id="votefy-yt-player" />
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

        <div className="volume-control">
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
            Cole um link do YouTube ou URL direta de áudio. A música ficará salva para todos ouvirem sem baixar MP3.
          </DialogDescription>
          <form className="dialog-form" onSubmit={handleSaveLink}>
            <label>
              Link da música (YouTube ou Áudio)
              <Input
                type="url"
                placeholder="https://www.youtube.com/watch?v=..."
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

function Empty({ title = 'A biblioteca da comunidade está vazia', description = 'Adicione um link do YouTube ou de áudio para todo mundo ouvir.' }: { title?: string; description?: string | undefined }) {
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
          <p>Cole um link do YouTube ou de áudio.<br/>Fica salvo no banco para todos ouvirem agora.</p>
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
              <p>Cole um link do YouTube ou stream direto de áudio.</p>
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
              <td className="hide-mobile text-muted-foreground">{t.youtubeId ? 'YouTube Stream' : 'Áudio Stream'}</td>
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

export function RoomsPage({ create = false }: { create?: boolean | undefined }) {
  const m = useMusic();
  const nav = useNavigate();
  const [open, setOpen] = useState(create ?? false);
  useEffect(() => { if (create) setOpen(true); }, [create]);
  const [name, setName] = useState('');
  const [participant, setParticipant] = useState('Você');
  const [code, setCode] = useState('');

  return (
    <main className="page">
      <div className="greeting">
        <div>
          <h1>Salas musicais</h1>
          <p>Salas de votação com as músicas da comunidade</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus/>Criar sala</Button>
      </div>
      <form
        className="flex gap-3 mb-8 max-w-md"
        onSubmit={e => {
          e.preventDefault();
          const room = m.rooms.find(r => r.id.toUpperCase() === code.trim().toUpperCase());
          if (room) void nav({ to: '/rooms/$roomId', params: { roomId: room.id } });
          else m.setNotice('Este código não existe.');
        }}
      >
        <Input value={code} onChange={e => setCode(e.target.value)} placeholder="Código da sala" aria-label="Código da sala" required/>
        <Button variant="outline">Entrar</Button>
      </form>
      <div className="room-list">
        {m.rooms.map(r => (
          <div className="room-preview" key={r.id}>
            <div className="room-symbol"><Radio/></div>
            <div>
              <h3>{r.name}</h3>
              <p>{r.participants.length} participantes · {r.id}</p>
            </div>
            <Button className="ml-auto" variant="secondary" asChild>
              <Link to="/rooms/$roomId" params={{ roomId: r.id }}>Entrar na sala<ArrowUpRight/></Link>
            </Button>
          </div>
        ))}
      </div>
      {!m.rooms.length && (
        <div className="empty-state">
          <Radio/>
          <h2>O próximo som é uma escolha coletiva</h2>
          <p>Crie uma sala para votar nas músicas salvas na Neon.</p>
          <Button onClick={() => setOpen(true)}><Plus/>Criar sua primeira sala</Button>
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>Criar sala musical</DialogTitle>
          <DialogDescription>Escolha as músicas da comunidade e vote na próxima faixa.</DialogDescription>
          <form
            className="dialog-form"
            onSubmit={e => {
              e.preventDefault();
              if (!name.trim() || !participant.trim()) return;
              const user = crypto.randomUUID();
              const id = crypto.randomUUID().slice(0, 8).toUpperCase();
              const room: Room = { id, name: name.trim(), admin: user, active: user, participants: [{ id: user, name: participant.trim() }], options: [], votes: {}, open: true, queue: [], history: [], chat: [] };
              m.setRooms(all => [...all, room]);
              setOpen(false);
              void nav({ to: '/rooms/$roomId', params: { roomId: id } });
            }}
          >
            <label>Nome da sala<Input aria-label="Nome da sala" value={name} onChange={e => setName(e.target.value)} required maxLength={70}/></label>
            <label>Seu nome<Input aria-label="Seu nome" value={participant} onChange={e => setParticipant(e.target.value)} required maxLength={40}/></label>
            <Button type="submit"><Radio/>Criar sala</Button>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}

export function RoomPage({ id }: { id: string }) {
  const m = useMusic();
  const nav = useNavigate();
  const r = m.rooms.find(room => room.id === id);
  const [person, setPerson] = useState('');
  const [message, setMessage] = useState('');
  const [manual, setManual] = useState('');

  if (!r) return <main className="page"><h1>Sala não encontrada</h1><Link to="/rooms">Voltar às salas</Link></main>;
  const isAdmin = r.active === r.admin;
  const active = r.participants.find(p => p.id === r.active);
  const current = m.tracks.find(t => t.id === r.current);
  const counts = r.options.map(optId => Object.values(r.votes).filter(v => v === optId).length);
  const total = counts.reduce((a, b) => a + b, 0);
  const highest = Math.max(0, ...counts);
  const change = (fn: (room: Room) => Room) => m.updateRoom(id, fn);
  const start = () => {
    const t = current || m.tracks[0];
    if (t) m.play(t.id, undefined, id);
    else m.setNotice('Adicione músicas por link antes de iniciar a sala.');
  };

  return (
    <main className="page">
      <div className="greeting">
        <div>
          <h1>{r.name}</h1>
          <p><span className="text-primary">{r.id}</span> · {r.participants.length} participantes</p>
        </div>
        <IconButton label="Sair da sala" onClick={() => { m.setActiveRoom(undefined); void nav({ to: '/rooms' }); }}><LogOut/></IconButton>
      </div>
      <div className="room-layout">
        <div>
          <section className="room-current">
            {current ? (
              <div className="w-24 h-24 rounded-xl overflow-hidden shrink-0"><TrackCover track={current}/></div>
            ) : (
              <Artwork/>
            )}
            <div className="flex-1 min-w-0">
              <span className="eyebrow">TOCANDO NA SALA</span>
              <h2>{current?.title || 'A sala está pronta'}</h2>
              <p>{current?.artist || 'Escolha a primeira música para começar.'}</p>
              {m.activeRoom === id && (
                <div className="timeline">
                  <span>{time(m.elapsed)}</span>
                  <input aria-label="Progresso na sala" type="range" min="0" max={m.duration || 1} value={m.elapsed} step=".1" disabled={!isAdmin} onChange={e => m.seek(Number(e.target.value))}/>
                  <span>{time(m.duration)}</span>
                </div>
              )}
              {isAdmin && (
                <Button size="sm" onClick={() => m.activeRoom === id ? m.toggle() : start()} className="mt-4">
                  {m.playing && m.activeRoom === id ? <Pause/> : <Play/>}
                  {m.playing && m.activeRoom === id ? 'Pausar' : 'Reproduzir na sala'}
                </Button>
              )}
            </div>
          </section>

          <section className="section">
            <div className="section-heading">
              <h2>Qual é a próxima?</h2>
              <span className={`small-tag ${r.open ? 'text-success' : ''}`}>{r.open ? 'VOTAÇÃO ABERTA' : 'VOTAÇÃO ENCERRADA'}</span>
            </div>
            <p className="text-xs text-muted-foreground mb-4">Votando como <strong className="text-foreground">{active?.name}</strong> · {total} votos nesta rodada</p>
            <div className="voting-grid">
              {r.options.map((option, i) => {
                const t = m.tracks.find(item => item.id === option);
                if (!t) return null;
                const voters = r.participants.filter(p => r.votes[p.id] === option);
                const count = counts[i] ?? 0;
                return (
                  <article className={`vote-card ${count === highest && highest > 0 ? 'leading' : ''}`} key={option}>
                    <div className="track-info">
                      <div className="w-10 h-10 rounded overflow-hidden shrink-0"><TrackCover track={t} index={i}/></div>
                      <div className="min-w-0"><strong>{t.title}</strong><small>{t.artist}</small></div>
                    </div>
                    <div className="vote-bar"><progress value={count} max={total || 1}/></div>
                    <div className="flex justify-between text-xs text-muted-foreground mb-3">
                      <span>{count} votos</span>
                      <span>{total ? Math.round(count / total * 100) : 0}% {count === highest && highest > 0 ? '· Liderando' : ''}</span>
                    </div>
                    <Button size="sm" variant={r.votes[r.active] === option ? 'default' : 'outline'} disabled={!r.open} className="w-full" onClick={() => change(room => vote(room, room.active, option, m.tracks.map(item => item.id)))}>
                      {r.votes[r.active] === option ? <Check/> : <Heart/>}
                      {r.votes[r.active] === option ? 'Seu voto' : 'Votar'}
                    </Button>
                    <p className="text-xs text-muted-foreground mt-2 min-h-4">{voters.map(p => p.name).join(', ') || 'Sem votos ainda'}</p>
                  </article>
                );
              })}
            </div>
            {!r.options.length && <div className="skeleton-card"><Music2/><p>Inicie uma música para abrir a primeira rodada.</p></div>}
          </section>

          {isAdmin && (
            <section className="section border-t border-border pt-5">
              <h3 className="text-sm font-semibold">Controles do administrador</h3>
              <div className="admin-controls">
                <Button size="sm" variant="secondary" disabled={!r.options.length} onClick={() => m.finishRound(id)}><SkipForward/>Pular / tocar vencedora</Button>
                <Button size="sm" variant="secondary" disabled={!r.open} onClick={() => change(room => ({ ...room, open: false }))}><Check/>Encerrar votação</Button>
                <Button size="sm" variant="secondary" onClick={() => change(room => ({ ...room, options: candidates(m.tracks.map(t => t.id), r.current), votes: {}, open: true }))}><Shuffle/>Novas opções</Button>
                <Button size="sm" variant="outline" onClick={() => change(room => ({ ...room, votes: {} }))}><Trash2/>Limpar votos</Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <select aria-label="Escolher próxima música" value={manual} onChange={e => setManual(e.target.value)}>
                  <option value="">Escolher próxima música</option>
                  {m.tracks.filter(t => t.id !== r.current).map(t => <option value={t.id} key={t.id}>{t.title}</option>)}
                </select>
                <Button variant="outline" size="sm" disabled={!manual} onClick={() => change(room => ({ ...room, queue: [...room.queue, manual] }))}><Plus/>Fila</Button>
                <Button size="sm" disabled={!manual} onClick={() => m.finishRound(id, manual)}><Play/>Tocar agora</Button>
              </div>
            </section>
          )}

          <section className="section">
            <SectionHeading title="Fila da sala" icon={<ListMusic/>}/>
            {r.queue.map((t, i) => (
              <div className="add-row" key={`${t}-${i}`}>
                <span>{m.tracks.find(track => track.id === t)?.title || 'Música removida'}</span>
                {isAdmin && <IconButton label="Remover da fila" onClick={() => change(room => ({ ...room, queue: room.queue.filter((_, index) => index !== i) }))}><X/></IconButton>}
              </div>
            ))}
            {!r.queue.length && <p className="text-xs text-muted-foreground">As vencedoras da votação tocam automaticamente.</p>}
          </section>

          <section className="section">
            <SectionHeading title="Histórico de vencedoras" icon={<Clock/>}/>
            {r.history.slice().reverse().map((h, i) => (
              <div className="add-row" key={i}>
                <Music2 size={14}/>{m.tracks.find(t => t.id === h.track)?.title || 'Música removida'}
                <span className="ml-auto text-muted-foreground">{h.votes} votos</span>
              </div>
            ))}
            {!r.history.length && <p className="text-xs text-muted-foreground">Nenhuma rodada concluída.</p>}
          </section>
        </div>

        <aside className="room-aside">
          <h3 className="inline-heading"><Users size={16}/>Participantes</h3>
          <label className="grid gap-2 text-xs text-muted-foreground">
            Participante ativo
            <select aria-label="Participante ativo" value={r.active} onChange={e => change(room => ({ ...room, active: e.target.value }))}>
              {r.participants.map(p => <option key={p.id} value={p.id}>{p.name}{p.id === r.admin ? ' (Admin)' : ''}</option>)}
            </select>
          </label>
          {r.participants.map(p => (
            <div className="participant-row" key={p.id}>
              <div className="avatar">{p.name.slice(0, 2).toUpperCase()}</div>
              <span>{p.name}{p.id === r.admin && <small className="block text-primary text-[9px] mt-1">ADMINISTRADOR</small>}</span>
              {isAdmin && p.id !== r.admin && (
                <IconButton label={`Remover ${p.name}`} className="ml-auto" onClick={() => change(room => ({ ...room, participants: room.participants.filter(person => person.id !== p.id), votes: Object.fromEntries(Object.entries(room.votes).filter(([person]) => person !== p.id)) }))}>
                  <X/>
                </IconButton>
              )}
            </div>
          ))}
          {isAdmin && (
            <form
              className="chat-form mt-3"
              onSubmit={e => {
                e.preventDefault();
                if (!person.trim()) return;
                change(room => ({ ...room, participants: [...room.participants, { id: crypto.randomUUID(), name: person.trim() }] }));
                setPerson('');
              }}
            >
              <Input placeholder="Nome do participante" aria-label="Nome do participante" value={person} onChange={e => setPerson(e.target.value)} maxLength={40} required/>
              <Button size="icon" type="submit" aria-label="Adicionar participante"><Plus/></Button>
            </form>
          )}
          <h3 className="mt-8">Chat</h3>
          <div className="chat-messages">
            {r.chat.map((msg, i) => <p key={i}><strong>{msg.name}</strong>{msg.text}</p>)}
            {!r.chat.length && <p className="text-muted-foreground">A conversa começa aqui.</p>}
          </div>
          <form
            className="chat-form"
            onSubmit={e => {
              e.preventDefault();
              if (!message.trim()) return;
              change(room => ({ ...room, chat: [...room.chat, { name: active?.name || 'Participante', text: message.trim() }].slice(-100) }));
              setMessage('');
            }}
          >
            <Input placeholder="Mensagem..." aria-label="Mensagem do chat" required value={message} onChange={e => setMessage(e.target.value)} maxLength={500}/>
            <Button size="icon" type="submit" aria-label="Enviar mensagem"><Send/></Button>
          </form>
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              className="mt-8 w-full text-primary"
              onClick={() => {
                if (window.confirm('Encerrar e excluir esta sala?')) {
                  m.setRooms(all => all.filter(room => room.id !== id));
                  if (m.activeRoom === id) {
                    if (m.playing) m.toggle();
                    m.setActiveRoom(undefined);
                  }
                  void nav({ to: '/rooms' });
                }
              }}
            >
              <X/>Encerrar sala
            </Button>
          )}
        </aside>
      </div>
    </main>
  );
}