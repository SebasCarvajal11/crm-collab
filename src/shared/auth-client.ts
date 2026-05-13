import { env } from "../config/env";

const AUTH_BY_SUBJECTS_URL = `${env.MOD_AUTH_URL}/users/by-subjects`;
const PROFILE_TTL_MS = 5 * 60 * 1000;

export interface UserProfile {
  email: string;
  role: string;
  firstName: string | null;
  lastName: string | null;
  clientKind: "natural" | "juridical" | null;
  companyName: string | null;
  profession: string | null;
}

type CachedProfile = {
  expiresAt: number;
  profile: UserProfile;
};

const profileCache = new Map<string, CachedProfile>();
const inflightRequests = new Map<string, Promise<Map<string, UserProfile>>>();

/**
 * Batch lookup with short-lived in-memory cache so workspace/chat paths
 * don't block repeatedly on mod-auth for the same user set.
 */
export async function fetchUserProfiles(
  userSubs: string[],
  actor: { sub: string; role: string; email: string }
): Promise<Map<string, UserProfile>> {
  const result = new Map<string, UserProfile>();
  if (userSubs.length === 0) return result;

  const uniqueSubs = [...new Set(userSubs)];
  const now = Date.now();
  const missingSubs: string[] = [];

  for (const sub of uniqueSubs) {
    const cached = profileCache.get(sub);
    if (cached && cached.expiresAt > now) {
      result.set(sub, cached.profile);
    } else {
      missingSubs.push(sub);
    }
  }

  if (missingSubs.length === 0) return result;

  const cacheKey = missingSubs.slice().sort().join(",");
  const pending = inflightRequests.get(cacheKey);
  if (pending) {
    const fetched = await pending;
    for (const [sub, profile] of fetched) result.set(sub, profile);
    return result;
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Gateway-Trust": env.GATEWAY_TRUST_SECRET,
    "X-User-Sub": actor.sub,
    "X-User-Id": actor.sub,
    "X-User-Role": actor.role,
    "X-User-Email": actor.email,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1200);

  const request = (async () => {
    const fetchedProfiles = new Map<string, UserProfile>();
    const url = `${AUTH_BY_SUBJECTS_URL}?subjects=${encodeURIComponent(missingSubs.join(","))}`;
    const resp = await fetch(url, { headers, signal: controller.signal });
    if (!resp.ok) return fetchedProfiles;

    const body = (await resp.json()) as {
      data: Array<{
        subject: string;
        email: string;
        role: string;
        first_name?: string | null;
        last_name?: string | null;
        client_kind?: "natural" | "juridical" | null;
        company_name?: string | null;
        profession?: string | null;
      }>;
    };

    for (const user of body.data ?? []) {
      const profile: UserProfile = {
        email: user.email,
        role: user.role,
        firstName: user.first_name ?? null,
        lastName: user.last_name ?? null,
        clientKind: user.client_kind ?? null,
        companyName: user.company_name ?? null,
        profession: user.profession ?? null,
      };
      profileCache.set(user.subject, { profile, expiresAt: Date.now() + PROFILE_TTL_MS });
      fetchedProfiles.set(user.subject, profile);
    }

    return fetchedProfiles;
  })();

  inflightRequests.set(cacheKey, request);
  try {
    const fetched = await request;
    for (const [sub, profile] of fetched) result.set(sub, profile);
  } catch {
    // Best effort enrichment only.
  } finally {
    inflightRequests.delete(cacheKey);
    clearTimeout(timeout);
  }

  return result;
}
