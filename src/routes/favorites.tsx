import { createFileRoute } from '@tanstack/react-router';
import { LibraryPage } from '@/components/music-app';
import { pageMeta } from '@/lib/page-meta';
export const Route = createFileRoute('/favorites')({ head: () => pageMeta('Músicas favoritas', 'Uma coleção das músicas locais que têm seu coração.'), component: () => <LibraryPage kind="favorites"/> });