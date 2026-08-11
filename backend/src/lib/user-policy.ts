type AccessState = { role: string; active: boolean };
type AccessChanges = { role?: string; active?: boolean };

export function removesAdminAccess(current: AccessState, changes: AccessChanges) {
  return current.role === "ADMIN" && current.active &&
    (changes.active === false || changes.role !== undefined && changes.role !== "ADMIN");
}

export function removesOwnAdminAccess(isSelf: boolean, current: AccessState, changes: AccessChanges) {
  return isSelf && current.role === "ADMIN" &&
    (changes.active === false || changes.role !== undefined && changes.role !== "ADMIN");
}
