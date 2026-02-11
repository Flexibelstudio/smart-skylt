import React, { ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  // Explicit props and constructor to ensure type safety if inference fails
  public props: ErrorBoundaryProps;
  public state: ErrorBoundaryState;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.props = props;
    this.state = {
        hasError: false,
        error: undefined,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    if ((window as any).DEBUG_MODE) {
        console.error("ErrorBoundary caught an error", error, errorInfo);
    }

    // AUTO-FIX: Detect ChunkLoadError (happens after new deploy)
    // If the app fails to load a file because it changed on server, wipe and reload.
    const errorMessage = error?.message || '';
    if (
      errorMessage.includes('Failed to fetch dynamically imported module') ||
      errorMessage.includes('Importing a module script failed') ||
      errorMessage.includes('missing')
    ) {
      console.log('Chunk load error detected. Clearing cache and reloading...');
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch (e) {
        console.error("Failed to clear storage during auto-recovery", e);
      }
      // Force reload from server (ignore cache)
      window.location.reload();
    }
  }

  handleHardReset = () => {
    if (window.confirm("Detta kommer att rensa all lokal data och logga ut enheten. Är du säker?")) {
        try {
            localStorage.clear();
            sessionStorage.clear();
            // Clear cookies if any (simplified)
            document.cookie.split(";").forEach((c) => {
                document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
            });
        } catch (e) {
            console.error("Manual reset failed", e);
        }
        window.location.replace('/');
    }
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white p-4 text-center">
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 max-w-lg shadow-2xl">
                <h1 className="text-3xl font-bold text-red-400 mb-4">Ett oväntat fel inträffade</h1>
                <p className="text-slate-300 mb-6">
                    Något gick fel under körningen. Om detta sker efter en uppdatering kan en återställning behövas.
                </p>
                
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    <button
                        onClick={() => window.location.reload()}
                        className="bg-primary hover:brightness-110 text-white font-bold py-3 px-6 rounded-lg transition-colors"
                    >
                        Försök ladda om
                    </button>
                    
                    <button
                        onClick={this.handleHardReset}
                        className="bg-slate-700 hover:bg-slate-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors border border-slate-600"
                    >
                        Fabriksåterställ appen
                    </button>
                </div>

                 {(window as any).DEBUG_MODE && this.state.error && (
                    <pre className="mt-6 p-4 bg-slate-900 rounded-md text-left text-xs text-red-300 overflow-auto max-h-60 w-full">
                        <code>
                            {this.state.error?.message}
                            {'\n'}
                            {this.state.error?.stack}
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