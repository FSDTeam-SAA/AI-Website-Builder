"use client";

import { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

/**
 * Markdown renderer for assistant messages.
 *
 * Replies used to render through `<span>{content}</span>`, so any list, bold
 * run or inline code the model produced showed up as literal asterisks and
 * backticks.
 *
 * Raw HTML is deliberately NOT enabled (no `rehype-raw`): the content is model
 * output, and react-markdown escapes HTML by default. Keeping it that way means
 * a prompt-injected `<script>` or `<img onerror>` renders as text.
 */

const components: Components = {
  p: ({ children }) => <p className="mb-2 leading-relaxed last:mb-0">{children}</p>,

  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,

  ul: ({ children }) => (
    <ul className="mb-2 ml-4 list-disc space-y-1 last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2 ml-4 list-decimal space-y-1 last:mb-0">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,

  h1: ({ children }) => <h1 className="mb-2 mt-3 text-base font-semibold first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-2 mt-3 text-sm font-semibold first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-1 mt-2 text-sm font-medium first:mt-0">{children}</h3>,

  code: ({ className, children, ...props }) => {
    // react-markdown gives fenced blocks a `language-*` class; inline code has none.
    const isBlock = /language-/.test(className ?? "");
    if (isBlock) {
      return (
        <code className={cn("font-mono text-xs", className)} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code
        className="rounded border bg-muted px-1 py-0.5 font-mono text-[0.85em]"
        {...props}
      >
        {children}
      </code>
    );
  },

  pre: ({ children }) => (
    <pre className="mb-2 max-w-full overflow-x-auto rounded-md border bg-muted p-3 last:mb-0">
      {children}
    </pre>
  ),

  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="text-primary underline underline-offset-2"
    >
      {children}
    </a>
  ),

  blockquote: ({ children }) => (
    <blockquote className="mb-2 border-l-2 pl-3 italic text-muted-foreground last:mb-0">
      {children}
    </blockquote>
  ),

  hr: () => <hr className="my-3" />,

  table: ({ children }) => (
    <div className="mb-2 overflow-x-auto last:mb-0">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border px-2 py-1 text-left font-medium">{children}</th>
  ),
  td: ({ children }) => <td className="border px-2 py-1">{children}</td>,
};

interface Props {
  children: string;
  className?: string;
}

export const Markdown = memo(function Markdown({ children, className }: Props) {
  return (
    <div className={cn("text-sm break-words", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
});
