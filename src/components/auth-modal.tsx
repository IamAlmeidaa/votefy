import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { LogIn, LogOut, Radio, User, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useMusic } from '@/components/music-provider';

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
      setError(err instanceof Error ? err.message : 'Erro ao processar solicitação.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          size="sm"
          variant={mode === 'login' ? 'default' : 'outline'}
          onClick={() => switchMode('login')}
        >
          <LogIn />
          Entrar
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === 'register' ? 'default' : 'outline'}
          onClick={() => switchMode('register')}
        >
          <UserPlus />
          Criar conta
        </Button>
      </div>

      <form className="dialog-form" onSubmit={event => void handleSubmit(event)}>
        <label>
          Usuário
          <Input
            aria-label="Usuário"
            value={username}
            onChange={event => setUsername(event.target.value)}
            placeholder="Digite seu usuário"
            autoComplete="username"
            required
          />
        </label>

        <label>
          Senha
          <Input
            aria-label="Senha"
            type="password"
            value={password}
            onChange={event => setPassword(event.target.value)}
            placeholder="Digite sua senha"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
          />
        </label>

        {mode === 'register' && (
          <label>
            Confirmar senha
            <Input
              aria-label="Confirmar senha"
              type="password"
              value={confirmPassword}
              onChange={event => setConfirmPassword(event.target.value)}
              placeholder="Repita sua senha"
              autoComplete="new-password"
              required
            />
          </label>
        )}

        {error && <p className="text-xs text-primary">{error}</p>}

        <Button type="submit" disabled={submitting}>
          {mode === 'login' ? <LogIn /> : <UserPlus />}
          {submitting
            ? mode === 'login'
              ? 'Entrando...'
              : 'Criando conta...'
            : mode === 'login'
              ? 'Entrar'
              : 'Cadastrar'}
        </Button>
      </form>
    </div>
  );
}

export function AuthButton() {
  const m = useMusic();
  const [open, setOpen] = useState(false);

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
          <DialogDescription>
            Entre com seu usuário e senha ou crie uma conta para participar das salas musicais.
          </DialogDescription>
          <AuthForm onSuccess={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

export function LoginPage() {
  const m = useMusic();
  const nav = useNavigate();

  return (
    <main className="page">
      <div className="greeting">
        <div>
          <h1>Conta Votefy</h1>
          <p>Entre com seu usuário ou crie seu perfil em segundos</p>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/">
            <Radio />
            Voltar ao início
          </Link>
        </Button>
      </div>

      <section className="section max-w-md mx-auto">
        {m.currentUser ? (
          <div className="empty-state">
            <User />
            <h2>Conectado como {m.currentUser.username}</h2>
            <p>Seu usuário já está ativo para votar nas músicas e entrar nas salas.</p>
            <div className="flex gap-2">
              <Button asChild>
                <Link to="/rooms">Ir para salas</Link>
              </Button>
              <Button variant="outline" onClick={() => m.logout()}>
                <LogOut />
                Sair da conta
              </Button>
            </div>
          </div>
        ) : (
          <AuthForm onSuccess={() => void nav({ to: '/' })} />
        )}
      </section>
    </main>
  );
}