import { createFileRoute } from '@tanstack/react-router';
import { RoomsPage } from '@/components/lan-rooms';
import { z } from 'zod';
import { pageMeta } from '@/lib/page-meta';
export const Route = createFileRoute('/rooms/')({ validateSearch: z.object({ create: z.boolean().optional() }), head: () => pageMeta('Salas musicais', 'Crie salas locais com participantes simulados e votação da próxima música.'), component: Page });
function Page() { const { create } = Route.useSearch(); return <RoomsPage create={create}/>; }