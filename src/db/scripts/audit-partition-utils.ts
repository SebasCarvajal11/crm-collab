/** Utilidades para particiones mensuales de `schema_collab.audit_logs`. */

export type MonthSlice = {
  partitionName: string;
  fromInclusive: string;
  toExclusive: string;
};

export function utcMonthStart(year: number, monthIndex0: number): Date {
  return new Date(Date.UTC(year, monthIndex0, 1, 0, 0, 0, 0));
}

export function sliceForUtcMonth(d: Date): MonthSlice {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const start = utcMonthStart(y, m);
  const end = utcMonthStart(y, m + 1);
  const mm = String(m + 1).padStart(2, "0");
  return {
    partitionName: `audit_logs_p${y}_${mm}`,
    fromInclusive: start.toISOString().slice(0, 10),
    toExclusive: end.toISOString().slice(0, 10),
  };
}

export function assertSafePartitionName(name: string): void {
  if (!/^audit_logs_p\d{4}_\d{2}$/.test(name)) {
    throw new Error(`Nombre de partición inválido: ${name}`);
  }
}
