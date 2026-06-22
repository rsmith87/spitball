import type { MouseEvent as ReactMouseEvent } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import type { MessageVerification } from "../../spitball/types";

export function MarkdownMessage({
  content,
  verification,
  onCodeBlockContextMenu,
}: {
  content: string;
  verification?: MessageVerification;
  onCodeBlockContextMenu: (event: ReactMouseEvent<HTMLDivElement>, code: string) => void;
}) {
  function handleContextMenu(event: ReactMouseEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const codeElement = target.closest("pre code");
    if (!codeElement) return;
    onCodeBlockContextMenu(event, codeElement.textContent || "");
  }

  return (
    <div className="message-markdown" onContextMenu={handleContextMenu}>
      <ReactMarkdown
        components={{
          code({ children, className, ...props }) {
            const text = String(children).replace(/\n$/, "");
            const issue = verification?.issues.find((item) => item.value === text || item.excerpt.includes(text));
            return (
              <code {...props} className={`${className || ""}${issue ? " verification-inline-issue" : ""}`.trim()}>
                {children}
              </code>
            );
          },
        }}
        rehypePlugins={[rehypeHighlight]}
        remarkPlugins={[remarkGfm]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
