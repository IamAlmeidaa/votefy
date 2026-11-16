import { useEffect, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowUpRight, Check, Clock, Copy, Heart, ListMusic, LogOut, Music2, Play, Pause, Plus, Radio, Send, Shuffle, SkipForward, Trash2, UserPlus, Users, Wifi, WifiOff, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Artwork } from '@/components/artwork';
import { useMusic } from '@/components/music-provider';
import { candidates, time } from '@/lib/music';

function SignalCode({ label, value }: { label: string; value: string }) {
  const m = useMusic();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      m.setNotice('Código copiado. Envie para a outra pessoa.');
    } catch {
      m.setNotice('Selecione o código e copie manualmente.');
    }
  };
  return <div className="signal-field"><label>{label}<textarea aria-label={label} className="signal-code" readOnly rows={4} value={value} onFocus={event => event.currentTarget.select()}/></label><Button type="button" variant="outline" size="sm" onClick={() => void copy()}><Copy/>Copiar código</Button></div>;
}

export function RoomsPage({ create = false }: { create?: boolean | undefined }) {
  const m = useMusic();
  const nav = useNavigate();
  const [open, setOpen] = useState(create ?? false);
  const [name, setName] = useState('');
  const [participant, setParticipant] = useState('Host');
  const [guestName, setGuestName] = useState('');
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  useEffect(() => { if (create) setOpen(true); }, [create]);
  const join = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!guestName.trim() || !code.trim()) return;
    setJoining(true);
    try {
      const joined = await m.joinRoom(code, guestName);
      void nav({ to: '/rooms/$roomId', params: { roomId: joined.roomId } });
    } catch (error) {
      m.setNotice(error instanceof Error ? error.message : 'Não foi possível entrar na sala.');
    } finally { setJoining(false); }
  };
  return <main className="page"><div className="greeting"><div><h1>Salas musicais</h1><p>Pessoas reais na mesma rede · O som toca no host</p></div><Button onClick={() => setOpen(true)}><Plus/>Criar sala</Button></div>
    <section className="lan-explainer"><Wifi/><div><h2>Conexão direta, sem servidor</h2><p>O host gera um convite. O convidado usa o convite e devolve uma resposta. Depois disso, músicas, votos e chat circulam diretamente entre os navegadores na rede local.</p></div></section>
    <section className="section"><div className="section-heading"><h2><UserPlus/>Entrar como convidado</h2></div><form className="join-lan-form" onSubmit={event => void join(event)}><Input aria-label="Seu nome como convidado" value={guestName} onChange={event => setGuestName(event.target.value)} placeholder="Seu nome" required maxLength={40}/><label className="grid gap-2 text-xs text-muted-foreground">Código recebido do host<textarea aria-label="Código de convite do host" className="signal-code" rows={5} value={code} onChange={event => setCode(event.target.value)} placeholder="Cole aqui o código de convite" required/></label><Button variant="outline" type="submit" disabled={joining}>{joining ? 'Gerando resposta...' : 'Entrar na sala'}<ArrowUpRight/></Button></form></section>
    <section className="section"><div className="section-heading"><h2>Suas salas abertas</h2></div><div className="room-list">{m.rooms.map(room => { const membership = m.memberships[room.id]; return <div className="room-preview" key={room.id}><div className="room-symbol"><Radio/></div><div><h3>{room.name}</h3><p>{room.participants.length} participantes reais · {membership?.role === 'host' ? 'Você é o host' : membership?.status === 'connected' ? 'Conectado' : 'Aguardando conexão'}</p></div><Button className="ml-auto" variant="secondary" asChild><Link to="/rooms/$roomId" params={{ roomId: room.id }}>Abrir sala<ArrowUpRight/></Link></Button></div>; })}</div>{!m.rooms.length && <div className="empty-state"><Radio/><h2>Uma rede, várias escolhas</h2><p>Crie uma sala como host ou entre com o código de convite de outra pessoa.</p><Button onClick={() => setOpen(true)}><Plus/>Criar sala</Button></div>}</section>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogTitle>Criar sala na rede local</DialogTitle><DialogDescription>Suas músicas serão visíveis aos convidados, mas o áudio tocará somente neste dispositivo.</DialogDescription><form className="dialog-form" onSubmit={event => { event.preventDefault(); if (!name.trim() || !participant.trim()) return; const id = m.createRoom(name, participant); setOpen(false); setName(''); void nav({ to: '/rooms/$roomId', params: { roomId: id } }); }}><label>Nome da sala<Input aria-label="Nome da sala" value={name} onChange={event => setName(event.target.value)} required maxLength={70}/></label><label>Seu nome<Input aria-label="Seu nome como host" value={participant} onChange={event => setParticipant(event.target.value)} required maxLength={40}/></label><Button type="submit"><Radio/>Criar sala</Button></form></DialogContent></Dialog>
  </main>;
}

