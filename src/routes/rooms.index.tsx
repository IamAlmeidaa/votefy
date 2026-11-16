import { createFileRoute } from '@tanstack/react-router';
import { RoomsPage } from '@/components/music-app';
import { pageMeta } from '@/lib/page-meta';
export const Route = createFileRoute('/rooms/')({ validateSearch: (search: Record<string,unknown>) => ({ create: search.create === true || search.create === 'true' }), head: () => pageMeta('Salas musicais', 'Crie salas locais com participantes simulados e votação da próxima música.'), component: Page });
function Page() { const { create } = Route.useSearch(); return <RoomsPage create={create}/>; }