import type { User } from "../types/user";
import { isCmOrAbove } from "./permissions";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export function canDeleteWasteEntry(
  user: User | null,
  locationId: string | null,
  loggedAt: string,
): boolean {
  if (!user || !locationId) return false;
  const assignment = user.locations.find((l) => l.id === locationId);
  if (!isCmOrAbove(assignment?.role)) return false;
  const age = Date.now() - new Date(loggedAt).getTime();
  return age >= 0 && age < TWENTY_FOUR_HOURS_MS;
}
