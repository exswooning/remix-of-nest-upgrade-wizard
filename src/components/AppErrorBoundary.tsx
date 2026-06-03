import React from 'react';
import { AlertTriangle, RefreshCw, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
  errorMessage?: string;
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

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error?.message };
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
            <div className="space-y-1 flex-1 min-w-0">
              <h1 className="text-xl font-semibold">Something went wrong</h1>
              <p className="text-sm text-muted-foreground">
                I blocked the blank screen and showed a recovery state instead.
              </p>
              {this.state.errorMessage && (
                <pre className="text-[11px] font-mono mt-2 p-2 rounded bg-muted/40 border whitespace-pre-wrap break-words max-h-40 overflow-auto">
                  {this.state.errorMessage}
                </pre>
              )}
              {this.state.errorMessage?.includes('Missing Supabase env vars') && (
                <p className="text-xs text-muted-foreground mt-2">
                  On Vercel: Project Settings → Environment Variables → add{' '}
                  <code className="font-mono">VITE_SUPABASE_URL</code> and{' '}
                  <code className="font-mono">VITE_SUPABASE_PUBLISHABLE_KEY</code>{' '}
                  (apply to Production + Preview + Development), then redeploy.
                </p>
              )}
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
