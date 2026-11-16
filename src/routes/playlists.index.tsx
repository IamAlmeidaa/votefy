import { createFileRoute } from '@tanstack/react-router';
import { PlaylistsPage } from '@/components/music-app';
import { pageMeta } from '@/lib/page-meta';
export const Route = createFileRoute('/playlists/')({ validateSearch: (search: Record<string,unknown>) => ({ create: search.create === true || search.create === 'true' }), head: () => pageMeta('Suas playlists', 'Crie e organize seleções com as músicas do seu computador.'), component: Page });
function Page() { const { create } = Route.useSearch(); return <PlaylistsPage create={create}/>; }