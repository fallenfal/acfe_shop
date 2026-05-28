import type { PermissionTree, Role, User } from "../types/user";

/** Defaults for system roles when DB/ session permissions pre-date datechecks. */
const SYSTEM_ROLE_TRAINING: Record<string, Record<string, boolean>> = {
  owner: {
    create: true,
    read: true,
    update: true,
    delete: true,
    assign: true,
    complete: true,
  },
  content_manager: {
    create: true,
    read: true,
    update: true,
    delete: true,
    assign: true,
    complete: true,
  },
  staff: {
    read: true,
    complete: true,
  },
};

const SYSTEM_ROLE_DATECHECKS: Record<
  string,
  Record<string, boolean>
> = {
  owner: {
    create: true,
    read: true,
    resolve_alerts: true,
    manage_schedule: true,
  },
  content_manager: {
    create: true,
    read: true,
    resolve_alerts: true,
    manage_schedule: true,
  },
  staff: {
    create: true,
    read: true,
  },
};

export function normalizeLocationId(id: string | null | undefined): string {
  return id == null ? "" : String(id).toLowerCase();
}

export function getPermission(
  permissions: PermissionTree,
  path: string,
): boolean {
  if (!permissions) return false;
  const parts = path.split(".");
  let node: unknown = permissions;
  for (const part of parts) {
    if (typeof node !== "object" || node === null) return false;
    node = (node as Record<string, unknown>)[part];
  }
  return Boolean(node);
}

export function roleHasPermission(role: Role, permissionPath: string): boolean {
  if (role.slug === "owner") return true;
  if (getPermission(role.permissions, permissionPath)) return true;

  const [module, action] = permissionPath.split(".", 2);
  if (!action) return false;
  if (module === "datechecks") {
    return Boolean(SYSTEM_ROLE_DATECHECKS[role.slug]?.[action]);
  }
  if (module === "training") {
    return Boolean(SYSTEM_ROLE_TRAINING[role.slug]?.[action]);
  }
  return false;
}

export function findUserLocation(
  user: User,
  locationId: string,
): User["locations"][number] | undefined {
  const needle = normalizeLocationId(locationId);
  return user.locations.find((l) => normalizeLocationId(l.id) === needle);
}

export function hasPermissionAtLocation(
  user: User | null,
  locationId: string | null,
  permissionPath: string,
): boolean {
  if (!user || !locationId) return false;
  if (locationId === "all") return isOrgOwner(user);
  const assignment = findUserLocation(user, locationId);
  if (!assignment) return false;
  return roleHasPermission(assignment.role, permissionPath);
}

export function isCmOrAbove(role: Role | undefined): boolean {
  if (!role) return false;
  return role.slug === "owner" || role.slug === "content_manager";
}

export function isOrgOwner(user: User | null): boolean {
  if (!user) return false;
  return user.locations.some((l) => l.role.slug === "owner");
}

export function canViewSalesDashboard(
  user: User | null,
  locationId: string | null,
): boolean {
  if (!user || !locationId) return false;
  if (locationId === "all") return isOrgOwner(user);
  return hasPermissionAtLocation(user, locationId, "sales.view_dashboard");
}

export function canViewSalesFinancials(
  user: User | null,
  locationId: string | null,
): boolean {
  if (!user || !locationId) return false;
  if (locationId === "all") return isOrgOwner(user);
  return hasPermissionAtLocation(user, locationId, "sales.view_financials");
}

export function canReadDateChecks(
  user: User | null,
  locationId: string | null,
  role?: Role | null,
): boolean {
  if (role && roleHasPermission(role, "datechecks.read")) return true;
  return hasPermissionAtLocation(user, locationId, "datechecks.read");
}

export function canCreateDateCheck(
  user: User | null,
  locationId: string | null,
  role?: Role | null,
): boolean {
  if (role && roleHasPermission(role, "datechecks.create")) return true;
  return hasPermissionAtLocation(user, locationId, "datechecks.create");
}

export function canResolveExpiryAlerts(
  user: User | null,
  locationId: string | null,
  role?: Role | null,
): boolean {
  if (role && roleHasPermission(role, "datechecks.resolve_alerts")) return true;
  return hasPermissionAtLocation(user, locationId, "datechecks.resolve_alerts");
}

export function canManageDateCheckSchedule(
  user: User | null,
  locationId: string | null,
  role?: Role | null,
): boolean {
  if (role && roleHasPermission(role, "datechecks.manage_schedule")) return true;
  return hasPermissionAtLocation(
    user,
    locationId,
    "datechecks.manage_schedule",
  );
}

export function canEditMemo(
  user: User | null,
  locationId: string | null,
  authorId: string | null,
): boolean {
  if (!user || !locationId) return false;
  if (authorId && user.id === authorId) return true;
  const assignment = findUserLocation(user, locationId);
  return isCmOrAbove(assignment?.role);
}
