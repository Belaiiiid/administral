import { FlaskConical } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { ROUTES } from '@/app/router/paths';
import { AGENT_ROUTES } from '@/features/agent/paths';
import { Button } from '@/components/ui/button';
import { useSessionStore, type SessionRole } from '@/store/sessionStore';

/**
 * Development-only role toggle.
 *
 * ⚠️ NOT A SECURITY BOUNDARY — it flips a client-side flag and nothing more.
 * It exists because `sessionStore` has no auth module behind it yet, so the
 * back-office would otherwise be unreachable in the browser.
 *
 * <Header /> renders this behind `import.meta.env.DEV`, which Vite replaces
 * with `false` in production; the whole component is then dead code and is
 * dropped from the bundle. Verify with `npm run build` before shipping.
 */
export function DevRoleSwitch() {
  const role = useSessionStore((state) => state.role);
  const setRole = useSessionStore((state) => state.setRole);
  const navigate = useNavigate();

  const nextRole: SessionRole = role === 'citizen' ? 'agent' : 'citizen';

  const handleSwitch = () => {
    setRole(nextRole);
    // Land on the space we just switched into — staying put would bounce off
    // ProtectedRoute anyway.
    navigate(nextRole === 'agent' ? AGENT_ROUTES.root : ROUTES.portal);
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleSwitch}
      title="Outil de développement — sans effet en production"
    >
      <FlaskConical aria-hidden="true" />
      <span className="hidden sm:inline">
        Rôle&nbsp;: {role === 'citizen' ? 'citoyen' : 'agent'}
      </span>
      <span className="sr-only">
        Basculer vers l’espace {nextRole === 'agent' ? 'agent' : 'citoyen'}
      </span>
    </Button>
  );
}
