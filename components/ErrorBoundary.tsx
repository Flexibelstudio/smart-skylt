import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  // FIX: Initialized state as a class property to resolve component state and props errors.
  public state: State = {
    hasError: false,
    error: undefined,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    if ((window as any).DEBUG_MODE) {
        console.error("ErrorBoundary caught an error", error, errorInfo);
    }
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white p-4 text-center">
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 max-w-lg">
                <h1 className="text-3xl font-bold text-red-400 mb-4">Ett oväntat fel inträffade</h1>
                <p className="text-slate-300 mb-6">
                    Något gick fel under renderingen av applikationen. Detta har loggats automatiskt.
                    Försök att ladda om sidan.
                </p>
                <button
                    onClick={() => window.location.reload()}
                    className="bg-primary hover:brightness-110 text-white font-bold py-3 px-6 rounded-lg transition-colors"
                >
                    Ladda om sidan
                </button>
                 {(window as any).DEBUG_MODE && this.state.error && (
                    <pre className="mt-6 p-4 bg-slate-900 rounded-md text-left text-xs text-red-300 overflow-auto max-h-60">
                        <code>
                            {this.state.error.stack}
                        </code>
                    </pre>
                )}
            </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;