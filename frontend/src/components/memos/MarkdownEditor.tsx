import { useState } from "react";
import ReactMarkdown from "react-markdown";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function MarkdownEditor({ value, onChange, placeholder }: Props) {
  const [tab, setTab] = useState<"write" | "preview">("write");

  return (
    <div className="overflow-hidden rounded-xl border border-cream-200 bg-white shadow-sm">
      <div className="flex border-b border-cream-200 bg-cream-50">
        <button
          type="button"
          onClick={() => setTab("write")}
          className={`px-4 py-2 text-sm font-medium ${
            tab === "write"
              ? "border-b-2 border-amber-brand text-brown-900"
              : "text-brown-600 hover:text-brown-800"
          }`}
        >
          Write
        </button>
        <button
          type="button"
          onClick={() => setTab("preview")}
          className={`px-4 py-2 text-sm font-medium ${
            tab === "preview"
              ? "border-b-2 border-amber-brand text-brown-900"
              : "text-brown-600 hover:text-brown-800"
          }`}
        >
          Preview
        </button>
      </div>
      {tab === "write" ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={12}
          className="w-full resize-y border-0 bg-white px-4 py-3 text-sm text-brown-900 placeholder:text-stone-400 focus:outline-none focus:ring-0"
        />
      ) : (
        <div className="prose prose-stone max-w-none px-4 py-3 text-sm">
          {value ? (
            <ReactMarkdown>{value}</ReactMarkdown>
          ) : (
            <p className="text-stone-400">Nothing to preview yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
