import { createFileRoute } from '@tanstack/react-router';
import { PlaylistPage } from '@/components/music-app';
import { pageMeta } from '@/lib/page-meta';
export const Route = createFileRoute('/playlists/$playlistId')({ head: () => pageMeta('Sua seleção musical', 'Reproduza e organize as músicas da sua playlist local.'), component: Page });
function Page() { const { playlistId } = Route.useParams(); return <PlaylistPage id={playlistId}/>; }