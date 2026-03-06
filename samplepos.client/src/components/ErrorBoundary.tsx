import React from 'react';

/**
 * Props for ErrorBoundary
 */
interface ErrorBoundaryProps {
  /** Child components to protect */
  children: React.ReactNode;
  /** Optional custom fallback UI */
  fallback?: React.ReactNode;
  /** Optional error handler callback */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  /** Optional label for which section is protected (for logging) */
  section?: string;
}

/**
 * ErrorBoundary state
 */
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

/**
 * ErrorBoundary — catches render errors in child components.
 *
 * Wrap page-level or feature-level subtrees to prevent a single
 * component crash from taking down the entire application.
 *
 * Usage:
 *   <ErrorBoundary section="POS">
 *     <POSPage />
 *   </ErrorBoundary>
 *
 *   <ErrorBoundary fallback={<div>Custom Error UI</div>}>
 *     <SomeComponent />
 *   </ErrorBoundary>
 */
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.setState({ errorInfo });

    // Log to console with section context
    const section = this.props.section ?? 'Unknown';
    console.error(`[ErrorBoundary:${section}] Caught render error:`, error, errorInfo);

    // Invoke optional callback
    this.props.onError?.(error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      // Custom fallback
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      const isDev = import.meta.env.DEV;

      return (
        <div
          role="alert"
          className="flex flex-col items-center justify-center min-h-[300px] p-8 bg-red-50 border border-red-200 rounded-lg m-4"
        >
          <svg
            className="w-12 h-12 text-red-500 mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
          <h2 className="text-lg font-semibold text-red-800 mb-2">Something went wrong</h2>
          <p className="text-sm text-red-600 mb-4 text-center max-w-md">
            {this.props.section
              ? `An error occurred in the ${this.props.section} section.`
              : 'An unexpected error occurred.'}
            {' '}Please try again or contact support if the problem persists.
          </p>
          <button
            onClick={this.handleReset}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
          >
            Try Again
          </button>
          {isDev && this.state.error && (
            <details className="mt-4 w-full max-w-2xl">
              <summary className="cursor-pointer text-sm text-red-500 hover:text-red-700">
                Error Details (Dev Only)
              </summary>
              <pre className="mt-2 p-3 bg-red-100 rounded text-xs text-red-800 overflow-auto max-h-64">
                {this.state.error.toString()}
                {this.state.errorInfo?.componentStack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
