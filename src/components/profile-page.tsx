import { useEffect, useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Award, Check, Clock3, Coins, ImagePlus, LoaderCircle, LogOut, Save, ShieldCheck, ShoppingBag, Sparkles, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useMusic } from '@/components/music-provider';

type Mission = { id: string; title: string; description: string; kind: 'songs' | 'listening'; target: number; progress: number; reward: number; completed: boolean };
type Decoration = { id: string; name: string; description: string; cost: number; style: string };
type Profile = {
  id: string; username: string; nickname: string; profile_picture: string; caption: string; bio: string; background: string;
  border_color: string; achievements: string[]; listened_minutes: number; orbs: number; equipped_decoration: string | null;
  missions: Mission[]; mission_resets_at: string; decorations: Decoration[]; owned_decorations: string[];
};

const achievements = [
  { id: 'custom-profile', title: 'Identidade própria', detail: 'Personalize o seu perfil.', target: 0 },
  { id: 'first-hour', title: 'Uma hora de música', detail: 'Ouça 60 minutos com sua conta.', target: 60 },
  { id: 'ten-hours', title: 'No ritmo', detail: 'Ouça 10 horas com sua conta.', target: 600 },
];

function formatListeningTime(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return hours ? `${hours} h ${remainingMinutes} min` : `${remainingMinutes} min`;
}