export function RoomPage({ id }: { id: string }) {
  const m = useMusic();
  const nav = useNavigate();
  const room = m.rooms.find(item => item.id === id);
  const membership = m.memberships[id];
  const [message, setMessage] = useState('');
  const [manual, setManual] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  if (!room || !membership) return <main className="page"><div className="empty-state"><WifiOff/><h1>Sala não encontrada</h1><p>Entre novamente com um convite do host.</p><Button asChild><Link to="/rooms">Voltar às salas</Link></Button></div></main>;
  const isHost = membership.role === 'host';
  const connected = isHost || membership.status === 'connected';
  const self = room.participants.find(person => person.id === membership.participantId);
  const roomTracks = isHost ? m.tracks : m.remoteTracks[id] || [];
  const current = roomTracks.find(track => track.id === room.current);
  const counts = room.options.map(option => Object.values(room.votes).filter(vote => vote === option).length);
  const total = counts.reduce((sum, count) => sum + count, 0);
  const highest = Math.max(0, ...counts);
  const start = () => { const track = current || m.tracks[0]; if (track) m.play(track.id, undefined, id); else m.setNotice('Adicione músicas à biblioteca antes de iniciar a sala.'); };
  const accept = async (inviteId: string) => {
    try { await m.acceptAnswer(inviteId, answers[inviteId] || ''); } catch (error) { m.setNotice(error instanceof Error ? error.message : 'Resposta inválida.'); }
  };
  return <main className="page"><div className="greeting"><div><h1>{room.name}</h1><p><span className="text-primary">{room.id}</span> · {room.participants.length} participantes reais · <span className={connected ? 'text-success' : ''}>{isHost ? 'Você é o host' : connected ? 'Conectado ao host' : 'Aguardando conexão'}</span></p></div><Button variant="ghost" size="icon" aria-label="Sair da sala" title="Sair da sala" onClick={() => { if (!isHost) m.leaveRoom(id); void nav({ to: '/rooms' }); }}><LogOut/></Button></div>
    {!connected && <div className="lan-status"><Wifi/><div><strong>Quase lá</strong><p>Copie sua resposta abaixo e envie ao host. A sala abrirá quando ele confirmar o código.</p></div></div>}
    <div className="room-layout"><div><section className="room-current"><Artwork cover={current && 'cover' in current ? current.cover : undefined}/><div className="flex-1 min-w-0"><span className="eyebrow">{isHost ? 'TOCANDO NO HOST' : 'TOCANDO NO DISPOSITIVO DO HOST'}</span><h2>{current?.title || 'A sala está pronta'}</h2><p>{current?.artist || 'O host escolherá a primeira música.'}</p>{isHost && m.activeRoom === id && <div className="timeline"><span>{time(m.elapsed)}</span><input aria-label="Progresso na sala" type="range" min="0" max={m.duration || 1} value={Math.min(m.elapsed, m.duration || 1)} step=".1" onChange={event => m.seek(Number(event.target.value))}/><span>{time(m.duration)}</span></div>}{isHost && <Button size="sm" onClick={() => m.activeRoom === id ? m.toggle() : start()} className="mt-4">{m.playing && m.activeRoom === id ? <Pause/> : <Play/>}{m.playing && m.activeRoom === id ? 'Pausar' : 'Reproduzir no host'}</Button>}</div></section>
      <section className="section"><div className="section-heading"><h2>Qual é a próxima?</h2><span className={`small-tag ${room.open ? 'text-success' : ''}`}>{room.open ? 'VOTAÇÃO ABERTA' : 'VOTAÇÃO ENCERRADA'}</span></div><p className="text-xs text-muted-foreground mb-4">{self ? <>Votando como <strong className="text-foreground">{self.name}</strong> · </> : ''}{total} votos nesta rodada</p><div className="voting-grid">{room.options.map((option, index) => { const track = roomTracks.find(item => item.id === option); if (!track) return null; const voters = room.participants.filter(person => room.votes[person.id] === option); const selected = room.votes[membership.participantId] === option; return <article className={`vote-card ${counts[index] === highest && highest > 0 ? 'leading' : ''}`} key={option}><div className="track-info"><Artwork cover={'cover' in track ? track.cover : undefined} art={index}/><div className="min-w-0"><strong>{track.title}</strong><small>{track.artist}</small></div></div><div className="vote-bar"><progress value={counts[index]} max={total || 1}/></div><div className="flex justify-between text-xs text-muted-foreground mb-3"><span>{counts[index]} votos</span><span>{total ? Math.round((counts[index] || 0) / total * 100) : 0}% {counts[index] === highest && highest > 0 ? '· Liderando' : ''}</span></div><Button size="sm" variant={selected ? 'default' : 'outline'} disabled={!room.open || !connected} className="w-full" onClick={() => m.castVote(id, option)}>{selected ? <Check/> : <Heart/>}{selected ? 'Seu voto' : 'Votar'}</Button><p className="text-xs text-muted-foreground mt-2 min-h-4">{voters.map(person => person.name).join(', ') || 'Sem votos ainda'}</p></article>; })}</div>{!room.options.length && <div className="skeleton-card"><Music2/><p>{isHost ? 'Inicie uma música para abrir a primeira rodada.' : 'Aguarde o host iniciar uma música e abrir a votação.'}</p></div>}</section>
      <section className="section"><div className="section-heading"><h2><ListMusic/>Músicas compartilhadas pelo host</h2><span className="small-tag">{roomTracks.length} FAIXAS</span></div><div className="shared-track-list">{roomTracks.map((track, index) => <div className="shared-track" key={track.id}><span className="track-number">{index + 1}</span><Artwork cover={'cover' in track ? track.cover : undefined} art={index}/><div><strong>{track.title}</strong><small>{track.artist} · {track.album}</small></div><span className="ml-auto text-muted-foreground">{time(track.duration)}</span></div>)}{!roomTracks.length && <p className="text-xs text-muted-foreground">O host ainda não compartilhou músicas.</p>}</div></section>
      {isHost && <section className="section border-t border-border pt-5"><h3 className="text-sm font-semibold">Controles do host</h3><div className="admin-controls"><Button size="sm" variant="secondary" disabled={!room.options.length} onClick={() => m.finishRound(id)}><SkipForward/>Pular / tocar vencedora</Button><Button size="sm" variant="secondary" disabled={!room.open} onClick={() => m.updateRoom(id, currentRoom => ({ ...currentRoom, open: false }))}><Check/>Encerrar votação</Button><Button size="sm" variant="secondary" onClick={() => m.updateRoom(id, currentRoom => ({ ...currentRoom, options: candidates(m.tracks.map(track => track.id), room.current), votes: {}, open: true }))}><Shuffle/>Novas opções</Button><Button size="sm" variant="outline" onClick={() => m.updateRoom(id, currentRoom => ({ ...currentRoom, votes: {} }))}><Trash2/>Limpar votos</Button></div><div className="flex flex-wrap gap-2"><select aria-label="Escolher próxima música" value={manual} onChange={event => setManual(event.target.value)}><option value="">Escolher próxima música</option>{m.tracks.filter(track => track.id !== room.current).map(track => <option value={track.id} key={track.id}>{track.title}</option>)}</select><Button variant="outline" size="sm" disabled={!manual} onClick={() => { if (!manual) return; m.updateRoom(id, currentRoom => ({ ...currentRoom, queue: [...currentRoom.queue, manual] })); setManual(''); }}><Plus/>Fila</Button><Button size="sm" disabled={!manual} onClick={() => m.finishRound(id, manual)}><Play/>Tocar agora</Button></div></section>}
      <section className="section"><div className="section-heading"><h2><ListMusic/>Fila da sala</h2></div>{room.queue.map((trackId, index) => <div className="add-row" key={`${trackId}-${index}`}><span>{roomTracks.find(track => track.id === trackId)?.title || 'Música removida'}</span>{isHost && <Button variant="ghost" size="icon" aria-label="Remover da fila" onClick={() => m.updateRoom(id, currentRoom => ({ ...currentRoom, queue: currentRoom.queue.filter((_, itemIndex) => itemIndex !== index) }))}><X/></Button>}</div>)}{!room.queue.length && <p className="text-xs text-muted-foreground">As vencedoras da votação tocam automaticamente no host.</p>}</section>
      <section className="section"><div className="section-heading"><h2><Clock/>Histórico de vencedoras</h2></div>{room.history.slice().reverse().map((history, index) => <div className="add-row" key={index}><Music2 size={14}/>{roomTracks.find(track => track.id === history.track)?.title || 'Música removida'}<span className="ml-auto text-muted-foreground">{history.votes} votos</span></div>)}{!room.history.length && <p className="text-xs text-muted-foreground">Nenhuma rodada concluída.</p>}</section>
    </div><aside className="room-aside"><h3 className="inline-heading"><Users size={16}/>Participantes <span className="small-tag">REAIS</span></h3>{room.participants.map(person => <div className="participant-row" key={person.id}><div className="avatar">{person.name.slice(0, 2).toUpperCase()}</div><span>{person.name}{person.id === room.admin && <small className="block text-primary text-[9px] mt-1">HOST</small>}</span>{isHost && person.id !== room.admin && <Button variant="ghost" size="icon" className="ml-auto" aria-label={`Remover ${person.name}`} onClick={() => m.removeParticipant(id, person.id)}><X/></Button>}</div>)}
      {isHost && <section className="invite-panel"><h3 className="inline-heading"><UserPlus size={16}/>Convidar pela rede</h3><p>1. Envie um convite. 2. Receba a resposta do convidado. 3. Cole-a aqui para conectar.</p><Button size="sm" className="w-full" disabled={m.creatingInvite} onClick={() => { void m.createInvite(id).catch(error => m.setNotice(error instanceof Error ? error.message : 'Não foi possível criar o convite.')); }}><Plus/>{m.creatingInvite ? 'Gerando convite...' : 'Gerar novo convite'}</Button>{m.invites.filter(invite => invite.roomId === id).map(invite => <div className="invite-card" key={invite.id}>{invite.status === 'connected' ? <p className="text-success text-xs"><Check className="inline" size={13}/> {invite.participantName || 'Participante'} conectado</p> : <><SignalCode label={`Código de convite ${invite.id.slice(0, 4)}`} value={invite.code}/><label className="grid gap-2 text-xs text-muted-foreground">Resposta do convidado<textarea aria-label={`Resposta para convite ${invite.id.slice(0, 4)}`} className="signal-code" rows={4} value={answers[invite.id] || ''} onChange={event => setAnswers(all => ({ ...all, [invite.id]: event.target.value }))} placeholder="Cole a resposta aqui"/></label><Button size="sm" variant="secondary" className="w-full" disabled={!answers[invite.id]?.trim() || invite.status === 'connecting'} onClick={() => void accept(invite.id)}><Wifi/>{invite.status === 'connecting' ? 'Conectando...' : 'Conectar participante'}</Button></>}</div>)}</section>}
      {!isHost && membership.answerCode && !connected && <section className="invite-panel"><h3>Sua resposta para o host</h3><SignalCode label="Seu código de resposta" value={membership.answerCode}/></section>}
      <h3 className="mt-8">Chat da sala</h3><div className="chat-messages">{room.chat.map((chat, index) => <p key={index}><strong>{chat.name}</strong>{chat.text}</p>)}{!room.chat.length && <p className="text-muted-foreground">A conversa começa aqui.</p>}</div><form className="chat-form" onSubmit={event => { event.preventDefault(); if (!message.trim() || !connected) return; m.sendChat(id, message); setMessage(''); }}><Input placeholder="Mensagem..." aria-label="Mensagem do chat" required value={message} onChange={event => setMessage(event.target.value)} maxLength={500} disabled={!connected}/><Button size="icon" type="submit" aria-label="Enviar mensagem" disabled={!connected}><Send/></Button></form>
      {isHost ? <Button variant="outline" size="sm" className="mt-8 w-full text-primary" onClick={() => { if (window.confirm('Encerrar a sala e desconectar todos os participantes?')) { m.closeRoom(id); void nav({ to: '/rooms' }); } }}><X/>Encerrar sala</Button> : <Button variant="outline" size="sm" className="mt-8 w-full" onClick={() => { m.leaveRoom(id); void nav({ to: '/rooms' }); }}><LogOut/>Sair e desconectar</Button>}
    </aside></div>
  </main>;
}
