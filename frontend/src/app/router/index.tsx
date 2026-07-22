import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';

import { ProtectedRoute } from '@/app/router/ProtectedRoute';
import { ROUTES } from '@/app/router/paths';
import { AppShell } from '@/components/layout/AppShell';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { FocusLayout } from '@/components/layout/FocusLayout';
import { RouteFallback } from '@/app/router/RouteFallback';
import { agentRoutes } from '@/features/agent';

/*
 * Each feature module is code-split at the route boundary, so a new
 * administration module never inflates the initial bundle.
 */
const LoginPage = lazy(() => import('@/features/auth/pages/LoginPage'));
const RegisterPage = lazy(() => import('@/features/auth/pages/RegisterPage'));

const ServiceSelectionPage = lazy(() => import('@/features/portal/pages/ServiceSelectionPage'));
const AccessibilityOnboardingPage = lazy(
  () => import('@/features/portal/pages/AccessibilityOnboardingPage'),
);
const CitizenDashboardPage = lazy(() => import('@/features/portal/pages/CitizenDashboardPage'));
const NotificationsPage = lazy(() => import('@/features/portal/pages/NotificationsPage'));

const AplHomePage = lazy(() => import('@/features/apl/pages/AplHomePage'));
const AplSimulatorPage = lazy(() => import('@/features/apl/pages/AplSimulatorPage'));
const AplApplicationFormPage = lazy(() => import('@/features/apl/pages/AplApplicationFormPage'));
const AplApplicationDetailPage = lazy(
  () => import('@/features/apl/pages/AplApplicationDetailPage'),
);

const ProfilePage = lazy(() => import('@/features/profile/pages/ProfilePage'));
const AccessibilityPreferencesPage = lazy(
  () => import('@/features/profile/pages/AccessibilityPreferencesPage'),
);

const DocumentsPage = lazy(() => import('@/features/documents/pages/DocumentsPage'));
const DocumentUploadPage = lazy(() => import('@/features/documents/pages/DocumentUploadPage'));

const ChatPage = lazy(() => import('@/features/chatbot/pages/ChatPage'));
const NotFoundPage = lazy(() => import('@/features/portal/pages/NotFoundPage'));

const router = createBrowserRouter([
  {
    // Entry journey — no application chrome.
    element: <AuthLayout />,
    children: [
      { path: ROUTES.login, element: <LoginPage /> },
      { path: ROUTES.register, element: <RegisterPage /> },
    ],
  },
  {
    // Onboarding — centred, distraction-free.
    element: <FocusLayout />,
    children: [
      { path: ROUTES.onboardingServices, element: <ServiceSelectionPage /> },
      { path: ROUTES.onboardingAccessibility, element: <AccessibilityOnboardingPage /> },
    ],
  },
  {
    // Authenticated citizen area.
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: ROUTES.home, element: <Navigate to={ROUTES.portal} replace /> },

          { path: ROUTES.portal, element: <CitizenDashboardPage /> },
          { path: ROUTES.portalServices, element: <ServiceSelectionPage /> },
          { path: ROUTES.portalNotifications, element: <NotificationsPage /> },

          { path: ROUTES.apl, element: <AplHomePage /> },
          { path: ROUTES.aplSimulator, element: <AplSimulatorPage /> },
          { path: ROUTES.aplApplication, element: <AplApplicationFormPage /> },
          { path: ROUTES.aplApplicationDetail(), element: <AplApplicationDetailPage /> },

          { path: ROUTES.profile, element: <ProfilePage /> },
          { path: ROUTES.profileAccessibility, element: <AccessibilityPreferencesPage /> },

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
  { path: ROUTES.notFound, element: <NotFoundPage /> },
]);

export function AppRouter() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <RouterProvider router={router} />
    </Suspense>
  );
}
