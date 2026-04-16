import { StrictMode, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { registerSW } from './sw';
import { UpdateToast } from './components/UpdateToast';

function Root() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    const handler = () => setUpdateAvailable(true);
    window.addEventListener('sw-update-available', handler);
    return () => window.removeEventListener('sw-update-available', handler);
  }, []);

  return (
    <>
      <UpdateToast
        visible={updateAvailable}
        onDismiss={() => setUpdateAvailable(false)}
      />
      <App />
    </>
  );
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found — check index.html');
}

createRoot(rootElement).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);

registerSW(() => {
  window.dispatchEvent(new CustomEvent('sw-update-available'));
});
