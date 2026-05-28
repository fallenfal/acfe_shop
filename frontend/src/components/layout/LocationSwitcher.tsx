import { ChevronDown, MapPin } from "lucide-react";
import { ALL_LOCATIONS_ID, useLocation } from "../../contexts/LocationContext";
import { useAuth } from "../../contexts/AuthContext";
import { isOrgOwner } from "../../lib/permissions";

export function LocationSwitcher({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth();
  const { locationId, locations, setLocationId } = useLocation();
  const showAll = isOrgOwner(user);

  if (locations.length <= 1 && !showAll) {
    return (
      <div
        className={`flex items-center gap-2 text-brown-700 ${compact ? "text-sm" : ""}`}
      >
        <MapPin className="h-4 w-4 shrink-0 text-amber-brand" aria-hidden />
        <span className={compact ? "font-medium" : "font-display font-bold"}>
          {locations[0]?.name ?? "—"}
        </span>
      </div>
    );
  }

  return (
    <label className={`relative block ${compact ? "" : "px-3"}`}>
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-brown-600">
        Location
      </span>
      <div className="relative flex items-center">
        <MapPin
          className="pointer-events-none absolute left-3 h-4 w-4 text-amber-brand"
          aria-hidden
        />
        <select
          value={locationId ?? ""}
          onChange={(e) => setLocationId(e.target.value)}
          className="w-full appearance-none rounded-lg border border-cream-200 bg-cream-50 py-2 pr-9 pl-9 text-sm font-medium text-brown-900 shadow-sm focus:border-amber-brand focus:outline-none focus:ring-2 focus:ring-amber-brand/25"
        >
          {showAll && (
            <option value={ALL_LOCATIONS_ID}>All Locations</option>
          )}
          {locations.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.name}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-2.5 h-4 w-4 text-brown-600"
          aria-hidden
        />
      </div>
    </label>
  );
}
