import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./AuthContext";
import { isOrgOwner, normalizeLocationId } from "../lib/permissions";
import type { Role, UserLocation } from "../types/user";

const STORAGE_KEY = "acfe_active_location_id";
export const ALL_LOCATIONS_ID = "all";

interface LocationContextValue {
  locationId: string | null;
  locationName: string | null;
  /** Increments when the selected location changes (for data-fetch effect deps). */
  locationRevision: number;
  isAllLocations: boolean;
  setLocationId: (id: string) => void;
  locations: { id: string; name: string }[];
  currentLocation: UserLocation | null;
  currentRole: Role | null;
}

const LocationContext = createContext<LocationContextValue | null>(null);

export function LocationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [locationId, setLocationIdState] = useState<string | null>(null);
  const [locationRevision, setLocationRevision] = useState(0);

  const locations = useMemo(
    () => user?.locations.map((l) => ({ id: l.id, name: l.name })) ?? [],
    [user],
  );

  const currentLocation = useMemo(() => {
    if (!user || !locationId || locationId === ALL_LOCATIONS_ID) return null;
    return user.locations.find((l) => l.id === locationId) ?? null;
  }, [user, locationId]);

  const currentRole = currentLocation?.role ?? null;

  useEffect(() => {
    if (!user?.locations.length) {
      setLocationIdState(null);
      return;
    }
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === ALL_LOCATIONS_ID && isOrgOwner(user)) {
      setLocationIdState(ALL_LOCATIONS_ID);
      return;
    }
    const valid = user.locations.find(
      (l) => normalizeLocationId(l.id) === normalizeLocationId(stored),
    );
    const fallbackId = valid?.id ?? user.locations[0].id;
    setLocationIdState((current) => {
      const currentValid = user.locations.some(
        (l) => normalizeLocationId(l.id) === normalizeLocationId(current),
      );
      const nextId = currentValid ? current! : fallbackId;
      if (nextId !== stored) {
        localStorage.setItem(STORAGE_KEY, nextId);
      }
      return nextId;
    });
  }, [user]);

  const setLocationId = useCallback((id: string) => {
    setLocationIdState((prev) => {
      if (prev !== id) {
        setLocationRevision((r) => r + 1);
      }
      return id;
    });
    localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const isAllLocations = locationId === ALL_LOCATIONS_ID;

  const locationName = isAllLocations
    ? "All Locations"
    : (locations.find((l) => l.id === locationId)?.name ?? null);

  const value = useMemo(
    () => ({
      locationId,
      locationName,
      locationRevision,
      isAllLocations,
      setLocationId,
      locations,
      currentLocation,
      currentRole,
    }),
    [
      locationId,
      locationName,
      locationRevision,
      isAllLocations,
      setLocationId,
      locations,
      currentLocation,
      currentRole,
    ],
  );

  return (
    <LocationContext.Provider value={value}>
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation() {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error("useLocation must be used within LocationProvider");
  return ctx;
}
