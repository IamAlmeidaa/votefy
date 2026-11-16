import { useEffect, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  ArrowUpRight,
  Check,
  Clock,
  Copy,
  Crown,
  Heart,
  Link2,
  ListMusic,
  LogOut,
  Music2,
  Pause,
  Play,
  Plus,
  Radio,
  Send,
  Shuffle,
  SkipForward,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  Wifi,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Artwork } from '@/components/artwork';
import { useMusic } from '@/components/music-provider';
import { time } from '@/lib/music';

export function RoomsPage({ create = false }: { create?: boolean | undefined }) {
  const m = useMusic();
  const nav = useNavigate();
  const [open, setOpen] = useState(create ?? false);
  const [name, setName] = useState('');
  const [participant, setParticipant] = useState('Host');
  const [guestName, setGuestName] = useState('');
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (create) setOpen(true);
  }, [create]);

  const join = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!guestName.trim() || !code.trim()) return;
    setJoining(true);
    try {
      const joined = await m.joinRoom(code, guestName);
      void nav({ to: '/rooms/$roomId', params: { roomId: joined.roomId } });
    } catch (error) {
      m.setNotice(error instanceof Error ? error.message : 'Não foi possível entrar na sala.');
    } finally {
      setJoining(false);
    }
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !participant.trim()) return;
    setCreating(true);
    try {
      const id = await m.createRoom(name, participant);
      setOpen(false);
      setName('');
      void nav({ to: '/rooms/$roomId', params: { roomId: id } });
    } catch (error) {
      m.setNotice(error instanceof Error ? error.message : 'Não foi possível criar a sala.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <main className="page">
      <div className="greeting">
        <div>
          <h1>Salas musicais</h1>
          <p>Estilo Jam · Qualquer pessoa entra pelo código ou link · O som toca no host</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus />
          Criar sala
        </Button>
      </div>

      <section className="lan-explainer">
        <Wifi />
        <div>
          <h2>Sessão colaborativa em tempo real</h2>
          <p>
            Crie uma sala e envie o link ou código de 6 dígitos. Todos votam na próxima música (com direito a 1 Voto
            de Ouro que vale por 3) e podem votar para pular a faixa atual por maioria qualificada.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="section-heading">
          <h2>
            <UserPlus />
            Entrar em uma sala
          </h2>
        </div>
        <form className="join-lan-form" onSubmit={event => void join(event)}>
          <Input
            aria-label="Seu nome"
            value={guestName}
            onChange={event => setGuestName(event.target.value)}
            placeholder="Seu nome na sala"
            required
            maxLength={40}
          />
          <Input
            aria-label="Código ou link da sala"
            value={code}
            onChange={event => setCode(event.target.value)}
            placeholder="Código da sala (ex: A7K9P2) ou link de convite"
            required
          />
          <Button variant="outline" type="submit" disabled={joining}>
            {joining ? 'Entrando...' : 'Entrar na sala'}
            <ArrowUpRight />
          </Button>
        </form>
      </section>

      <section className="section">
        <div className="section-heading">
          <h2>Salas ativas</h2>
        </div>
        <div className="room-list">
          {m.rooms.map(room => {
            const membership = m.memberships[room.id];
            return (
              <div className="room-preview" key={room.id}>
                <div className="room-symbol">
                  <Radio />
                </div>
                <div>
                  <h3>
                    {room.name} <span className="text-xs text-primary font-mono ml-2">#{room.id}</span>
                  </h3>
                  <p>
                    {room.activeCount} conectados ·{' '}
                    {membership?.role === 'host'
                      ? 'Você é o host'
                      : membership
                        ? 'Você está na sala'
                        : 'Clique para entrar'}
                  </p>
                </div>
                <Button className="ml-auto" variant="secondary" asChild>
                  <Link to="/rooms/$roomId" params={{ roomId: room.id }}>
                    Abrir sala
                    <ArrowUpRight />
                  </Link>
                </Button>
              </div>
            );
          })}
        </div>
        {!m.rooms.length && (
          <div className="empty-state">
            <Radio />
            <h2>Uma sala, várias escolhas</h2>
            <p>Crie uma sala como host ou cole o código de convite de outra pessoa.</p>
            <Button onClick={() => setOpen(true)}>
              <Plus />
              Criar sala
            </Button>
          </div>
        )}
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>Criar sala musical</DialogTitle>
          <DialogDescription>
            Os convidados poderão entrar pelo link ou código e votar nas próximas músicas. O áudio tocará neste
            dispositivo.
          </DialogDescription>
          <form className="dialog-form" onSubmit={event => void handleCreate(event)}>
            <label>
              Nome da sala
              <Input
                aria-label="Nome da sala"
                value={name}
                onChange={event => setName(event.target.value)}
                placeholder="Ex: Churrasco de Domingo"
                required
                maxLength={70}
              />
            </label>
            <label>
              Seu nome
              <Input
                aria-label="Seu nome como host"
                value={participant}
                onChange={event => setParticipant(event.target.value)}
                required
                maxLength={40}
              />
            </label>
            <Button type="submit" disabled={creating}>
              <Radio />
              {creating ? 'Criando...' : 'Criar sala'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}

export function RoomPage({ id }: { id: string }) {
  const m = useMusic();
  const nav = useNavigate();
  const normalizedId = id.trim().toUpperCase();
  const room = m.rooms.find(item => item.id === normalizedId);
  const [message, setMessage] = useState('');
  const [manual, setManual] = useState('');
  const [quickName, setQuickName] = useState('');
  const [joiningDirect, setJoiningDirect] = useState(false);
  const [loadingRoom, setLoadingRoom] = useState(true);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      await m.syncRoom(normalizedId);
      if (active) setLoadingRoom(false);
    };
    void poll();
    const timer = setInterval(() => void poll(), 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [normalizedId]);

  const self = room?.participants.find(person => person.id === m.userId);
  const isHost = room?.admin === m.userId;
  const connected = Boolean(self);

  const handleDirectJoin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!quickName.trim()) return;
    setJoiningDirect(true);
    try {
      await m.joinRoom(normalizedId, quickName);
      await m.syncRoom(normalizedId);
    } catch (error) {
      m.setNotice(error instanceof Error ? error.message : 'Erro ao entrar na sala.');
    } finally {
      setJoiningDirect(false);
    }
  };

  const copyShareLink = async () => {
    const shareUrl = `${window.location.origin}/rooms/${normalizedId}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      m.setNotice(`Link copiado! Envie para os amigos: ${shareUrl}`);
    } catch {
      m.setNotice(`Código da sala: ${normalizedId}`);
    }
  };

  const copyRoomCode = async () => {
    try {
      await navigator.clipboard.writeText(normalizedId);
      m.setNotice(`Código ${normalizedId} copiado!`);
    } catch {
      m.setNotice(`Código da sala: ${normalizedId}`);
    }
  };

  if (loadingRoom && !room) {
    return (
      <main className="page">
        <div className="empty-state">
          <Radio />
          <h1>Conectando à sala #{normalizedId}...</h1>
        </div>
      </main>
    );
  }

  if (!room) {
    return (
      <main className="page">
        <div className="empty-state">
          <Radio />
          <h1>Sala não encontrada</h1>
          <p>Verifique se o código #{normalizedId} está correto ou se o host já encerrou a sessão.</p>
          <Button asChild>
            <Link to="/rooms">Voltar às salas</Link>
          </Button>
        </div>
      </main>
    );
  }

  if (!connected) {
    return (
      <main className="page">
        <div className="empty-state max-w-md mx-auto">
          <Radio />
          <h1>Entrar em "{room.name}"</h1>
          <p>
            Sala #{room.id} · {room.activeCount} {room.activeCount === 1 ? 'pessoa conectada' : 'pessoas conectadas'}
          </p>
          <form className="grid gap-3 w-full mt-4" onSubmit={event => void handleDirectJoin(event)}>
            <Input
              aria-label="Seu nome"
              value={quickName}
              onChange={event => setQuickName(event.target.value)}
              placeholder="Digite seu nome para entrar"
              required
              maxLength={40}
            />
            <Button type="submit" disabled={joiningDirect}>
              <UserPlus />
              {joiningDirect ? 'Entrando...' : 'Entrar na sala agora'}
            </Button>
          </form>
        </div>
      </main>
    );
  }

  const roomTracks = m.tracks;
  const current = roomTracks.find(track => track.id === room.current);
  const myVote = room.votes[m.userId];
  const myGoldenUsed = Boolean(self?.goldenUsed);
  const userVotedSkip = room.skipVotes.includes(m.userId);

  const scores = room.options.map(option =>
    Object.values(room.votes)
      .filter(v => v.track === option)
      .reduce((sum, v) => sum + v.weight, 0)
  );
  const totalPoints = scores.reduce((sum, s) => sum + s, 0);
  const highest = Math.max(0, ...scores);

  const start = () => {
    const track = current || m.tracks[0];
    if (track) m.play(track.id, undefined, normalizedId);
    else m.setNotice('Adicione músicas à biblioteca antes de iniciar a sala.');
  };

  return (
    <main className="page">
      <div className="greeting">
        <div>
          <h1>{room.name}</h1>
          <p>
            Código: <strong className="text-primary font-mono">{room.id}</strong> · {room.activeCount}{' '}
            {room.activeCount === 1 ? 'conectado' : 'conectados'} ·{' '}
            <span className="text-success">{isHost ? 'Você é o host' : 'Conectado'}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void copyRoomCode()}>
            <Copy />
            {room.id}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void copyShareLink()}>
            <Link2 />
            Convidar link
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Sair da sala"
            title="Sair da sala"
            onClick={() => {
              void m.leaveRoom(normalizedId);
              void nav({ to: '/rooms' });
            }}
          >
            <LogOut />
          </Button>
        </div>
      </div>

      <div className="room-layout">
        <div>
          <section className="room-current">
            <Artwork cover={current && 'cover' in current ? current.cover : undefined} />
            <div className="flex-1 min-w-0">
              <span className="eyebrow">{isHost ? 'TOCANDO NO HOST' : 'TOCANDO NA SALA'}</span>
              <h2>{current?.title || 'A sala está pronta'}</h2>
              <p>{current?.artist || 'O host escolherá a primeira música.'}</p>

              {isHost && m.activeRoom === normalizedId && (
                <div className="timeline">
                  <span>{time(m.elapsed)}</span>
                  <input
                    aria-label="Progresso na sala"
                    type="range"
                    min="0"
                    max={m.duration || 1}
                    value={Math.min(m.elapsed, m.duration || 1)}
                    step=".1"
                    onChange={event => m.seek(Number(event.target.value))}
                  />
                  <span>{time(m.duration)}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 mt-4">
                {isHost && (
                  <Button size="sm" onClick={() => (m.activeRoom === normalizedId ? m.toggle() : start())}>
                    {m.playing && m.activeRoom === normalizedId ? <Pause /> : <Play />}
                    {m.playing && m.activeRoom === normalizedId ? 'Pausar' : 'Reproduzir no host'}
                  </Button>
                )}

                {current && (
                  <Button
                    size="sm"
                    variant={userVotedSkip ? 'default' : 'outline'}
                    onClick={() => void m.voteSkip(normalizedId)}
                  >
                    <SkipForward />
                    {userVotedSkip ? 'Votou Skip' : 'Votar Skip'} ({room.skipCount}/{room.skipRequired})
                  </Button>
                )}
              </div>

              {current && (
                <div className="mt-3 max-w-md">
                  <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
                    <span>
                      Aprovação para pular: <strong>{room.skipPercentage}%</strong>
                    </span>
                    <span>
                      {room.skipCount} de {room.skipRequired} votos necessários
                    </span>
                  </div>
                  <div className="vote-bar">
                    <progress value={room.skipPercentage} max={100} />
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="section">
            <div className="section-heading">
              <h2>Qual é a próxima?</h2>
              <span className={`small-tag ${room.open ? 'text-success' : ''}`}>
                {room.open ? 'VOTAÇÃO ABERTA' : 'VOTAÇÃO ENCERRADA'}
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground mb-4">
              <span>
                {self ? (
                  <>
                    Votando como <strong className="text-foreground">{self.name}</strong> ·{' '}
                  </>
                ) : null}
                {totalPoints} pontos nesta rodada
              </span>
              <span className={myGoldenUsed ? 'text-muted-foreground' : 'text-amber-400 font-medium flex items-center gap-1'}>
                <Crown size={14} />
                {myGoldenUsed
                  ? 'Voto de Ouro já usado nesta sala'
                  : '1 Voto de Ouro disponível (vale por 3 votos nesta sala)'}
              </span>
            </div>

            <div className="voting-grid">
              {room.options.map((option, index) => {
                const track = roomTracks.find(item => item.id === option);
                if (!track) return null;
                const score = scores[index] ?? 0;
                const voters = room.participants
                  .filter(person => room.votes[person.id]?.track === option)
                  .map(person =>
                    room.votes[person.id]?.weight === 3 ? `${person.name} ★` : person.name
                  );
                const selectedNormal = myVote?.track === option && myVote?.weight === 1;
                const selectedGolden = myVote?.track === option && myVote?.weight === 3;

                return (
                  <article
                    className={`vote-card ${score === highest && highest > 0 ? 'leading' : ''}`}
                    key={option}
                  >
                    <div className="track-info">
                      <Artwork cover={'cover' in track ? track.cover : undefined} art={index} />
                      <div className="min-w-0">
                        <strong>{track.title}</strong>
                        <small>{track.artist}</small>
                      </div>
                    </div>

                    <div className="vote-bar">
                      <progress value={score} max={totalPoints || 1} />
                    </div>

                    <div className="flex justify-between text-xs text-muted-foreground mb-3">
                      <span>
                        {score} {score === 1 ? 'ponto' : 'pontos'}
                      </span>
                      <span>
                        {totalPoints ? Math.round((score / totalPoints) * 100) : 0}%{' '}
                        {score === highest && highest > 0 ? '· Liderando' : ''}
                      </span>
                    </div>

                    <div className="grid gap-2">
                      <Button
                        size="sm"
                        variant={selectedNormal ? 'default' : 'outline'}
                        disabled={!room.open || myVote?.weight === 3}
                        className="w-full"
                        onClick={() => void m.castVote(normalizedId, option, false)}
                      >
                        {selectedNormal ? <Check /> : <Heart />}
                        {selectedNormal ? 'Seu voto (+1)' : 'Votar (+1)'}
                      </Button>

                      <Button
                        size="sm"
                        variant={selectedGolden ? 'default' : 'secondary'}
                        disabled={!room.open || myGoldenUsed}
                        className={`w-full ${
                          selectedGolden
                            ? 'bg-amber-500 text-black hover:bg-amber-400'
                            : !myGoldenUsed
                              ? 'border border-amber-500/40 text-amber-300 hover:bg-amber-500/10'
                              : ''
                        }`}
                        onClick={() => void m.castVote(normalizedId, option, true)}
                      >
                        {selectedGolden ? <Crown /> : <Sparkles />}
                        {selectedGolden
                          ? 'Voto de Ouro (+3)'
                          : myGoldenUsed
                            ? 'Ouro indisponível'
                            : 'Voto de Ouro (3x)'}
                      </Button>
                    </div>

                    <p className="text-xs text-muted-foreground mt-2 min-h-4">
                      {voters.join(', ') || 'Sem votos ainda'}
                    </p>
                  </article>
                );
              })}
            </div>

            {!room.options.length && (
              <div className="skeleton-card">
                <Music2 />
                <p>
                  {isHost
                    ? 'Inicie uma música para abrir a primeira rodada.'
                    : 'Aguarde o host iniciar uma música e abrir a votação.'}
                </p>
              </div>
            )}
          </section>

          {isHost && (
            <section className="section border-t border-border pt-5">
              <h3 className="text-sm font-semibold">Controles do host</h3>
              <div className="admin-controls">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!room.options.length}
                  onClick={() => void m.finishRound(normalizedId)}
                >
                  <SkipForward />
                  Tocar vencedora agora
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!room.open}
                  onClick={() => void m.controlRoom(normalizedId, { open: false })}
                >
                  <Check />
                  Encerrar votação
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void m.controlRoom(normalizedId, { rerollOptions: true })}
                >
                  <Shuffle />
                  Novas opções
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void m.controlRoom(normalizedId, { clearVotes: true })}
                >
                  <Trash2 />
                  Limpar votos
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <select
                  aria-label="Escolher próxima música"
                  value={manual}
                  onChange={event => setManual(event.target.value)}
                >
                  <option value="">Escolher próxima música</option>
                  {m.tracks
                    .filter(track => track.id !== room.current)
                    .map(track => (
                      <option value={track.id} key={track.id}>
                        {track.title}
                      </option>
                    ))}
                </select>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!manual}
                  onClick={() => {
                    if (!manual) return;
                    void m.controlRoom(normalizedId, { addToQueue: manual });
                    setManual('');
                  }}
                >
                  <Plus />
                  Fila
                </Button>
                <Button
                  size="sm"
                  disabled={!manual}
                  onClick={() => {
                    if (!manual) return;
                    void m.finishRound(normalizedId, manual);
                    setManual('');
                  }}
                >
                  <Play />
                  Tocar agora
                </Button>
              </div>
            </section>
          )}

          <section className="section">
            <div className="section-heading">
              <h2>
                <ListMusic />
                Fila da sala
              </h2>
            </div>
            {room.queue.map((trackId, index) => (
              <div className="add-row" key={`${trackId}-${index}`}>
                <span>{roomTracks.find(track => track.id === trackId)?.title || 'Música removida'}</span>
                {isHost && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remover da fila"
                    onClick={() => void m.controlRoom(normalizedId, { removeFromQueueIndex: index })}
                  >
                    <X />
                  </Button>
                )}
              </div>
            ))}
            {!room.queue.length && (
              <p className="text-xs text-muted-foreground">
                As vencedoras da votação tocam automaticamente no host.
              </p>
            )}
          </section>

          <section className="section">
            <div className="section-heading">
              <h2>
                <Clock />
                Histórico de vencedoras
              </h2>
            </div>
            {room.history
              .slice()
              .reverse()
              .map((history, index) => (
                <div className="add-row" key={index}>
                  <Music2 size={14} />
                  {roomTracks.find(track => track.id === history.track)?.title || 'Música removida'}
                  <span className="ml-auto text-muted-foreground">{history.votes} pts</span>
                </div>
              ))}
            {!room.history.length && (
              <p className="text-xs text-muted-foreground">Nenhuma rodada concluída.</p>
            )}
          </section>
        </div>

        <aside className="room-aside">
          <h3 className="inline-heading">
            <Users size={16} />
            Participantes <span className="small-tag">{room.activeCount} ON</span>
          </h3>
          {room.participants.map(person => (
            <div className="participant-row" key={person.id}>
              <div className="avatar">{person.name.slice(0, 2).toUpperCase()}</div>
              <span>
                {person.name}
                <small className="block text-[9px] mt-1 text-muted-foreground">
                  {person.id === room.admin ? <span className="text-primary mr-2">HOST</span> : null}
                  {person.goldenUsed ? 'Ouro usado' : '★ Ouro livre'}
                </small>
              </span>
              {isHost && person.id !== room.admin && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-auto"
                  aria-label={`Remover ${person.name}`}
                  onClick={() => void m.removeParticipant(normalizedId, person.id)}
                >
                  <X />
                </Button>
              )}
            </div>
          ))}

          <section className="invite-panel">
            <h3 className="inline-heading">
              <UserPlus size={16} />
              Convidar amigos
            </h3>
            <p>Envie o link direto ou o código #{room.id} para qualquer pessoa entrar na sala:</p>
            <div className="grid gap-2 mt-2">
              <Button size="sm" className="w-full" onClick={() => void copyShareLink()}>
                <Link2 />
                Copiar link da sala
              </Button>
              <Button size="sm" variant="outline" className="w-full" onClick={() => void copyRoomCode()}>
                <Copy />
                Copiar código ({room.id})
              </Button>
            </div>
          </section>

          <h3 className="mt-8">Chat da sala</h3>
          <div className="chat-messages">
            {room.chat.map((chat, index) => (
              <p key={index}>
                <strong>{chat.name}</strong>
                {chat.text}
              </p>
            ))}
            {!room.chat.length && <p className="text-muted-foreground">A conversa começa aqui.</p>}
          </div>
          <form
            className="chat-form"
            onSubmit={event => {
              event.preventDefault();
              if (!message.trim()) return;
              void m.sendChat(normalizedId, message);
              setMessage('');
            }}
          >
            <Input
              placeholder="Mensagem..."
              aria-label="Mensagem do chat"
              required
              value={message}
              onChange={event => setMessage(event.target.value)}
              maxLength={500}
            />
            <Button size="icon" type="submit" aria-label="Enviar mensagem">
              <Send />
            </Button>
          </form>

          {isHost ? (
            <Button
              variant="outline"
              size="sm"
              className="mt-8 w-full text-primary"
              onClick={() => {
                if (window.confirm('Encerrar a sala e desconectar todos os participantes?')) {
                  void m.closeRoom(normalizedId);
                  void nav({ to: '/rooms' });
                }
              }}
            >
              <X />
              Encerrar sala
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="mt-8 w-full"
              onClick={() => {
                void m.leaveRoom(normalizedId);
                void nav({ to: '/rooms' });
              }}
            >
              <LogOut />
              Sair da sala
            </Button>
          )}
        </aside>
      </div>
    </main>
  );
}
