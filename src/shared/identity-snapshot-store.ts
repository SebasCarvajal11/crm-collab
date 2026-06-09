import { inArray, eq, sql } from "drizzle-orm";
import { db } from "../db/connection";
import {
  userIdentitySnapshots,
  projectMembers,
  projectChatMessages,
  projectFiles,
  projectTaskAssignees,
  projectTaskComments,
  projectMentionNotifications,
} from "../db/schema";
import { getLogger } from "./logger";

const logger = getLogger();

const PROFILE_TTL_MS = 5 * 60 * 1000;
const CACHE_CLEANUP_INTERVAL_MS = PROFILE_TTL_MS;

export interface UserProfile {
  email: string;
  role: string;
  firstName: string | null;
  lastName: string | null;
  clientKind: "natural" | "juridical" | null;
  companyName: string | null;
  profession: string | null;
}

export type UserProfileLookupResult = {
  profiles: Map<string, UserProfile>;
  missingSubs: string[];
  replicaUnavailable: boolean;
};

export type UserIdentitySnapshotInput = {
  userSub: string;
  email: string;
  role: string;
  firstName?: string | null;
  lastName?: string | null;
  clientKind?: "natural" | "juridical" | null;
  companyName?: string | null;
  profession?: string | null;
};

type CachedProfile = {
  expiresAt: number;
  profile: UserProfile;
};

const profileCache = new Map<string, CachedProfile>();

function toUserProfile(row: typeof userIdentitySnapshots.$inferSelect): UserProfile {
  return {
    email: row.email,
    role: row.role,
    firstName: row.firstName ?? null,
    lastName: row.lastName ?? null,
    clientKind: (row.clientKind as "natural" | "juridical" | null) ?? null,
    companyName: row.companyName ?? null,
    profession: row.profession ?? null,
  };
}

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

export async function getUserProfilesFromSnapshots(
  userSubs: string[],
): Promise<UserProfileLookupResult> {
  const profiles = new Map<string, UserProfile>();
  const uniqueSubs = [...new Set(userSubs)].filter(Boolean);

  if (uniqueSubs.length === 0) {
    return { profiles, missingSubs: [], replicaUnavailable: false };
  }

  const now = Date.now();
  purgeExpiredProfileCache(now);
  const missingAfterCache: string[] = [];

  for (const sub of uniqueSubs) {
    const cached = profileCache.get(sub);
    if (cached && cached.expiresAt > now) {
      profiles.set(sub, cached.profile);
    } else {
      if (cached) profileCache.delete(sub);
      missingAfterCache.push(sub);
    }
  }

  if (missingAfterCache.length === 0) {
    return { profiles, missingSubs: [], replicaUnavailable: false };
  }

  try {
    const rows = await db
      .select()
      .from(userIdentitySnapshots)
      .where(inArray(userIdentitySnapshots.userSub, missingAfterCache));

    const expiresAt = Date.now() + PROFILE_TTL_MS;
    for (const row of rows) {
      const profile = toUserProfile(row);
      profileCache.set(row.userSub, { profile, expiresAt });
      profiles.set(row.userSub, profile);
    }

    const missingSubs = uniqueSubs.filter((sub) => !profiles.has(sub));
    return { profiles, missingSubs, replicaUnavailable: false };
  } catch (err) {
    logger.error({ err }, "[identity-snapshots] Error leyendo replica local");
    return { profiles, missingSubs: missingAfterCache, replicaUnavailable: true };
  }
}

/**
 * Inserta o actualiza un snapshot de identidad de usuario de forma idempotente.
 * Mapea explícitamente los campos esperados para garantizar que cualquier propiedad o campo
 * adicional/desconocido enviado en los payloads de eventos sea filtrado e ignorado con éxito.
 */
export async function upsertUserIdentitySnapshot(
  snapshot: UserIdentitySnapshotInput,
): Promise<void> {
  const [row] = await db
    .insert(userIdentitySnapshots)
    .values({
      userSub: snapshot.userSub,
      email: snapshot.email,
      role: snapshot.role,
      firstName: snapshot.firstName ?? null,
      lastName: snapshot.lastName ?? null,
      clientKind: snapshot.clientKind ?? null,
      companyName: snapshot.companyName ?? null,
      profession: snapshot.profession ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: userIdentitySnapshots.userSub,
      set: {
        email: sql`excluded.email`,
        role: sql`excluded.role`,
        firstName: sql`excluded.first_name`,
        lastName: sql`excluded.last_name`,
        clientKind: sql`excluded.client_kind`,
        companyName: sql`excluded.company_name`,
        profession: sql`excluded.profession`,
        updatedAt: new Date(),
      },
    })
    .returning();

  profileCache.set(row.userSub, {
    profile: toUserProfile(row),
    expiresAt: Date.now() + PROFILE_TTL_MS,
  });
}

export async function deleteUserIdentitySnapshot(userSub: string): Promise<void> {
  profileCache.delete(userSub);
  await db
    .delete(userIdentitySnapshots)
    .where(eq(userIdentitySnapshots.userSub, userSub));
}

export async function anonymizeUserPII(userSub: string): Promise<void> {
  const anonEmail = `anon-${userSub}@cima.internal`;

  await db.transaction(async (tx) => {
    profileCache.delete(userSub);
    await tx
      .delete(userIdentitySnapshots)
      .where(eq(userIdentitySnapshots.userSub, userSub));

    await tx
      .update(projectMembers)
      .set({ userEmail: anonEmail })
      .where(eq(projectMembers.userSub, userSub));

    await tx
      .update(projectChatMessages)
      .set({ authorEmail: anonEmail })
      .where(eq(projectChatMessages.authorSub, userSub));

    await tx
      .update(projectFiles)
      .set({ createdByEmail: anonEmail })
      .where(eq(projectFiles.createdBySub, userSub));

    await tx
      .update(projectTaskAssignees)
      .set({ userEmail: anonEmail })
      .where(eq(projectTaskAssignees.userSub, userSub));

    await tx
      .update(projectTaskComments)
      .set({ authorEmail: anonEmail })
      .where(eq(projectTaskComments.authorSub, userSub));

    await tx
      .update(projectMentionNotifications)
      .set({ authorEmail: anonEmail })
      .where(eq(projectMentionNotifications.authorSub, userSub));
  });
}
