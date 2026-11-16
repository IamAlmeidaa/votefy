import { createFileRoute } from '@tanstack/react-router';
import { RoomPage } from '@/components/lan-rooms';
import { pageMeta } from '@/lib/page-meta';
export const Route = createFileRoute('/rooms/$roomId')({ head: () => pageMeta('Sua sala musical', 'Vote na próxima faixa, simule participantes e converse no chat local da sala.'), component: Page });
function Page() { const { roomId } = Route.useParams(); return <RoomPage id={roomId}/>; }