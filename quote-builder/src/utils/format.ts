export const money = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("en-CA", { style: "currency", currency: "CAD" });
export const money0 = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
export const qty = (n: number) => n.toLocaleString("en-CA", { maximumFractionDigits: 2 });
export const pct = (n: number | null | undefined) => (n == null ? "—" : `${(n * 100).toFixed(1)}%`);
export const when = (iso: string) => (iso ? new Date(iso).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" }) : "");
