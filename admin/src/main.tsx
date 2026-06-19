import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

// Import Google Fonts (same as customer menu for visual consistency)
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href =
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Nanum+Myeongjo:wght@400;700;800&display=swap';
document.head.appendChild(link);

// Global styles
document.body.style.margin = '0';
document.body.style.padding = '0';
document.body.style.background = '#17130f';
document.body.style.overflow = 'hidden';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
