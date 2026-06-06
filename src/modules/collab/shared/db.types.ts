import { db } from "../../../db/connection";

export type DB = typeof db;
export type TX = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type DbOrTx = DB | TX;
