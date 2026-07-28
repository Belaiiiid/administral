import { Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useProfilageStore } from '@/features/citizen/profiling/store/profilageStore';

/**
 * Bouton discret pour rouvrir l'overlay assistant s'il a été fermé.
 * Reste masqué quand le profil est complet.
 */
export function ProfilageReopenButton() {
  const estOuvert = useProfilageStore((s) => s.estOuvert);
  const profilComplet = useProfilageStore((s) => s.profilComplet);
  const nombreTours = useProfilageStore((s) => s.nombreTours);
  const limiteTours = useProfilageStore((s) => s.limiteTours);
  const ouvrir = useProfilageStore((s) => s.ouvrir);

  if (estOuvert || profilComplet) return null;

  return (
    <Button
      onClick={ouvrir}
      className="fixed bottom-6 right-6 z-30 gap-2 rounded-full px-5 py-3 shadow-soft"
    >
      <Sparkles aria-hidden="true" />
      Continuer avec l’assistant
      {nombreTours > 0 && (
        <span className="rounded-full bg-primary-foreground/15 px-2 py-0.5 text-label-sm">
          {nombreTours}/{limiteTours}
        </span>
      )}
    </Button>
  );
}
