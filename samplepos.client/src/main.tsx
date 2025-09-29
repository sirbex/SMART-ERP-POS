import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// Pure Shadcn-only architecture - removed emergency.css
import App from './App.tsx'

// Simple error handling
const rootElement = document.getElementById('root');

if (!rootElement) {
  console.error('Root element not found!');
  throw new Error('Root element not found!');
}

try {
  const root = createRoot(rootElement);
  console.log('Rendering app...');
  
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  );
} catch (error) {
  console.error('Error rendering React app:', error);
  rootElement.innerHTML = `
    <div style="padding: 20px; font-family: sans-serif;">
      <h2>React Rendering Error</h2>
      <p>There was an error rendering the application. Please check the console for details.</p>
      <pre style="background: #f1f1f1; padding: 10px; border-radius: 5px;">${error instanceof Error ? error.message : String(error)}</pre>
    </div>
  `;
}
