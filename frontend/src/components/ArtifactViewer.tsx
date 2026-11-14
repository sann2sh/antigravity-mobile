import React, { useState, useEffect } from 'react';
import { FileText, Copy, Check, Download, Sparkles } from 'lucide-react';
import type { Artifact } from '../types';
import { getArtifactContent } from '../api';

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
      <div className="flex flex-col items-center justify-center h-[calc(100dvh-3.5rem-3.5rem)] text-center px-4 bg-[#0d1117] text-gray-400">
        <Sparkles className="w-10 h-10 text-indigo-400/40 mb-2" />
        <h3 className="text-sm font-semibold text-gray-200">No Artifacts in Current Session</h3>
        <p className="text-xs text-gray-500 mt-1 max-w-xs">
          When agents create plans, architecture reports, or files, they will appear here for review.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-3.5rem-3.5rem)] bg-[#0d1117] text-gray-200">
      {/* Horizontal Artifacts Selector */}
      <div className="flex gap-2 p-2.5 overflow-x-auto bg-[#161b22] border-b border-[#30363d] no-scrollbar">
        {artifacts.map((art) => {
          const isSelected = selectedArtifact?.name === art.name;
          return (
            <button
              key={art.name}
              onClick={() => handleSelect(art)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono shrink-0 transition-all border ${
                isSelected
                  ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                  : 'bg-[#0d1117] text-gray-300 border-[#30363d] hover:bg-[#21262d]'
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
          <div className="flex items-center justify-between px-3 py-2 bg-[#1f242c]/60 border-b border-[#30363d] text-xs">
            <span className="font-mono text-gray-400">
              {loading ? 'Loading...' : `${content.split('\n').length} lines`}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 px-2 py-1 rounded bg-[#21262d] text-gray-300 hover:text-white border border-[#30363d]"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button
                onClick={handleDownload}
                className="p-1 rounded bg-[#21262d] text-gray-300 hover:text-white border border-[#30363d]"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-3.5 font-sans text-xs leading-relaxed text-gray-200">
          <div className="bg-[#161b22] p-4 rounded-xl border border-[#30363d] whitespace-pre-wrap font-mono text-[11px] leading-relaxed">
            {content}
          </div>
        </div>
      </div>
    </div>
  );
};
