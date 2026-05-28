import { AlertTriangle, CheckCircle2 } from "lucide-react";

export function StockStatusIndicator({ belowPar }: { belowPar: boolean }) {
  if (belowPar) {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs font-medium text-red-700"
        title="Below par level"
      >
        <AlertTriangle className="h-4 w-4" aria-hidden />
        Low
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-medium text-green-700"
      title="Stock level OK"
    >
      <CheckCircle2 className="h-4 w-4" aria-hidden />
      OK
    </span>
  );
}
