import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

export function Drawer({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-brown-900/30 backdrop-blur-[2px]"
        aria-label="Close"
        onClick={onClose}
      />
      <aside
        className="relative flex h-full w-full max-w-md flex-col border-l border-cream-200 bg-cream-50 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
      >
        <header className="flex items-center justify-between border-b border-cream-200 bg-white px-4 py-3">
          <h2 id="drawer-title" className="font-display text-lg font-bold text-brown-900">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-brown-600 hover:bg-cream-100"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </aside>
    </div>
  );
}
