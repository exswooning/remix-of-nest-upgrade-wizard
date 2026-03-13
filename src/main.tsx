import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

console.log('[MAIN] Mounting app...');
try {
  createRoot(document.getElementById("root")!).render(<App />);
  console.log('[MAIN] App mounted successfully');
} catch (e) {
  console.error('[MAIN] Mount error:', e);
}
