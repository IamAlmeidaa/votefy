import { createFileRoute } from '@tanstack/react-router';
import { LibraryPage } from '@/components/music-app';
import { pageMeta } from '@/lib/page-meta';
export const Route = createFileRoute('/library')({ head: () => pageMeta('Minha biblioteca', 'Todas as suas músicas e álbuns, armazenados neste navegador.'), component: LibraryPage });