import { useMemo } from "react";
import { Trash2, Plus, Minus, DollarSign, EyeOff, PanelRightClose, ClipboardList } from "lucide-react";
import { useStore } from "../store";
import { computeLines, computeTotals, findFinish, formatCAD } from "../utils/pricing";
import { itemDimsLabel } from "../utils/placement";

export function ScheduleRail() {
  const setScheduleCollapsed = useStore((s) => s.setScheduleCollapsed);
  const items = useStore((s) => s.project.items);
  const count = items.reduce((n, i) => n + (i.qty ?? 1), 0);
  return (
    <button
      className="schedule-rail"
      onClick={() => setScheduleCollapsed(false)}
      title="Expand schedule"
    >
      <ClipboardList size={16} />
      <span className="rail-label">Schedule</span>
      {count > 0 && <span className="rail-count">{count}</span>}
    </button>
  );
}

export function SchedulePanel() {
  const catalog = useStore((s) => s.catalog);
  const project = useStore((s) => s.project);
  const showPricing = useStore((s) => s.showPricing);
  const setShowPricing = useStore((s) => s.setShowPricing);
  const setScheduleCollapsed = useStore((s) => s.setScheduleCollapsed);
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

  const totalItems = lines.reduce((n, l) => n + (l.item.qty ?? 1), 0);

  return (
    <aside className="schedule">
      <header className="schedule-header">
        <div className="schedule-head-row">
          <div className="schedule-title">{showPricing ? "Schedule & Pricing" : "Cabinet Schedule"}</div>
          <div className="schedule-head-actions">
            <button
              className="pricing-switch"
              onClick={() => setShowPricing(!showPricing)}
              title={showPricing ? "Hide pricing" : "Show pricing"}
            >
              {showPricing ? <EyeOff size={13} /> : <DollarSign size={13} />}
              {showPricing ? "Hide pricing" : "Show pricing"}
            </button>
            <button
              className="schedule-collapse"
              onClick={() => setScheduleCollapsed(true)}
              title="Minimize schedule"
            >
              <PanelRightClose size={15} />
            </button>
          </div>
        </div>
        <div className="schedule-sub">
          {finish?.name ?? project.settings.finishCode}
          {showPricing ? ` · ${finish?.tierName ?? ""}` : ""} · {project.settings.boxMaterial === "PLY" ? "Plywood" : "Particle Board"} · {totalItems} item{totalItems === 1 ? "" : "s"}
        </div>
      </header>
      {showPricing && (
        <div className="schedule-toggle">
          <button className={!showInternal ? "active" : ""} onClick={() => showInternal && toggleInternal()}>
            Client
          </button>
          <button className={showInternal ? "active" : ""} onClick={() => !showInternal && toggleInternal()}>
            Internal
          </button>
        </div>
      )}
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
                      <div className="row-dims">{itemDimsLabel(l.item, l.product)}</div>
                      {(l.item.kind === "filler" || l.item.kind === "panel") && (
                        <div className="row-cut" onClick={(e) => e.stopPropagation()}>
                          <span className="row-cut-label">Cut to</span>
                          <input
                            type="number"
                            className="cut-input"
                            value={l.item.width || ""}
                            min={0}
                            step={0.25}
                            title="Width (in)"
                            onChange={(e) => updateItem(l.item.id, { width: +e.target.value })}
                          />
                          <span className="cut-x">×</span>
                          <input
                            type="number"
                            className="cut-input"
                            value={l.item.height || ""}
                            min={0}
                            step={0.25}
                            title="Height (in)"
                            onChange={(e) => updateItem(l.item.id, { height: +e.target.value })}
                          />
                          <span className="cut-unit">in</span>
                        </div>
                      )}
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
                      {showPricing && (
                        <div className="row-price">
                          {l.available ? formatCAD(showInternal ? cost : client) : "N/A"}
                        </div>
                      )}
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
      {showPricing && (
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
      )}
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
