import type { ReactNode } from "react";
import { useIsCmOrAbove, usePermission } from "../../hooks/usePermission";

interface PermissionGateProps {
  permission?: string;
  /** Shorthand for CM / owner at current location */
  cmOrAbove?: boolean;
  children: ReactNode;
  fallback?: ReactNode;
}

export function PermissionGate({
  permission,
  cmOrAbove = false,
  children,
  fallback = null,
}: PermissionGateProps) {
  const allowedByPermission = usePermission(permission ?? "");
  const allowedByRole = useIsCmOrAbove();
  const allowed = cmOrAbove
    ? allowedByRole
    : permission
      ? allowedByPermission
      : false;

  if (!allowed) return <>{fallback}</>;
  return <>{children}</>;
}
