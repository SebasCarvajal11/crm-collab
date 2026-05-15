import { db } from "../../db/connection";
import { createProjectsRepository } from "./repository/projects.repository";
import { createAuditRepository } from "./repository/audit.repository";

export type DB = typeof db;
export type TX = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type DbOrTx = DB | TX;

export const createCollabRepository = (conn: DbOrTx = db) => {
  const repo = {
    ...createProjectsRepository(conn),
    ...createAuditRepository(conn),
  };

  return {
    ...repo,
    transaction: async <T>(cb: (txRepo: typeof repo) => Promise<T>): Promise<T> => {
      // If we're already in a transaction, just reuse it (depends on how deep we want to go, but usually fine)
      return conn.transaction(async (tx) => {
        return cb(createCollabRepository(tx));
      });
    },
  };
};

export type CollabRepository = ReturnType<typeof createCollabRepository>;
