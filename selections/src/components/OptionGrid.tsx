import { Check } from "lucide-react";
import { useStore } from "../store";
import {
  defaultQuantity,
  formatCAD,
  formatUnitPrice,
  resolveUnit,
  unitPrice,
} from "../utils/pricing";
import { optionImage } from "../utils/swatch";
import type { Category, FinishOption } from "../types";

// Center pane: the active category's option cards.
export function OptionGrid() {
  const catalog = useStore((s) => s.catalog);
  const activeCategory = useStore((s) => s.activeCategory);

  const category = catalog?.categories.find((c) => c.id === activeCategory) ?? null;
  if (!category) return <div className="options" />;

  return (
    <main className="options">
      <div className="options-head">
        <h2>{category.name}</h2>
        {category.description && <p>{category.description}</p>}
        {category.multi && <span className="pill">Select any that apply</span>}
      </div>

      <div className="card-grid">
        {category.options.map((option) => (
          <OptionCard key={option.id} category={category} option={option} />
        ))}
      </div>
    </main>
  );
}

// One selectable finish. Handles selection, unit-aware pricing, quantity, and
// the designer price override.
function OptionCard({ category, option }: { category: Category; option: FinishOption }) {
  const selected = useStore((s) => (s.project.selections[category.id] ?? []).includes(option.id));
  const override = useStore((s) => s.project.overrides[option.id]);
  const quantity = useStore((s) => s.project.quantities[option.id]);
  const designer = useStore((s) => s.mode === "designer");
  const toggleOption = useStore((s) => s.toggleOption);
  const setOverride = useStore((s) => s.setOverride);
  const setQuantity = useStore((s) => s.setQuantity);

  const unit = resolveUnit(category, option);
  const price = override ?? option.price;
  const isUpgrade = option.pricing === "upgrade";
  const qty = quantity ?? defaultQuantity(unit);
  const lineTotal = isUpgrade ? price * qty : 0;

  return (
    <div className={`card ${selected ? "selected" : ""}`}>
      <button
        className="card-img"
        onClick={() => toggleOption(category.id, option.id, !!category.multi)}
        aria-pressed={selected}
      >
        <img src={optionImage(option)} alt={option.name} loading="lazy" />
        {selected && (
          <span className="card-tick">
            <Check size={15} />
          </span>
        )}
        {option.pricing === "included" ? (
          <span className="tag tag-included">Included</span>
        ) : (
          <span className="tag tag-upgrade">
            {unit === "sqft" ? formatUnitPrice(price, unit) : `+${formatCAD(price)}`}
          </span>
        )}
      </button>

      <div className="card-body">
        <strong>{option.name}</strong>
        {option.description && <p>{option.description}</p>}

        {selected && isUpgrade && (
          <div className="qty-row">
            <label className="qty">
              {unit === "sqft" ? "Area (sq ft)" : "Qty"}
              <input
                type="number"
                min={0}
                step={unit === "sqft" ? 1 : 1}
                value={quantity ?? (unit === "sqft" ? "" : 1)}
                placeholder={unit === "sqft" ? "0" : "1"}
                onChange={(e) =>
                  setQuantity(option.id, e.target.value === "" ? null : Number(e.target.value))
                }
              />
            </label>
            <span className="line-total num">{formatCAD(lineTotal)}</span>
          </div>
        )}

        {designer && isUpgrade && (
          <label className="override">
            Unit $
            <input
              type="number"
              min={0}
              value={price}
              onChange={(e) => setOverride(option.id, e.target.value === "" ? null : Number(e.target.value))}
            />
            {unit === "sqft" && <span className="unit-suffix">/sf</span>}
          </label>
        )}
      </div>
    </div>
  );
}
