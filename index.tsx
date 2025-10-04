import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { LocationProvider } from './context/StudioContext';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <AuthProvider>
      <LocationProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </LocationProvider>
    </AuthProvider>
  </React.StrictMode>
);