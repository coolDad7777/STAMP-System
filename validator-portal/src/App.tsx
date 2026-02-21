import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AppRouter } from './components/AppRouter';
import { AuthProvider } from './stores/AuthStore';
import { ToastProvider } from './components/ui/ToastProvider';
import { ErrorBoundary } from './components/ErrorBoundary';

export function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <div className="min-h-screen bg-gray-50">
              <AppRouter />
            </div>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}