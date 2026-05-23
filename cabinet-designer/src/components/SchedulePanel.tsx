import { useMemo } from "react";
import { Trash2, Plus, Minus } from "lucide-react";
import { useStore } from "../store";
import { computeLines, computeTotals, findFinish, formatCAD } from "../utils/pricing";

export function SchedulePanel() {
  const catalog = useStore((s) => s.catalog);
  const project = useStore((s) => s.project);
  const showInternal = useStore((s) => s.showInternalPricing);
  const removeItem = useStore((s) => s.removeItem);
  const updateItem = useStore((s) => s.updateItem);
  const select = useStore((s) => s.select);
  const selectedId = useStore((s) => s.selectedId);
  const toggleInternal = useStore((s) => s.toggleInternalPricing);

  const lines = useMemo(() => {
    if (!catalog) return [];
    return computeLines(
      project.items,
      catalog,
      project.settings.finishCode,
      project.settings.boxMaterial,
    );
  }, [catalog, project.items, project.settings.finishCode, project.settings.boxMaterial]);

  const totals = useMemo(() => {
    if (!catalog)
      return { subtotalList: 0, dealerDiscount: 0, jmrcCost: 0, markup: 1.2, clientSubtotal: 0, hstRate: 0.15, hst: 0, clientTotal: 0 };
    return computeTotals(lines, catalog, project.settings.markup, project.settings.hstRate);
  }, [catalog, lines, project.settings.markup, project.settings.hstRate]);

  if (!catalog) return <aside className="schedule">Loading…</aside>;

  // Group by category
  const groups = new Map<string, typeof lines>();
  for (const l of lines) {
    const k = l.product?.cat ?? "Other";
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(l);
  }

  const finish = findFinish(catalog, project.settings.finishCode);

  return (
    <aside className="schedule">
      <header className="schedule-header">
        <div className="schedule-title">Schedule & Pricing</div>
        <div className="schedule-sub">
          {finish?.name ?? project.settings.finishCode} · {finish?.tierName ?? ""} · {project.settings.boxMaterial === "PLY" ? "Plywood" : "Particle Board"}
        </div>
      </header>
      <div className="schedule-toggle">
        <button className={!showInternal ? "active" : ""} onClick={() => showInternal && toggleInternal()}>
          Client
        </button>
        <button className={showInternal ? "active" : ""} onClick={() => !showInternal && toggleInternal()}>
          Internal
        </button>
      </div>
      <div className="schedule-list">
        {lines.length === 0 && (
          <div className="schedule-empty">
            No items yet. Pick a cabinet from the catalog on the left and click on the plan to place it.
          </div>
        )}
        {Array.from(groups.entries()).map(([cat, ls]) => {
          // collapse identical SKUs (geometry-placed cabinets) — keep distinct rows for individual items
          return (
            <div className="schedule-group" key={cat}>
              <div className="schedule-cat">{cat}</div>
              {ls.map((l) => {
                const cost = l.lineList * (1 - catalog._meta.dealer_discount);
                const client = cost * project.settings.markup;
                const isSelected = l.item.id === selectedId;
                return (
                  <div
                    key={l.item.id}
                    className={`schedule-row ${isSelected ? "selected" : ""} ${l.available ? "" : "unavailable"}`}
                    onClick={() => select(l.item.id)}
                  >
                    <div className="row-main">
                      <div className="row-sku">{l.item.sku}</div>
                      <div className="row-desc">{l.product?.desc ?? "—"}</div>
                      <div className="row-dims">{l.product?.dims ?? ""}</div>
                    </div>
                    <div className="row-side">
                      {l.item.scheduleOnly ? (
                        <div className="qty-input">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              updateItem(l.item.id, { qty: Math.max(1, (l.item.qty ?? 1) - 1) });
                            }}
                          >
                            <Minus size={11} />
                          </button>
                          <span>{l.item.qty ?? 1}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              updateItem(l.item.id, { qty: (l.item.qty ?? 1) + 1 });
                            }}
                          >
                            <Plus size={11} />
                          </button>
                        </div>
                      ) : (
                        <div className="qty-static">1</div>
                      )}
                      <div className="row-price">
                        {l.available ? formatCAD(showInternal ? cost : client) : "N/A"}
                      </div>
                      <button
                        className="row-del"
                        title="Remove"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeItem(l.item.id);
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="schedule-totals">
        {showInternal ? (
          <>
            <Row label="Subtotal (list)" value={formatCAD(totals.subtotalList)} />
            <Row
              label={`Dealer discount (${Math.round(catalog._meta.dealer_discount * 100)}%)`}
              value={`- ${formatCAD(totals.dealerDiscount)}`}
            />
            <Row label="JMRC cost" value={formatCAD(totals.jmrcCost)} bold />
            <Row label={`Markup (${totals.markup.toFixed(2)}×)`} value={formatCAD(totals.clientSubtotal)} />
            <Row label={`HST (${Math.round(totals.hstRate * 100)}%)`} value={formatCAD(totals.hst)} />
            <Row label="Client total" value={formatCAD(totals.clientTotal)} bold big />
          </>
        ) : (
          <>
            <Row label="Subtotal" value={formatCAD(totals.clientSubtotal)} />
            <Row label={`HST (${Math.round(totals.hstRate * 100)}%)`} value={formatCAD(totals.hst)} />
            <Row label="Total (CAD)" value={formatCAD(totals.clientTotal)} bold big />
          </>
        )}
      </div>
    </aside>
  );
}

function Row({ label, value, bold, big }: { label: string; value: string; bold?: boolean; big?: boolean }) {
  return (
    <div className={`tot-row ${bold ? "bold" : ""} ${big ? "big" : ""}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
