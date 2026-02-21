import React, { Component, ErrorInfo, ReactNode } from 'react';
import { ExclamationTriangleIcon } from '@heroicons/react/outline';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error boundary caught an error:', error, errorInfo);
    this.setState({
      error,
      errorInfo
    });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReport = () => {
    // In a real app, this would send error details to monitoring service
    console.log('Error reported:', this.state.error);
    alert('Error reported to system administrators');
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
          <div className="sm:mx-auto sm:w-full sm:max-w-md">
            <div className="flex justify-center">
              <ExclamationTriangleIcon className="w-16 h-16 text-danger-500" />
            </div>
            <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
              Something went wrong
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              An unexpected error occurred in the STAMP Validator Portal
            </p>
          </div>

          <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
            <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
              <div className="space-y-4">
                <div className="p-4 bg-danger-50 border border-danger-200 rounded-md">
                  <p className="text-sm font-medium text-danger-800">
                    Error Details:
                  </p>
                  <p className="text-sm text-danger-700 mt-1 font-mono">
                    {this.state.error?.message || 'Unknown error'}
                  </p>
                </div>

                <div className="flex space-x-3">
                  <button
                    onClick={this.handleReload}
                    className="btn-primary flex-1"
                  >
                    Reload Page
                  </button>
                  <button
                    onClick={this.handleReport}
                    className="btn-secondary flex-1"
                  >
                    Report Issue
                  </button>
                </div>
              </div>

              <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-md">
                <h4 className="text-sm font-medium text-gray-900 mb-2">
                  What you can do:
                </h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• Try reloading the page</li>
                  <li>• Clear your browser cache</li>
                  <li>• Contact your system administrator</li>
                  <li>• Report this issue for investigation</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Development mode error details */}
          {process.env.NODE_ENV === 'development' && this.state.errorInfo && (
            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-4xl">
              <div className="bg-white shadow sm:rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">
                    Development Error Details
                  </h3>
                  <div className="bg-gray-900 text-gray-100 p-4 rounded-md overflow-auto text-sm font-mono">
                    <pre>{this.state.error?.stack}</pre>
                    <hr className="my-4 border-gray-600" />
                    <pre>{this.state.errorInfo.componentStack}</pre>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}