import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { seedDefaults } from './utils/seedDefaults'

seedDefaults();

createRoot(document.getElementById("root")!).render(<App />);
