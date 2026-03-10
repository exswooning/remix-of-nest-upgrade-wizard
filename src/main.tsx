import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

console.log('[main.tsx] Mounting app...');
createRoot(document.getElementById("root")!).render(<App />);
console.log('[main.tsx] App mounted.');
