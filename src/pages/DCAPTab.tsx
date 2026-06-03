/**
 * DCAP — Document Conversion / Adjustment Panel.
 *
 * Two views, switchable from a top button row:
 *
 *   • Inline editor — canvas-overlay PDF text editor. Click any text
 *     on the page to edit it in place; Save stamps the modifications
 *     onto a fresh copy via pdf-lib's mask-and-draw pipeline. See
 *     [src/components/PdfEditorContainer.tsx] for the architecture.
 *
 *   • Tools — the broader PDF toolkit. When `VITE_STIRLING_URL` is set,
 *     embeds Stirling PDF (the open-source self-hosted sejda-style web
 *     UI with merge / split / rotate / OCR / watermark / sign / forms /
 *     redact / convert / compress). Otherwise falls through to the
 *     local pdf-lib `SejdaToolGrid` so the tab still works without the
 *     Docker container.
 *
 * Spin up Stirling:
 *   cd stirling-pdf && docker compose up -d
 * Then set in .env.local:
 *   VITE_STIRLING_URL=http://localhost:8084
 */

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ExternalLink, FilePen, ServerCog, Wrench } from 'lucide-react';
import SejdaToolGrid from '@/components/SejdaToolGrid';
import PdfEditorContainer from '@/components/PdfEditorContainer';
import { cn } from '@/lib/utils';

const STIRLING_URL: string | undefined = import.meta.env.VITE_STIRLING_URL;

type View = 'inline-editor' | 'tools';

interface Props { darkMode?: boolean; }

const DCAPTab: React.FC<Props> = ({ darkMode = false }) => {
  const dm = darkMode;
  const stirlingUrl = STIRLING_URL?.trim();
  const [view, setView] = useState<View>('inline-editor');

  return (
    <div className="space-y-3">
      <div className="glass-card rounded-2xl p-2 flex gap-1.5">
        <Button
          variant={view === 'inline-editor' ? 'default' : 'ghost'}
          size="sm"
          className={cn('gap-1.5', view === 'inline-editor' && 'bg-teal-600 hover:bg-teal-700 text-white')}
          onClick={() => setView('inline-editor')}
        >
          <FilePen className="w-3.5 h-3.5" /> Inline editor
        </Button>
        <Button
          variant={view === 'tools' ? 'default' : 'ghost'}
          size="sm"
          className={cn('gap-1.5', view === 'tools' && 'bg-teal-600 hover:bg-teal-700 text-white')}
          onClick={() => setView('tools')}
        >
          <Wrench className="w-3.5 h-3.5" /> Tools{stirlingUrl ? ' · Stirling' : ''}
        </Button>
        <span className="flex-1" />
        <span className={`text-[10px] self-center pr-2 ${dm ? 'text-gray-500' : 'text-gray-400'}`}>
          {view === 'inline-editor'
            ? 'Click any text on a page to edit it in place'
            : 'Document-wide tools (merge / split / OCR / watermark / …)'}
        </span>
      </div>

      {view === 'inline-editor' ? (
        <PdfEditorContainer darkMode={dm} />
      ) : stirlingUrl ? (
        <>
          <div className="glass-card rounded-2xl px-4 py-2 flex items-center gap-3">
            <ServerCog className={`w-4 h-4 ${dm ? 'text-teal-400' : 'text-teal-600'}`} />
            <div className="flex-1 min-w-0">
              <div className={`text-sm font-medium ${dm ? 'text-gray-100' : 'text-gray-800'}`}>DCAP · Stirling PDF</div>
              <div className={`text-[11px] truncate ${dm ? 'text-gray-500' : 'text-gray-500'}`}>
                Open-source PDF toolkit (Stirling-Tools) — embedded from{' '}
                <code className="font-mono text-[10px]">{stirlingUrl}</code>
              </div>
            </div>
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <a href={stirlingUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="w-3.5 h-3.5" /> Open in new tab
              </a>
            </Button>
          </div>
          <div className="glass-card rounded-2xl overflow-hidden" style={{ height: 'calc(100vh - 280px)', minHeight: 640 }}>
            <iframe
              title="Stirling PDF"
              src={stirlingUrl}
              // Permissive sandbox — Stirling needs file uploads, popups,
              // workers, and same-origin storage. Tighten for production.
              sandbox="allow-same-origin allow-scripts allow-forms allow-downloads allow-popups allow-modals allow-popups-to-escape-sandbox"
              allow="clipboard-read; clipboard-write; fullscreen"
              className="block w-full h-full bg-white"
              style={{ border: 0 }}
            />
          </div>
        </>
      ) : (
        <SejdaToolGrid darkMode={dm} />
      )}
    </div>
  );
};

export default DCAPTab;
