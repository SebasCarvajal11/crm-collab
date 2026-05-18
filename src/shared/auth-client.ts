import { env } from "../config/env";

const AUTH_BY_SUBJECTS_URL = `${env.MOD_AUTH_URL}/users/by-subjects`;
const PROFILE_TTL_MS = 5 * 60 * 1000;
const CACHE_CLEANUP_INTERVAL_MS = PROFILE_TTL_MS;
const INFLIGHT_MAX_MS = 5_000;

export interface UserProfile {
  email: string;
  role: string;
  firstName: string | null;
  lastName: string | null;
  clientKind: "natural" | "juridical" | null;
  companyName: string | null;
  profession: string | null;
}

export type FetchUserProfilesResult = {
  profiles: Map<string, UserProfile>;
  /** true si mod-auth no respondió o falló; los perfiles pueden estar incompletos. */
  enrichmentFailed: boolean;
};

type CachedProfile = {
  expiresAt: number;
  profile: UserProfile;
};

const profileCache = new Map<string, CachedProfile>();
const inflightRequests = new Map<string, Promise<FetchUserProfilesResult>>();

function purgeExpiredProfileCache(now = Date.now()) {
  for (const [sub, cached] of profileCache) {
    if (cached.expiresAt <= now) {
      profileCache.delete(sub);
    }
  }
}

const cacheCleanupTimer = setInterval(
  () => purgeExpiredProfileCache(),
  CACHE_CLEANUP_INTERVAL_MS,
);
if (typeof cacheCleanupTimer.unref === "function") {
  cacheCleanupTimer.unref();
}

/**
 * Batch lookup with short-lived in-memory cache so workspace/chat paths
 * don't block repeatedly on mod-auth for the same user set.
 */
export async function fetchUserProfiles(
  userSubs: string[],
  actor: { sub: string; userId?: string; role: string; email: string; bearerToken?: string },
): Promise<FetchUserProfilesResult> {
  const result = new Map<string, UserProfile>();
  if (userSubs.length === 0) {
    return { profiles: result, enrichmentFailed: false };
  }

  const uniqueSubs = [...new Set(userSubs)];
  const now = Date.now();
  purgeExpiredProfileCache(now);
  const missingSubs: string[] = [];

  for (const sub of uniqueSubs) {
    const cached = profileCache.get(sub);
    if (cached && cached.expiresAt > now) {
      result.set(sub, cached.profile);
    } else {
      if (cached) profileCache.delete(sub);
      missingSubs.push(sub);
    }
  }

  if (missingSubs.length === 0) {
    return { profiles: result, enrichmentFailed: false };
  }

  const cacheKey = missingSubs.slice().sort().join(",");
  const pending = inflightRequests.get(cacheKey);
  if (pending) {
    const { profiles: fetched, enrichmentFailed } = await pending;
    for (const [sub, profile] of fetched) result.set(sub, profile);
    return { profiles: result, enrichmentFailed };
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Gateway-Trust": env.GATEWAY_TRUST_SECRET,
    "X-User-Sub": actor.sub,
    "X-User-Id": actor.userId ?? actor.sub,
    "X-User-Role": actor.role,
    "X-User-Email": actor.email,
    "X-Token-Exp": String(Math.floor(Date.now() / 1000) + 900),
  };
  if (actor.bearerToken?.startsWith("Bearer ")) {
    headers.Authorization = actor.bearerToken;
  }

  const request = (async (): Promise<FetchUserProfilesResult> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    try {
      const fetchedProfiles = new Map<string, UserProfile>();
      const url = `${AUTH_BY_SUBJECTS_URL}?subjects=${encodeURIComponent(missingSubs.join(","))}`;
      const resp = await fetch(url, { headers, signal: controller.signal });

      if (!resp.ok) {
        console.warn(
          `[auth-client] mod-auth /users/by-subjects respondió ${resp.status} para ${missingSubs.length} usuario(s)`,
        );
        return { profiles: fetchedProfiles, enrichmentFailed: true };
      }

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

      const expiresAt = Date.now() + PROFILE_TTL_MS;
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
        profileCache.set(user.subject, { profile, expiresAt });
        fetchedProfiles.set(user.subject, profile);
      }

      return { profiles: fetchedProfiles, enrichmentFailed: false };
    } finally {
      clearTimeout(timeout);
    }
  })();

  const boundedRequest = Promise.race([
    request,
    new Promise<FetchUserProfilesResult>((_, reject) => {
      setTimeout(() => reject(new Error("inflight profile fetch timeout")), INFLIGHT_MAX_MS);
    }),
  ]);

  inflightRequests.set(cacheKey, boundedRequest);
  try {
    const { profiles: fetched, enrichmentFailed } = await boundedRequest;
    for (const [sub, profile] of fetched) result.set(sub, profile);
    return { profiles: result, enrichmentFailed };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[auth-client] No se pudieron obtener perfiles desde mod-auth (${missingSubs.length} subs): ${message}`,
    );
    return { profiles: result, enrichmentFailed: true };
  } finally {
    inflightRequests.delete(cacheKey);
  }
};
