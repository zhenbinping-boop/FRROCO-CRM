import type { OrganizationType, UserRole } from "@prisma/client";

export type UserPlacementError = "DEALER_ORGANIZATION_REQUIRED" | "DEALER_ROLE_REQUIRED" | null;

export function userPlacementError(
  role: UserRole,
  organizationType: OrganizationType | null,
  dealerOnly: boolean,
): UserPlacementError {
  if (role === "DEALER_USER" && organizationType !== "DEALER") return "DEALER_ORGANIZATION_REQUIRED";
  if (dealerOnly && role !== "DEALER_USER") return "DEALER_ROLE_REQUIRED";
  return null;
}
