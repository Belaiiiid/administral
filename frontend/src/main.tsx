import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { AppProviders } from '@/app/providers/AppProviders';
import { AppRouter } from '@/app/router';

import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Élément racine #root introuvable.');

createRoot(rootElement).render(
  <StrictMode>
    <AppProviders>
      <AppRouter />
    </AppProviders>
  </StrictMode>,
);
