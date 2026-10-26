import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { applyCachedTheme } from '@/hooks/useTheme';
import './style.css';

applyCachedTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
