import ReactMarkdown from "react-markdown";

export function MarkdownBody({ content }: { content: string }) {
  return (
    <div className="prose prose-stone max-w-none prose-headings:font-display prose-headings:text-brown-900 prose-a:text-amber-brand-dark">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}
