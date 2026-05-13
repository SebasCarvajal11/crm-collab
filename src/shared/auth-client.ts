import { env } from "../config/env";

const AUTH_BY_SUBJECTS_URL = `${env.MOD_AUTH_URL}/users/by-subjects`;

export interface UserProfile {
  email: string;
  role: string;
  firstName: string | null;
  lastName: string | null;
  clientKind: "natural" | "juridical" | null;
  companyName: string | null;
  profession: string | null;
}

/**
 * Busca perfiles de usuario en mod-auth para una lista de userSubs.
 * Usa un solo request batch al endpoint /users/by-subjects.
 * Propaga las cabeceras de identidad del actor para que mod-auth pueda autorizar.
 */
export async function fetchUserProfiles(
  userSubs: string[],
  actor: { sub: string; role: string; email: string }
): Promise<Map<string, UserProfile>> {
  const profileMap = new Map<string, UserProfile>();
  if (userSubs.length === 0) return profileMap;

  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Gateway-Trust": env.GATEWAY_TRUST_SECRET,
    "X-User-Sub": actor.sub,
    "X-User-Id": actor.sub,
    "X-User-Role": actor.role,
    "X-User-Email": actor.email,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const url = `${AUTH_BY_SUBJECTS_URL}?subjects=${encodeURIComponent(userSubs.join(","))}`;
    const resp = await fetch(url, { headers, signal: controller.signal });
    if (!resp.ok) return profileMap;
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
    for (const u of body.data ?? []) {
      profileMap.set(u.subject, {
        email: u.email,
        role: u.role,
        firstName: u.first_name ?? null,
        lastName: u.last_name ?? null,
        clientKind: u.client_kind ?? null,
        companyName: u.company_name ?? null,
        profession: u.profession ?? null,
      });
    }
  } catch {
    // Enrichment failed — return empty map, workspace still works without emails
  } finally {
    clearTimeout(timeout);
  }

  return profileMap;
}
