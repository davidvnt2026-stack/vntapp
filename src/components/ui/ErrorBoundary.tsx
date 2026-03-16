import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useAuth } from "../../contexts/AuthContext";

interface InnerProps {
  children?: ReactNode;
  fallback?: ReactNode;
  logError: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundaryInner extends Component<InnerProps, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    this.props.logError(error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex h-screen w-full flex-col items-center justify-center bg-gray-50 p-4">
          <div className="mx-auto max-w-md rounded-xl bg-white p-8 text-center shadow-lg">
            <div className="mb-4 flex justify-center">
              <div className="rounded-full bg-red-100 p-3">
                <AlertCircle className="h-10 w-10 text-red-600" />
              </div>
            </div>
            <h1 className="mb-2 text-2xl font-bold text-gray-900">Oops! Something went wrong.</h1>
            <p className="mb-6 text-gray-600">
              An unexpected error occurred in the application.
            </p>
            <div className="mb-6 rounded-md bg-gray-100 p-4 text-left">
              <p className="text-sm font-mono text-red-800 break-all overflow-hidden">
                {this.state.error?.message || "Unknown error"}
              </p>
            </div>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: undefined });
                window.location.reload();
              }}
              className="rounded-lg bg-blue-600 px-6 py-2 font-medium text-white transition-colors hover:bg-blue-700"
            >
              Reload application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export function ErrorBoundary({ children, fallback }: { children?: ReactNode; fallback?: ReactNode }) {
  const apiAny = api as any;
  const logFrontendError = useMutation(apiAny.errors.logFrontendError);
  const { token } = useAuth();

  const handleLogError = (error: Error, errorInfo: ErrorInfo) => {
    logFrontendError({
      token: token || undefined,
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack ?? undefined,
      url: window.location.href,
    }).catch(console.error); // Catch potential errors during logging
  };

  return <ErrorBoundaryInner fallback={fallback} logError={handleLogError}>{children}</ErrorBoundaryInner>;
}

