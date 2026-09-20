import type { GlobalRole } from "../collab.types";

export type Actor = {
  sub: string;
  userId: string;
  role: GlobalRole;
  email: string;
  bearerToken?: string;
};

export type RequestMeta = {
  ipAddress: string;
  userAgent: string;
};
