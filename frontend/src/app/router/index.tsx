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

const LoginPage = lazy(() => import('@/features/auth/pages/LoginPage'));
const RegisterPage = lazy(() => import('@/features/auth/pages/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('@/features/auth/pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('@/features/auth/pages/ResetPasswordPage'));
const VerifyEmailPage = lazy(() => import('@/features/auth/pages/VerifyEmailPage'));

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

const ChatPage = lazy(() => import('@/features/chatbot/pages/ChatPage'));
const VoiceOnboardingPage = lazy(() => import('@/features/voice/pages/VoiceOnboardingPage').then(m => ({ default: m.VoiceOnboardingPage })));
const PublicLandingPage = lazy(() => import('@/features/chatbot/pages/PublicLandingPage'));
const NotFoundPage = lazy(() => import('@/features/portal/pages/NotFoundPage'));

const AdminDashboardPage = lazy(
  () => import('@/features/agent/admin/pages/AdminDashboardPage'),
);

/**
 * `/` — public by default. A signed-in visitor is sent straight to their
 * portal (there is nothing for them at a marketing/assistant landing they
 * have already moved past); everyone else meets the assistant first and
 * "Se connecter" second, never the other way around.
 */
function HomeRoute() {
  const isAuthenticated = useSessionStore((state) => state.isAuthenticated);
  return isAuthenticated ? <Navigate to={ROUTES.portal} replace /> : <PublicLandingPage />;
}

const router = createBrowserRouter([
  { path: ROUTES.home, element: <HomeRoute /> },
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
    // Authenticated citizen area.
    element: <ProtectedRoute />,
    children: [
      {
        // Services hub — reached before a service is picked, so no sidebar:
        // there is nothing yet for one to navigate (see `AppShell`).
        element: <AppShell hideSidebar />,
        children: [{ path: ROUTES.portal, element: <CitizenDashboardPage /> }],
      },
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
            // just these two routes, not the whole citizen area.
            element: <RequireApplProfile />,
            children: [
              { path: ROUTES.dossier, element: <PersonalizedDossierPage /> },
              { path: ROUTES.suivi, element: <SuiviDossierPage /> },
            ],
          },
          { path: ROUTES.documents, element: <DocumentsPage /> },
          { path: ROUTES.documentsUpload, element: <DocumentUploadPage /> },

          { path: ROUTES.voiceOnboarding, element: <VoiceOnboardingPage /> },

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
