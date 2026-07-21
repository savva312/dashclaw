import { Component, type ErrorInfo, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

interface BoundaryProps {
  children: ReactNode;
}

interface BoundaryState {
  failed: boolean;
}

class RouteRenderBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error("Route rendering failed", error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.failed) {
      return (
        <main className="route-error-page">
          <div className="card route-error-card" role="alert">
            <h1 className="page-title">This page could not be displayed</h1>
            <p>The route contains invalid or unavailable runtime data.</p>
            <a className="btn" href="/">Return to Command Center</a>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}

export function RouteErrorBoundary({ children }: BoundaryProps) {
  const location = useLocation();
  return <RouteRenderBoundary key={`${location.pathname}${location.search}`}>{children}</RouteRenderBoundary>;
}
