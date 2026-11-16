import { createFileRoute } from '@tanstack/react-router';
import { LoginPage } from '@/components/auth-modal';

export const Route = createFileRoute('/login')({
  component: LoginPage,
});