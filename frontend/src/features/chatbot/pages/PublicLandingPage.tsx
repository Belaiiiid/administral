import { Link } from 'react-router-dom';

import { ROUTES } from '@/app/router/paths';
import { Logo } from '@/components/layout/Logo';
import { Button } from '@/components/ui/button';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { ChatWindow } from '@/features/chatbot/components/ChatWindow';
import { useChatbot } from '@/features/chatbot/hooks/useChatbot';

/**
 * Public entry point (`/`) for a visitor with no session.
 *
 * The assistant first, an account second: a citizen unsure whether they are
 * even eligible should not have to register before finding out. It is the
 * same `useChatbot` + `ChatWindow` the authenticated `/chat` page uses — the
 * anonymous case was already supported server-side
 * (`get_current_user_optional`), so nothing new was needed there, only a
 * place to reach it before signing in.
 *
 * "Se connecter" is the only way further in from here; there is no session
 * to protect and nothing to fabricate for one that does not exist yet.
 */
export default function PublicLandingPage() {
  useDocumentTitle('MonParcours — Assistant');
  const controller = useChatbot();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-30 flex h-header items-center justify-between border-b border-border bg-surface-lowest px-margin-mobile md:px-gutter">
        <Logo />
        <Button asChild>
          <Link to={ROUTES.login}>Se connecter</Link>
        </Button>
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto flex w-full max-w-container flex-1 flex-col px-margin-mobile py-8 focus:outline-none md:px-gutter"
      >
        <div className="mb-6 text-center">
          <h1 className="text-headline-lg text-primary">Comment pouvons-nous vous aider ?</h1>
          <p className="mx-auto mt-2 max-w-form text-body-md text-on-surface-variant">
            Posez vos questions sur votre éligibilité, une démarche ou un document — sans avoir
            besoin de créer de compte.
          </p>
        </div>

        <ChatWindow controller={controller} />
      </main>
    </div>
  );
}
