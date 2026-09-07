import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App';
import { APP_CONFIG } from './config';
import { applyTheme, useSettings } from './store/settings';
import './index.css';

// Apply the persisted theme before the first paint to avoid a light-mode flash.
applyTheme(useSettings.getState().theme);

document.title = `${APP_CONFIG.name} — ${APP_CONFIG.tagline}`;

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root was not found in index.html');
}

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
