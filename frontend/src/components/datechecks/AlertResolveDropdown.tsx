import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "../ui/Button";
import type { AlertResolution } from "../../types/datechecks";

const RESOLVE_OPTIONS: { value: AlertResolution; label: string }[] = [
  { value: "used", label: "Used" },
  { value: "disposed", label: "Disposed" },
  { value: "wasted", label: "Log as waste" },
  { value: "dismissed", label: "Dismiss" },
];

export function AlertResolveDropdown({
  onResolve,
  disabled,
  label = "Resolved",
}: {
  onResolve: (resolution: AlertResolution) => void;
  disabled?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <Button
        type="button"
        variant="secondary"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="min-h-[44px] gap-1 px-3"
      >
        {label}
        <ChevronDown className="h-4 w-4" aria-hidden />
      </Button>
      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-10"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
          <ul className="absolute right-0 z-20 mt-1 min-w-[10rem] rounded-lg border border-cream-200 bg-white py-1 shadow-lg">
            {RESOLVE_OPTIONS.map((opt) => (
              <li key={opt.value}>
                <button
                  type="button"
                  className="w-full px-4 py-3 text-left text-sm text-brown-800 hover:bg-cream-50"
                  onClick={() => {
                    setOpen(false);
                    onResolve(opt.value);
                  }}
                >
                  {opt.label}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
