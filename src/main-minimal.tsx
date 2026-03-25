import React from 'react';
import { createRoot } from 'react-dom/client';

// Minimal app to test step by step
const MinimalApp = () => {
  console.log('MinimalApp rendering...');
  
  return (
    <div style={{ padding: '20px', backgroundColor: 'lightgreen' }}>
      <h1>MINIMAL APP</h1>
      <p>Testing basic components...</p>
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  console.log('Root container found, mounting React...');
  const root = createRoot(container);
  root.render(<MinimalApp />);
} else {
  console.error('Root container not found!');
}
