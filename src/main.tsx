import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Fonts are bundled (not loaded from the web) so the .exe works offline.
// Kreon is Slay the Spire's UI font; Cinzel is for titles.
import '@fontsource/kreon/400.css';
import '@fontsource/kreon/700.css';
import '@fontsource/cinzel/700.css';
import './hud/hud.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
