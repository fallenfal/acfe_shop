export type PermissionTree = Record<string, boolean | Record<string, unknown>>;

export interface Role {
  name: string;
  slug: string;
  permissions: PermissionTree;
}

export interface UserLocation {
  id: string;
  name: string;
  role: Role;
}

export interface Organisation {
  id: string;
  name: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  phone: string;
  avatar_url: string | null;
  organisation: Organisation | null;
  locations: UserLocation[];
}

export interface LoginResponse {
  access: string;
  refresh: string;
}
