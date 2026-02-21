import React, { useState } from 'react';
import { useAuth } from '../stores/AuthStore';
import { ShieldCheckIcon, EyeIcon, EyeOffIcon } from '@heroicons/react/outline';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const { login, isLoading, error } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await login(email, password, rememberMe);
  };

  // Demo credentials for development
  const demoCredentials = [
    { email: 'officer@demo.gov', password: 'demo123', role: 'Probation Officer' },
    { email: 'admin@demo.gov', password: 'demo123', role: 'Court Administrator' },
    { email: 'auditor@demo.gov', password: 'demo123', role: 'System Auditor' },
  ];

  const fillDemoCredentials = (demo: { email: string; password: string }) => {
    setEmail(demo.email);
    setPassword(demo.password);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* Logo and title */}
        <div className="flex justify-center">
          <ShieldCheckIcon className="w-16 h-16 text-brand-600" />
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          STAMP Validator Portal
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Secure attendance verification system
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          {/* Demo notice */}
          <div className="mb-6 p-4 bg-brand-50 border border-brand-200 rounded-lg">
            <h3 className="text-sm font-medium text-brand-800 mb-2">
              🚀 Demo Environment
            </h3>
            <p className="text-sm text-brand-700 mb-3">
              Try the system with these demo accounts:
            </p>
            <div className="space-y-2">
              {demoCredentials.map((demo, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => fillDemoCredentials(demo)}
                  className="block w-full text-left p-2 text-xs bg-white rounded border hover:bg-gray-50 transition-colors"
                >
                  <div className="font-medium text-gray-900">{demo.role}</div>
                  <div className="text-gray-600">{demo.email}</div>
                </button>
              ))}
            </div>
          </div>

          <form className="space-y-6" onSubmit={handleSubmit}>
            {/* Email field */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email address
              </label>
              <div className="mt-1">
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field"
                  placeholder="Enter your email"
                />
              </div>
            </div>

            {/* Password field */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <div className="mt-1 relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field pr-10"
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOffIcon className="h-5 w-5 text-gray-400" />
                  ) : (
                    <EyeIcon className="h-5 w-5 text-gray-400" />
                  )}
                </button>
              </div>
            </div>

            {/* Remember me */}
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 text-brand-600 focus:ring-brand-500 border-gray-300 rounded"
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-900">
                  Remember me
                </label>
              </div>

              <div className="text-sm">
                <a href="#" className="font-medium text-brand-600 hover:text-brand-500">
                  Forgot your password?
                </a>
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div className="p-3 bg-danger-50 border border-danger-200 rounded-md">
                <p className="text-sm text-danger-600">{error}</p>
              </div>
            )}

            {/* Submit button */}
            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="btn-primary w-full justify-center"
              >
                {isLoading ? (
                  <>
                    <LoadingSpinner size="sm" className="mr-2" />
                    Signing in...
                  </>
                ) : (
                  'Sign in'
                )}
              </button>
            </div>
          </form>

          {/* Security notice */}
          <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <div className="flex items-start">
              <ShieldCheckIcon className="w-5 h-5 text-gray-400 mt-0.5" />
              <div className="ml-3">
                <h4 className="text-sm font-medium text-gray-900">
                  Security Notice
                </h4>
                <p className="text-sm text-gray-600 mt-1">
                  This system uses multi-factor authentication and maintains audit logs 
                  of all access attempts. Unauthorized access is prohibited and monitored.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 text-center">
        <p className="text-sm text-gray-500">
          STAMP System v1.0.0 | 
          <a href="#" className="ml-1 text-brand-600 hover:text-brand-500">
            Privacy Policy
          </a> | 
          <a href="#" className="ml-1 text-brand-600 hover:text-brand-500">
            Support
          </a>
        </p>
      </div>
    </div>
  );
}