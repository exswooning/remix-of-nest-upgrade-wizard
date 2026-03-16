import React from 'react';
import { AlertTriangle, RefreshCw, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
};

const RESETTABLE_STORAGE_KEYS = [
  'calculator-plan-data',
  'cgap-field-mappings',
  'cgap-addendum-template-id',
  'cgap-contract-counts',
  'cgap-addendum-counts',
  'cgap-contract-logs',
  'cgap-addendum-logs',
];

class AppErrorBoundary extends React.Component<Props, State> {
  state: State = {
    hasError: false,
  };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Application render error:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  handleResetSavedData = () => {
    RESETTABLE_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-xl border bg-card text-card-foreground shadow-sm p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-destructive/10 p-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <h1 className="text-xl font-semibold">Something went wrong</h1>
              <p className="text-sm text-muted-foreground">
                I blocked the blank screen and showed a recovery state instead.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={this.handleRetry} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Try again
            </Button>
            <Button variant="outline" onClick={this.handleResetSavedData} className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Reset saved app data
            </Button>
          </div>
        </div>
      </div>
    );
  }
}

export default AppErrorBoundary;