function formatCountdown(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor(seconds % 3600 / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function ProfilePage() {
  const music = useMusic();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [bannerPreview, setBannerPreview] = useState('');
  const [countdown, setCountdown] = useState('00:00:00');

  useEffect(() => {
    let active = true;
    void fetch('/api/auth?view=profile', { cache: 'no-store' })
      .then(async response => {
        const payload = await response.json() as Profile & { error?: string };
        if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar o perfil.');
        if (active) setProfile(payload);
      })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o perfil.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!music.currentUser) return;
    const interval = setInterval(() => {
      void fetch('/api/auth?view=profile', { cache: 'no-store' })
        .then(response => response.ok ? response.json() as Promise<Profile> : null)
        .then(next => { if (next) setProfile(next); })
        .catch(() => {});
    }, 30_000);
    return () => clearInterval(interval);
  }, [music.currentUser]);

  useEffect(() => {
    const update = () => setCountdown(formatCountdown((profile?.mission_resets_at ? Date.parse(profile.mission_resets_at) : Date.now()) - Date.now()));
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [profile?.mission_resets_at]);

  useEffect(() => {
    return () => { if (avatarPreview) URL.revokeObjectURL(avatarPreview); };
  }, [avatarPreview]);

  useEffect(() => {
    return () => { if (bannerPreview) URL.revokeObjectURL(bannerPreview); };
  }, [bannerPreview]);

  const setField = <K extends keyof Profile>(key: K, value: Profile[K]) => {
    setProfile(current => current ? { ...current, [key]: value } : current);
    setError(''); setSuccess('');
  };

  const postAction = async (action: 'redeem' | 'equip', decorationId: string | null) => {
    setBusyId(decorationId || 'unequip'); setError(''); setSuccess('');
    try {
      const response = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, decorationId }) });
      const payload = await response.json() as Profile & { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Não foi possível atualizar as decorações.');
      setProfile(payload); setSuccess(action === 'redeem' ? 'Decoração resgatada.' : 'Decoração atualizada.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível atualizar as decorações.'); }
    finally { setBusyId(''); }
  };

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!profile) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      let next: Profile = profile;
      const uploads: Array<[string, File | null]> = [['avatar', avatarFile], ['banner', bannerFile]];
      for (const [kind, file] of uploads) {
        if (!file) continue;
        const form = new FormData(); form.append('kind', kind); form.append('file', file);
        const response = await fetch('/api/auth', { method: 'POST', body: form });
        const payload = await response.json() as Profile & { error?: string };
        if (!response.ok) throw new Error(payload.error || 'Não foi possível enviar a imagem.');
        next = payload;
      }
      const response = await fetch('/api/auth', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'profile', nickname: next.nickname, caption: next.caption, bio: next.bio, border_color: next.border_color }),
      });
      const payload = await response.json() as Profile & { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Não foi possível salvar as alterações.');
      setProfile(payload); setAvatarFile(null); setBannerFile(null); setAvatarPreview(''); setBannerPreview(''); setSuccess('Perfil atualizado.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível salvar as alterações.'); }
    finally { setSaving(false); }
  };

  const avatarSrc = avatarPreview || profile?.profile_picture || '';
  const bannerSrc = bannerPreview || profile?.background || '';
  const unlocked = useMemo(() => new Set(profile?.achievements ?? []), [profile?.achievements]);

  if (loading) return <main className="page"><div className="profile-loading"><LoaderCircle className="animate-spin" /> Carregando perfil…</div></main>;
  if (!music.currentUser || !profile) return <main className="page"><section className="profile-login-card"><span className="auth-icon"><UserRound /></span><h1>Seu perfil começa com uma conta</h1><p>Entre ou crie uma conta para personalizar seu perfil e guardar suas conquistas.</p><Button asChild><Link to="/login">Entrar ou criar conta</Link></Button>{error && <p className="auth-error" role="alert">{error}</p>}</section></main>;

  return (
    <main className="page profile-page">
      <div className="greeting"><div><span className="eyebrow">SUA CONTA</span><h1>Seu perfil</h1><p>Seu espaço musical, com a sua identidade.</p></div><Button variant="ghost" size="sm" onClick={music.logout}><LogOut size={15} /> Sair</Button></div>

      <section className="profile-layout">
        <div className="profile-main-column">
          <article className={`profile-preview ${profile.equipped_decoration ? `decoration-${profile.decorations.find(item => item.id === profile.equipped_decoration)?.style || ''}` : ''}`} style={{ borderColor: profile.border_color }}>
            {bannerSrc && <img className="profile-background" src={bannerSrc} alt="" />}
            <div className="profile-preview-shade" />
            <div className="profile-preview-content">
              <div className="profile-identity-row">
                <div className="profile-picture" style={{ borderColor: profile.border_color }}>{avatarSrc ? <img src={avatarSrc} alt={`Foto de ${profile.nickname}`} /> : <UserRound size={35} />}</div>
                <div className="profile-identity-copy"><h2>{profile.nickname || profile.username}</h2><span>@{profile.username}</span></div>
              </div>
              <p>{profile.caption || 'Sua trilha começa aqui.'}</p>
              {profile.bio && <p className="profile-preview-bio">{profile.bio}</p>}
              <div className="profile-preview-tags"><span><Clock3 size={13} /> {formatListeningTime(profile.listened_minutes)} ouvidos</span>{profile.equipped_decoration && <span><Sparkles size={13} /> Decoração equipada</span>}</div>
            </div>
          </article>

          <form className="profile-form" onSubmit={event => void saveProfile(event)}>
            <div className="profile-section-heading"><div><h2>Personalizar perfil</h2><p>Adicione uma foto e um banner do seu computador. GIF funciona no banner.</p></div><ShieldCheck size={19} /></div>
            <label className="profile-field">Username<Input value={profile.username} readOnly aria-label="Username" /><small>Seu username identifica sua conta e não pode ser alterado.</small></label>
            <label className="profile-field">Nickname<Input maxLength={40} value={profile.nickname} onChange={event => setField('nickname', event.target.value)} placeholder="Como quer ser chamado?" required /></label>
            <label className="profile-field">Profile Picture<Input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={event => { const file = event.target.files?.[0] ?? null; setAvatarFile(file); setAvatarPreview(file ? URL.createObjectURL(file) : ''); }} /><small>PNG, JPEG, WebP ou GIF. Máximo de 4 MB. {profile.profile_picture && !avatarFile ? 'A foto atual será mantida.' : ''}</small></label>
            <label className="profile-field">Legenda<Input maxLength={80} value={profile.caption} onChange={event => setField('caption', event.target.value)} placeholder="Uma frase curta sobre você" /></label>
            <label className="profile-field">Bio<textarea maxLength={500} rows={4} value={profile.bio} onChange={event => setField('bio', event.target.value)} placeholder="Conte um pouco sobre seu gosto musical…" /><small>{profile.bio.length}/500</small></label>
            <label className="profile-field">Background / banner<Input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={event => { const file = event.target.files?.[0] ?? null; setBannerFile(file); setBannerPreview(file ? URL.createObjectURL(file) : ''); }} /><small>PNG, JPEG, WebP ou GIF animado. Máximo de 6 MB. Apenas arquivos do computador.</small></label>
            <label className="profile-field profile-color-field">Border color<span className="profile-color-control"><input type="color" aria-label="Border color" value={profile.border_color} onChange={event => setField('border_color', event.target.value)} /><code>{profile.border_color.toUpperCase()}</code></span></label>
            {error && <p className="auth-error" role="alert">{error}</p>}{success && <p className="profile-success" role="status"><Check size={15} />{success}</p>}
            <Button className="profile-save" type="submit" disabled={saving}>{saving ? <LoaderCircle className="animate-spin" /> : <Save size={16} />}{saving ? 'Salvando…' : 'Salvar perfil'}</Button>
          </form>

          <article className="profile-achievements"><div className="profile-section-heading"><div><h2>Missões</h2><p>Novas missões a cada ciclo de 6 horas.</p></div><span className="mission-reset"><Clock3 size={14} /> {countdown}</span></div>
            <div className="mission-list">{profile.missions.map(mission => { const progress = Math.min(100, Math.round(mission.progress / mission.target * 100)); return <div className={`mission-card ${mission.completed ? 'mission-complete' : ''}`} key={mission.id}><span className="achievement-mark">{mission.completed ? <Check size={15} /> : <Sparkles size={15} />}</span><div className="achievement-copy"><div className="mission-title-row"><strong>{mission.title}</strong><span><Coins size={13} /> {mission.reward}</span></div><p>{mission.description}</p><div className="achievement-progress"><span style={{ width: `${progress}%` }} /></div><small>{Math.min(mission.progress, mission.target)} / {mission.target} {mission.kind === 'songs' ? 'músicas' : 'minutos'}</small></div></div>; })}</div>
          </article>
        </div>

        <aside className="profile-aside">
          <article className="profile-stat-card"><span className="profile-stat-icon"><Clock3 size={19} /></span><span className="eyebrow">TEMPO DE MÚSICA</span><strong>{formatListeningTime(profile.listened_minutes)}</strong><p>contabilizado enquanto você está conectado e ouvindo.</p></article>
          <article className="profile-stat-card orb-stat"><span className="profile-stat-icon"><Coins size={19} /></span><span className="eyebrow">SEU SALDO</span><strong>{profile.orbs} Deesi Coins</strong><p>Complete missões para ganhar mais e resgatar decorações.</p></article>
          <article className="profile-achievements"><div className="profile-section-heading"><div><h2>Conquistas</h2><p>Marcos da sua jornada musical.</p></div><Award size={19} /></div><div className="achievement-list">{achievements.map(achievement => { const earned = unlocked.has(achievement.id); const progress = achievement.target ? Math.min(100, Math.round(profile.listened_minutes / achievement.target * 100)) : earned ? 100 : 0; return <div className={`achievement-item ${earned ? 'earned' : ''}`} key={achievement.id}><span className="achievement-mark">{earned ? <Check size={15} /> : <Award size={15} />}</span><div className="achievement-copy"><strong>{achievement.title}</strong><p>{achievement.detail}</p>{!earned && achievement.target > 0 && <div className="achievement-progress"><span style={{ width: `${progress}%` }} /></div>}</div></div>; })}</div><div className="profile-listen-note"><Award size={15} />{unlocked.has('custom-profile') ? 'Continue ouvindo para alcançar novos marcos.' : 'Complete seu perfil para desbloquear sua primeira conquista.'}</div></article>
          <article className="profile-achievements decoration-shop"><div className="profile-section-heading"><div><h2>Loja de decorações</h2><p>Itens cosméticos para seu perfil.</p></div><ShoppingBag size={19} /></div><div className="decoration-list">{profile.decorations.map(item => { const owned = profile.owned_decorations.includes(item.id); const equipped = profile.equipped_decoration === item.id; return <div className="decoration-item" key={item.id}><span className={`decoration-swatch decoration-swatch-${item.style}`}><Sparkles size={18} /></span><div className="decoration-copy"><strong>{item.name}</strong><p>{item.description}</p><small><Coins size={12} /> {item.cost} Deesi Coins</small></div>{owned ? <Button size="sm" variant={equipped ? 'secondary' : 'outline'} disabled={busyId !== ''} onClick={() => void postAction('equip', equipped ? null : item.id)}>{busyId === item.id || busyId === 'unequip' && equipped ? <LoaderCircle className="animate-spin" size={14} /> : equipped ? 'Usando' : 'Equipar'}</Button> : <Button size="sm" variant="outline" disabled={profile.orbs < item.cost || busyId !== ''} onClick={() => void postAction('redeem', item.id)}>{busyId === item.id ? <LoaderCircle className="animate-spin" size={14} /> : <><ImagePlus size={13} /> Resgatar</>}</Button>}</div>; })}</div></article>
        </aside>
      </section>
    </main>
  );
}
