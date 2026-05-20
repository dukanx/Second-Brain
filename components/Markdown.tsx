"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Themed markdown renderer for capture bodies.
 * Renders bold/lists/links/headings/code in the app's terminal aesthetic,
 * so pasted markdown shows formatted instead of raw asterisks/dashes.
 */
export default function Markdown({
  children,
  className = "",
  size = "sm",
}: {
  children: string;
  className?: string;
  size?: "xs" | "sm";
}) {
  const base = size === "xs" ? "text-xs leading-relaxed" : "text-sm leading-7";
  return (
    <div className={`${base} text-text break-words ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0 whitespace-pre-wrap">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-5 mb-2 last:mb-0 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 last:mb-0 space-y-1">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed marker:text-muted">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
          em: ({ children }) => <em className="italic text-text">{children}</em>,
          del: ({ children }) => <del className="text-muted">{children}</del>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue hover:underline break-all">
              {children}
            </a>
          ),
          h1: ({ children }) => <h1 className="text-base font-bold text-white mt-3 mb-1.5 first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="text-sm font-bold text-white mt-3 mb-1.5 first:mt-0">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-semibold text-text mt-2 mb-1 first:mt-0">{children}</h3>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-purple/40 pl-3 text-muted italic my-2">{children}</blockquote>
          ),
          code: ({ children }) => (
            <code className="bg-bg border border-border rounded px-1 py-0.5 text-[0.85em] text-amber font-mono">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="bg-bg border border-border rounded p-3 my-2 overflow-x-auto text-xs font-mono no-scrollbar">
              {children}
            </pre>
          ),
          hr: () => <hr className="border-border my-3" />,
          table: ({ children }) => (
            <div className="overflow-x-auto my-2 no-scrollbar">
              <table className="text-xs border-collapse">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border border-border px-2 py-1 text-left font-semibold text-text">{children}</th>,
          td: ({ children }) => <td className="border border-border px-2 py-1 text-muted">{children}</td>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
