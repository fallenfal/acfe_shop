import { useLocation } from "../contexts/LocationContext";

/**
 * Subscribe to the active location scope. Include `locationRevision` in effect
 * dependencies to re-fetch when the user switches location.
 */
export function useLocationScope() {
  const ctx = useLocation();
  return {
    locationId: ctx.locationId,
    locationName: ctx.locationName,
    locationRevision: ctx.locationRevision,
    isAllLocations: ctx.isAllLocations,
    ready: ctx.locationId !== null,
  };
}
