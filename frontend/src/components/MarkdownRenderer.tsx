import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
}

const CodeBlock: React.FC<{ className?: string; children: React.ReactNode }> = ({
  className,
  children,
}) => {
  const [copied, setCopied] = useState(false);
  const codeText = String(children).replace(/\n$/, '');
  const match = /language-(\w+)/.exec(className || '');
  const lang = match ? match[1] : '';

  const handleCopy = () => {
    navigator.clipboard.writeText(codeText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="my-2 rounded-xl overflow-hidden border border-edge bg-sunk">
      <div className="flex items-center justify-between px-3 py-1 bg-surface border-b border-edge text-[10px] text-ink-muted">
        <span className="font-mono">{lang || 'code'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 text-ink-muted hover:text-ink active:scale-95 transition-colors motion-reduce:transition-none"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-ok" />
              <span className="text-ok">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-2.5 overflow-x-auto text-[11px] font-mono text-ink leading-relaxed">
        <code>{codeText}</code>
      </pre>
    </div>
  );
};

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  return (
    <div className="markdown-body text-xs leading-relaxed text-ink break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-sm font-bold text-ink mt-3 mb-1.5 pb-1 border-b border-edge">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-[13px] font-bold text-ink mt-3 mb-1.5">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-xs font-semibold text-accent mt-2.5 mb-1">
              {children}
            </h3>
          ),
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          ul: ({ children }) => (
            <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          strong: ({ children }) => (
            <strong className="font-semibold text-ink">{children}</strong>
          ),
          em: ({ children }) => <em className="italic text-ink-muted">{children}</em>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-accent pl-3 my-2 text-ink-muted italic">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-3 border-edge" />,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline hover:text-accent/80 break-all transition-colors motion-reduce:transition-none"
            >
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto rounded-lg border border-edge">
              <table className="min-w-full text-[11px] border-collapse">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-surface text-ink">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="px-2.5 py-1.5 text-left font-semibold border-b border-edge">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-2.5 py-1.5 border-b border-edge/50 align-top">
              {children}
            </td>
          ),
          code: ({ className, children, ...props }) => {
            const isBlock = Boolean(className) || String(children).includes('\n');
            if (isBlock) {
              return <CodeBlock className={className}>{children}</CodeBlock>;
            }
            return (
              <code
                className="px-1.5 py-0.5 mx-0.5 rounded bg-sunk border border-edge font-mono text-[11px] text-code"
                {...props}
              >
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

