import { createFileRoute } from "@tanstack/react-router";
import { EntryPage } from '@/components/auth-modal';

// The home route ships no og:image, so serve-time hosting can inject the
// project's social preview (explicit og:image or latest screenshot).
export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: 'Votefy — Seu player de música local' }, { name: 'description', content: 'Sua música, suas playlists e salas musicais locais. Um player pessoal que coloca você no controle.' }, { property: 'og:title', content: 'Votefy — Sua música, perto de você' }, { property: 'og:description', content: 'Ouça sua biblioteca local e escolha a próxima faixa em salas musicais simuladas.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' }] }),
  component: EntryPage,
});
