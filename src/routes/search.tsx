import { createFileRoute } from '@tanstack/react-router';
import { LibraryPage } from '@/components/music-app';
import { pageMeta } from '@/lib/page-meta';
export const Route = createFileRoute('/search')({ validateSearch: (search: Record<string,unknown>) => ({ q: typeof search.q === 'string' ? search.q : '' }), head: () => pageMeta('Buscar músicas', 'Encontre faixas da biblioteca por nome, artista ou arquivo.'), component: SearchPage });
function SearchPage() { const { q } = Route.useSearch(); return <LibraryPage kind="search" query={q}/>; }