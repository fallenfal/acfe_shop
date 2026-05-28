import { Settings } from "lucide-react";
import { Navigate } from "react-router-dom";
import { useIsCmOrAbove } from "../hooks/usePermission";

export function SettingsPage() {
  const allowed = useIsCmOrAbove();

  if (!allowed) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-xl border border-cream-200 bg-white p-8 shadow-sm">
        <div className="flex items-center gap-3 text-amber-brand">
          <Settings className="h-8 w-8" aria-hidden />
          <h1 className="font-display text-2xl font-bold text-brown-900">
            Settings
          </h1>
        </div>
        <p className="mt-4 text-brown-700">
          Organisation and location settings will be available here — user
          management, menu catalogue, integrations, and notification preferences.
        </p>
        <p className="mt-2 text-sm text-brown-600">This section is coming soon.</p>
      </div>
    </div>
  );
}
