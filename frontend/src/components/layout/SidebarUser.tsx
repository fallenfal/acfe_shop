import { LogOut } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useLocation } from "../../contexts/LocationContext";
import { Avatar } from "../ui/Avatar";

export function SidebarUser({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  const { currentRole, locationName, isAllLocations } = useLocation();

  if (!user) return null;

  const roleLabel = isAllLocations
    ? "Owner (all locations)"
    : (currentRole?.name ?? "—");

  return (
    <div className="mt-auto border-t border-cream-200 p-3">
      <div className="flex items-center gap-3 rounded-lg bg-cream-50 p-3">
        <Avatar name={user.name} src={user.avatar_url} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-brown-900">
            {user.name}
          </p>
          <p className="truncate text-xs text-brown-600">{roleLabel}</p>
          {!isAllLocations && locationName && (
            <p className="truncate text-[10px] text-brown-500">{locationName}</p>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          onNavigate?.();
          logout();
        }}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-cream-200 px-3 py-2 text-sm font-medium text-brown-700 transition-colors hover:bg-cream-100 hover:text-brown-900"
      >
        <LogOut className="h-4 w-4" aria-hidden />
        Sign out
      </button>
    </div>
  );
}
