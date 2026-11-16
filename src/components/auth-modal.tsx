import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { LogIn, LogOut, Radio, ShieldCheck, User, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useMusic } from '@/components/music-provider';
import { ProfilePage } from '@/components/profile-page';

export function AuthForm({
  initialMode = 'login',
  onSuccess,
}: {
  initialMode?: 'login' | 'register';
  onSuccess?: () => void;
}) {
  const m = useMusic();
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const switchMode = (next: 'login' | 'register') => {
    setMode(next);
    setError('');
    setPassword('');
    setConfirmPassword('');
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (mode === 'register') {
        await m.register(username, password, confirmPassword);
      } else {
        await m.login(username, password);
      }
      setUsername('');
      setPassword('');
      setConfirmPassword('');
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir a solicitação.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-form-wrap">
      <div className="auth-switch" role="tablist" aria-label="Acesso à conta">
        <Button
          type="button"
          role="tab"
          aria-selected={mode === 'login'}
          size="sm"
          variant={mode === 'login' ? 'default' : 'ghost'}
          onClick={() => switchMode('login')}
        >
          <LogIn />
          Entrar
        </Button>
        <Button
          type="button"
          role="tab"
          aria-selected={mode === 'register'}
          size="sm"
          variant={mode === 'register' ? 'default' : 'ghost'}
          onClick={() => switchMode('register')}
        >
          <UserPlus />
          Criar conta
        </Button>
      </div>

      <form className="dialog-form auth-form" onSubmit={event => void handleSubmit(event)}>
        <label>
          Nome de usuário
          <Input
            aria-label="Nome de usuário"
            aria-invalid={Boolean(error)}
            autoCapitalize="none"
            autoComplete="username"
            maxLength={32}
            name="username"
            onChange={event => setUsername(event.target.value)}
            placeholder="Seu nome de usuário"
            required
            value={username}
          />
        </label>

        <label>
          Senha
          <Input
            aria-label="Senha"
            aria-invalid={Boolean(error)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            maxLength={128}
            minLength={mode === 'register' ? 5 : undefined}
            name="password"
            onChange={event => setPassword(event.target.value)}
            placeholder={mode === 'register' ? 'Use pelo menos 5 caracteres' : 'Sua senha'}
            required
            type="password"
            value={password}
          />
        </label>

        {mode === 'register' && (
          <label>
            Confirmar senha
            <Input
              aria-label="Confirmar senha"
              aria-invalid={Boolean(error)}
              autoComplete="new-password"
              maxLength={128}
              name="confirmPassword"
              onChange={event => setConfirmPassword(event.target.value)}
              placeholder="Digite a senha novamente"
              required
              type="password"
              value={confirmPassword}
            />
          </label>
        )}

        {error && <p className="auth-error" role="alert">{error}</p>}

        <Button className="auth-submit" type="submit" disabled={submitting}>
          {mode === 'login' ? <LogIn /> : <UserPlus />}
          {submitting
            ? mode === 'login' ? 'Entrando…' : 'Criando conta…'
            : mode === 'login' ? 'Entrar na conta' : 'Criar minha conta'}
        </Button>
        <p className="auth-form-note">
          <ShieldCheck size={14} /> Sua senha é protegida e nunca aparece no seu perfil.
        </p>
      </form>
    </div>
  );
}
export function AuthButton() {
  const m = useMusic();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const openForProtectedAction = () => setOpen(true);
    window.addEventListener('votefy:auth-required', openForProtectedAction);
    return () => window.removeEventListener('votefy:auth-required', openForProtectedAction);
  }, []);

  if (m.currentUser) {
    return (
      <div className="flex items-center gap-2">
        <span className="small-tag flex items-center gap-1.5">
          <User size={13} />
          {m.currentUser.username}
        </span>
        <Button variant="ghost" size="sm" onClick={() => m.logout()}>
          <LogOut />
          Sair
        </Button>
      </div>
    );
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <LogIn />
        Entrar
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>Acesse sua conta</DialogTitle>
          <DialogDescription>Entre ou crie uma conta para participar das salas musicais.</DialogDescription>
          <AuthForm onSuccess={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

export function LoginPage() {
  const m = useMusic();
  if (m.currentUser) return <ProfilePage />;

  return (
    <main className="auth-page">
      <div className="auth-page-top">
        <span />
        <Link className="auth-brand" to="/" aria-label="Votefy início">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>
          Votefy
        </Link>
      </div>

      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-card-heading">
          <span className="auth-icon"><Radio size={21} /></span>
          <span className="eyebrow">Sua comunidade musical</span>
          <h1 id="auth-title">Sua música. Sua conta.</h1>
          <p>Entre para votar, criar salas e curtir música junto com todo mundo.</p>
        </div>

        <AuthForm />
        <p className="auth-privacy"><ShieldCheck size={14} /> Acesso protegido em conexão segura</p>
      </section>

      <p className="auth-footer">Votefy <span>·</span> Música é melhor quando compartilhada.</p>
    </main>
  );
}
