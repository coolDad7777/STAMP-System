import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../stores/AuthStore';
import { Layout } from './Layout';
import { LoginPage } from '../pages/LoginPage';
import { DashboardPage } from '../pages/DashboardPage';
import { VerificationPage } from '../pages/VerificationPage';
import { CompliancePage } from '../pages/CompliancePage';
import { AuditPage } from '../pages/AuditPage';
import { SettingsPage } from '../pages/SettingsPage';
import { LoadingSpinner } from './ui/LoadingSpinner';

export function AppRouter() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/verification" element={<VerificationPage />} />
        <Route path="/compliance" element={<CompliancePage />} />
        <Route path="/audit" element={<AuditPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/login" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Layout>
  );
}