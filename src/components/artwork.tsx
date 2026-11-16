import { useEffect, useState } from 'react';
import electric from '@/assets/electric.jpg';
import chill from '@/assets/chill.jpg';
import focus from '@/assets/focus.jpg';
export const artwork = [electric, chill, focus];
export function Artwork({ cover, art = 0, className = '' }: { cover?: Blob | undefined; art?: number; className?: string }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => { if (!cover) { setUrl(undefined); return; } const value = URL.createObjectURL(cover); setUrl(value); return () => URL.revokeObjectURL(value); }, [cover]);
  return <img src={url || artwork[art % artwork.length]} alt="Capa" width={816} height={816} loading="lazy" className={`artwork ${className}`} />;
}