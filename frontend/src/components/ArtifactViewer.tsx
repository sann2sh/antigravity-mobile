import React, { useState, useEffect } from 'react';
import { FileText, Copy, Check, Download } from 'lucide-react';
import type { Artifact } from '../types';
import { getArtifactContent } from '../api';
import { MarkdownRenderer } from './MarkdownRenderer';

interface ArtifactViewerProps {
  artifacts: Artifact[];
  conversationId: string | null;
}

export const ArtifactViewer: React.FC<ArtifactViewerProps> = ({ artifacts, conversationId }) => {
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (artifacts.length > 0 && !selectedArtifact) {
      handleSelect(artifacts[0]);
    }
  }, [artifacts]);

  const handleSelect = async (art: Artifact) => {
    if (!conversationId) return;
    setSelectedArtifact(art);
    setLoading(true);
    try {
      const data = await getArtifactContent(conversationId, art.name);
      setContent(data);
    } catch (err: any) {
      setContent(`Failed to load artifact: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!selectedArtifact) return;
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = selectedArtifact.name;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (artifacts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100dvh-3.5rem-3.5rem)] text-center px-4 bg-canvas text-ink-muted">
        <h3 className="text-sm font-semibold text-ink">No Artifacts in Current Session</h3>
        <p className="text-xs text-ink-subtle mt-1 max-w-xs">
          When agents create plans, architecture reports, or files, they will appear here for review.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-3.5rem-3.5rem)] bg-canvas text-ink">
      {/* Horizontal Artifacts Selector */}
      <div className="flex gap-2 p-2.5 overflow-x-auto bg-surface border-b border-edge no-scrollbar">
        {artifacts.map((art) => {
          const isSelected = selectedArtifact?.name === art.name;
          return (
            <button
              key={art.name}
              onClick={() => handleSelect(art)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono shrink-0 transition-colors motion-reduce:transition-none border ${
                isSelected
                  ? 'bg-accent text-sunk border-accent'
                  : 'bg-sunk text-ink-muted border-edge hover:bg-surface-hover hover:text-ink'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{art.name}</span>
            </button>
          );
        })}
      </div>

      {/* Artifact Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedArtifact && (
          <div className="flex items-center justify-between px-3 py-2 bg-surface/60 border-b border-edge text-xs">
            <span className="font-mono text-ink-muted">
              {loading ? 'Loading...' : `${content.split('\n').length} lines`}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 px-2 py-1 rounded bg-surface-hover text-ink-muted hover:text-ink border border-edge transition-colors motion-reduce:transition-none"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-ok" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button
                onClick={handleDownload}
                className="p-1 rounded bg-surface-hover text-ink-muted hover:text-ink border border-edge transition-colors motion-reduce:transition-none"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-3.5 font-sans text-xs leading-relaxed text-ink">
          <div className="bg-surface p-4 rounded-xl border border-edge">
            {selectedArtifact?.name.endsWith('.md') ? (
              <MarkdownRenderer content={content} />
            ) : (
              <div className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed">
                {content}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
