import { Navigate } from 'react-router-dom';

import { ROUTES } from '@/app/router/paths';

/**
 * Legacy upload surface — now a redirect.
 *
 * The document dépôt used to live here against a fixed demo dossier
 * (`TEST-DOSSIER-0001`), disconnected from the citizen's profile. The whole
 * flow — checklist personnalisée, dépôt, complétude, transmission — is now
 * unified on "Mon dossier personnalisé", keyed on the citizen's own
 * profile-driven application. This route just forwards there so existing links
 * and bookmarks keep working.
 */
export default function DocumentUploadPage() {
  return <Navigate to={ROUTES.dossier} replace />;
}
