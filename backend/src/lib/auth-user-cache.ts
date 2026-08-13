import type { OrganizationType, UserRole } from "@prisma/client";

export type AuthUser = {
  id: string;
  email: string;
  role: UserRole;
  active: boolean;
  organizationId: string | null;
  organizationType: OrganizationType | null;
};

const ttlMs = 30_000;
const maxEntries = 1_000;
const cache = new Map<string, { expiresAt: number; user: AuthUser }>();
const generations = new Map<string, number>();

export function getCachedAuthUser(id: string): AuthUser | undefined {
  const entry = cache.get(id);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(id);
    return undefined;
  }
  return entry.user;
}

export function authUserGeneration(id: string): number {
  return generations.get(id) || 0;
}

export function cacheAuthUser(user: AuthUser, generation = authUserGeneration(user.id)): void {
  if (generation !== authUserGeneration(user.id)) return;
  if (cache.size >= maxEntries) cache.delete(cache.keys().next().value as string);
  cache.set(user.id, { expiresAt: Date.now() + ttlMs, user });
}

export function invalidateAuthUser(id: string): void {
  cache.delete(id);
  generations.set(id, authUserGeneration(id) + 1);
}
