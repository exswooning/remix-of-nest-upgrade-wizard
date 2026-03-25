import React from 'react';
import { createRoot } from 'react-dom/client';

// Simple test component
const TestApp = () => {
  return (
    <div style={{ padding: '20px', backgroundColor: 'lightblue' }}>
      <h1>TEST APP IS WORKING!</h1>
      <p>If you can see this, React is mounting correctly.</p>
      <p>Current time: {new Date().toLocaleString()}</p>
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<TestApp />);
} else {
  console.error('Root container not found!');
}
