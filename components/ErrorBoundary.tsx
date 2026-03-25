'use client'

import * as React from 'react'
import { Component, ErrorInfo } from 'react'
import { logger } from '@/lib/logger'

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
  errorInfo?: React.ErrorInfo
}

interface ErrorBoundaryProps {
  children: React.ReactNode
  fallback?: React.ComponentType<{ error: Error; resetError: () => void }>
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo })

    // Log error to monitoring service
    logger.error('React Error Boundary', error, {
      componentStack: errorInfo.componentStack,
      errorBoundary: true
    })

    // In production, you might want to send this to Sentry, LogRocket, etc.
    if (process.env.NODE_ENV === 'production') {
      // Example: Sentry.captureException(error, { contexts: { react: errorInfo } })
    }
  }

  resetError = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined })
  }

  render(): React.ReactNode {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        const FallbackComponent = this.props.fallback
        return <FallbackComponent error={this.state.error} resetError={this.resetError} />
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="max-w-md w-full space-y-4 p-6">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-destructive mb-2">
                Something went wrong
              </h1>
              <p className="text-muted-foreground mb-4">
                We encountered an unexpected error. Please try refreshing the page.
              </p>
              {process.env.NODE_ENV === 'development' && (
                <details className="text-left bg-muted p-4 rounded-lg mb-4">
                  <summary className="cursor-pointer font-medium mb-2">
                    Error Details (Development Only)
                  </summary>
                  <pre className="text-sm whitespace-pre-wrap break-all">
                    {this.state.error.message}
                    {this.state.errorInfo?.componentStack}
                  </pre>
                </details>
              )}
              <button
                onClick={this.resetError}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

// Default error fallback component
export const DefaultErrorFallback: React.FC<{ error: Error; resetError: () => void }> = ({
  error,
  resetError
}): React.ReactElement => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="max-w-md w-full space-y-4 p-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-destructive mb-2">
          Oops! Something broke
        </h1>
        <p className="text-muted-foreground mb-4">
          Don't worry, our team has been notified. Please try again.
        </p>
        <button
          onClick={resetError}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          Reload Page
        </button>
      </div>
    </div>
  </div>
)

export default ErrorBoundary