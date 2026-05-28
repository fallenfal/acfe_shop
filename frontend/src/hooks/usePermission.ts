import { useMemo } from "react";
import { ALL_LOCATIONS_ID, useLocation } from "../contexts/LocationContext";
import { useAuth } from "../contexts/AuthContext";
import {
  getPermission,
  hasPermissionAtLocation,
  isCmOrAbove,
  isOrgOwner,
} from "../lib/permissions";

export function usePermission(permissionPath: string): boolean {
  const { user } = useAuth();
  const { locationId, currentRole } = useLocation();

  return useMemo(() => {
    if (!user || !locationId) return false;
    if (locationId === ALL_LOCATIONS_ID) {
      return isOrgOwner(user);
    }
    return hasPermissionAtLocation(user, locationId, permissionPath);
  }, [user, locationId, permissionPath, currentRole]);
}

/** Content manager or owner at the active location (or org owner when all locations). */
export function useIsCmOrAbove(): boolean {
  const { user } = useAuth();
  const { locationId, currentRole } = useLocation();

  return useMemo(() => {
    if (!user || !locationId) return false;
    if (locationId === ALL_LOCATIONS_ID) return isOrgOwner(user);
    return isCmOrAbove(currentRole ?? undefined);
  }, [user, locationId, currentRole]);
}

export function useHasAnyPermission(module: string): boolean {
  const { user } = useAuth();
  const { locationId, currentRole } = useLocation();

  return useMemo(() => {
    if (!user || !locationId) return false;
    if (locationId === ALL_LOCATIONS_ID) return isOrgOwner(user);
    if (currentRole?.slug === "owner") return true;
    const modulePerms = currentRole?.permissions?.[module];
    if (typeof modulePerms !== "object" || modulePerms === null) return false;
    return Object.values(modulePerms as Record<string, unknown>).some(Boolean);
  }, [user, locationId, module, currentRole]);
}

export { getPermission };
