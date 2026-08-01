import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';

import { ProtectedRoute } from '@/app/router/ProtectedRoute';
import { RequireApplProfile } from '@/app/router/RequireApplProfile';
import { ROUTES } from '@/app/router/paths';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { AppShell } from '@/components/layout/AppShell';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { FocusLayout } from '@/components/layout/FocusLayout';
import { RouteFallback } from '@/app/router/RouteFallback';
import { agentRoutes } from '@/features/agent';
import { useSessionStore } from '@/store/sessionStore';
import { useVoiceStore } from '@/features/voice/store/voiceStore';

const LoginPage = lazy(() => import('@/features/auth/pages/LoginPage'));
const RegisterPage = lazy(() => import('@/features/auth/pages/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('@/features/auth/pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('@/features/auth/pages/ResetPasswordPage'));
const VerifyEmailPage = lazy(() => import('@/features/auth/pages/VerifyEmailPage'));

const AdministrationsPage = lazy(() => import('@/features/portal/pages/AdministrationsPage'));
const CitizenDashboardPage = lazy(() => import('@/features/portal/pages/CitizenDashboardPage'));
const NotificationsPage = lazy(() => import('@/features/portal/pages/NotificationsPage'));
const CitizenSettingsPage = lazy(() => import('@/features/portal/pages/CitizenSettingsPage'));

const ProfilePage = lazy(() => import('@/features/citizen/profiling/pages/ProfilePage'));
const ProfilageOnboardingPage = lazy(
  () => import('@/features/citizen/profiling/pages/ProfilageOnboardingPage'),
);
const AccessibilityPreferencesPage = lazy(
  () => import('@/features/citizen/profiling/pages/AccessibilityPreferencesPage'),
);

const DocumentsPage = lazy(() => import('@/features/documents/pages/DocumentsPage'));
const DocumentUploadPage = lazy(() => import('@/features/documents/pages/DocumentUploadPage'));
const PersonalizedDossierPage = lazy(
  () => import('@/features/documents/pages/PersonalizedDossierPage'),
);
const SuiviDossierPage = lazy(() => import('@/features/documents/pages/SuiviDossierPage'));

const JobMatchPage = lazy(() => import('@/features/france-travail/pages/JobMatchPage'));
const CvCoachPage = lazy(() => import('@/features/france-travail/pages/CvCoachPage'));
const JobSearchPage = lazy(() => import('@/features/france-travail/pages/JobSearchPage'));

const ChatPage = lazy(() => import('@/features/chatbot/pages/ChatPage'));
const VoiceOnboardingPage = lazy(() => import('@/features/voice/pages/VoiceOnboardingPage').then(m => ({ default: m.VoiceOnboardingPage })));
const PublicLandingPage = lazy(() => import('@/features/chatbot/pages/PublicLandingPage'));
const NotFoundPage = lazy(() => import('@/features/portal/pages/NotFoundPage'));

const AdminDashboardPage = lazy(
  () => import('@/features/agent/admin/pages/AdminDashboardPage'),
);

/**
 * `/` — public by default. A signed-in visitor is sent straight to the
 * administrations list (there is nothing for them at a marketing/assistant
 * landing they have already moved past); everyone else meets the assistant
 * first and "Se connecter" second, never the other way around.
 */
function HomeRoute() {
  const user = useSessionStore((state) => state.user);
  const hasSeenVoiceOnboarding = useVoiceStore((state) => state.hasSeenVoiceOnboarding);

  if (!hasSeenVoiceOnboarding) {
    return <Navigate to={ROUTES.voiceOnboarding} replace />;
  }

  return user ? <Navigate to={ROUTES.administrations} replace /> : <PublicLandingPage />;
}

const router = createBrowserRouter([
  { path: ROUTES.home, element: <HomeRoute /> },
  { path: ROUTES.voiceOnboarding, element: <VoiceOnboardingPage /> },
  {
    // Entry journey — no application chrome.
    element: <AuthLayout />,
    children: [
      { path: ROUTES.login, element: <LoginPage /> },
      { path: ROUTES.register, element: <RegisterPage /> },
      // Emailed-link landings. Public by necessity: the token is the
      // credential, and these open from a mail client with no session.
      { path: ROUTES.forgotPassword, element: <ForgotPasswordPage /> },
      { path: ROUTES.resetPassword, element: <ResetPasswordPage /> },
      { path: ROUTES.verifyEmail, element: <VerifyEmailPage /> },
    ],
  },
  {
    // Signup-first profiling. Same distraction-free shell, but authenticated:
    // it lands a freshly-registered citizen here and persists their answers, so
    // it must run with a session (and bounce to login if opened without one).
    element: <ProtectedRoute />,
    children: [
      {
        element: <FocusLayout />,
        children: [{ path: ROUTES.onboardingProfilage, element: <ProfilageOnboardingPage /> }],
      },
    ],
  },
  {
    // Administrations list, then the CAF services hub behind it — public on
    // purpose (see `ROUTES.administrations`): browsing needs no account, only
    // opening APL à l'Aide while unauthenticated does (handled inside
    // `CitizenDashboardPage`, which sends that case to the public chatbot
    // instead of a login wall). No sidebar: there is nothing yet for one to
    // navigate before a service is picked (see `AppShell`). No header either:
    // no session-specific state to show, and a visitor with no account can
    // reach both of these pages.
    element: <AppShell hideSidebar hideHeader />,
    children: [
      { path: ROUTES.administrations, element: <AdministrationsPage /> },
      { path: ROUTES.portal, element: <CitizenDashboardPage /> },
    ],
  },
  {
    // Authenticated citizen area.
    element: <ProtectedRoute />,
    children: [
      {
        // Inside a service (APL today) — the sidebar applies.
        element: <AppShell />,
        children: [
          { path: ROUTES.portalNotifications, element: <NotificationsPage /> },

          { path: ROUTES.profile, element: <ProfilePage /> },
          { path: ROUTES.profileAccessibility, element: <AccessibilityPreferencesPage /> },
          { path: ROUTES.settings, element: <CitizenSettingsPage /> },

          {
            // APL's own profiling gate — see `RequireApplProfile`. Scoped to
            // just these two routes, not the whole citizen area — France
            // Travail's pages below have no APL profile to require.
            element: <RequireApplProfile />,
            children: [
              { path: ROUTES.dossier, element: <PersonalizedDossierPage /> },
              { path: ROUTES.suivi, element: <SuiviDossierPage /> },
            ],
          },
          { path: ROUTES.franceTravail, element: <JobMatchPage /> },
          { path: ROUTES.franceTravailCvCoach, element: <CvCoachPage /> },
          { path: ROUTES.franceTravailJobSearch, element: <JobSearchPage /> },
          { path: ROUTES.documents, element: <DocumentsPage /> },
          { path: ROUTES.documentsUpload, element: <DocumentUploadPage /> },

          { path: ROUTES.chat, element: <ChatPage /> },
        ],
      },
    ],
  },
  {
    // Back-office — guarded by role. The Agent Portal owns its own route table
    // (features/agent/routes.tsx) and mounts it wholesale under ROUTES.agent.
    element: <ProtectedRoute role="agent" />,
    children: [
      {
        element: <AppShell />,
        children: [{ path: ROUTES.agent, children: agentRoutes }],
      },
    ],
  },
  {
    // Administration — admin only. Completely separate from agent portal.
    path: ROUTES.admin,
    element: <ProtectedRoute role="admin" />,
    children: [
      {
        element: <AdminLayout />,
        children: [
          { index: true, element: <AdminDashboardPage /> },
        ],
      },
    ],
  },
  { path: ROUTES.notFound, element: <NotFoundPage /> },
]);

export function AppRouter() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <RouterProvider router={router} />
    </Suspense>
  );
}
