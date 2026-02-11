import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { LocationProvider } from './context/StudioContext';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import ErrorBoundary from './components/ErrorBoundary';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <LocationProvider>
          <ToastProvider>
            <ErrorBoundary>
              <App />
            </ErrorBoundary>
          </ToastProvider>
        </LocationProvider>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>
);