import { Check } from "lucide-react";
import { useStore } from "../store";
import { defaultQuantity, formatCAD, formatUnitPrice, resolveUnit, slotKey } from "../utils/pricing";
import { optionImage } from "../utils/swatch";
import type { Category, FinishOption, RoomSlot } from "../types";

// Center pane: the active category's option cards.
export function OptionGrid() {
  const catalog = useStore((s) => s.catalog);
  const activeCategory = useStore((s) => s.activeCategory);

  const category = catalog?.categories.find((c) => c.id === activeCategory) ?? null;
  if (!category) return <div className="options" />;

  // Slotted categories present one single-select grid per named slot (e.g. an
  // Ensuite and a Main Bath vanity), each choosing from its eligible options.
  if (category.slots?.length) {
    return (
      <main className="options">
        <div className="options-head">
          <h2>{category.name}</h2>
          {category.description && <p>{category.description}</p>}
          <span className="pill">One selection per room</span>
        </div>
        {category.slots.map((slot) => (
          <SlotSection key={slot.id} category={category} slot={slot} />
        ))}
      </main>
    );
  }

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

// Is this option choosable for the given slot? Options with no `slots` list are
// eligible everywhere; otherwise the slot id must be listed.
function eligible(option: FinishOption, slotId: string): boolean {
  return !option.slots || option.slots.includes(slotId);
}

// One named slot: a labeled single-select grid keyed by `${categoryId}::${slotId}`.
function SlotSection({ category, slot }: { category: Category; slot: RoomSlot }) {
  const key = slotKey(category.id, slot.id);
  const selectedId = useStore((s) => (s.project.selections[key] ?? [])[0] ?? null);
  const options = category.options.filter((o) => eligible(o, slot.id));

  return (
    <section className="slot-section">
      <div className="slot-head">
        <h3>{slot.label}</h3>
        {slot.optional && <span className="pill pill-soft">Optional — leave empty for none</span>}
      </div>
      <div className="card-grid">
        {options.map((option) => (
          <SlotCard
            key={option.id}
            category={category}
            slotSelectionKey={key}
            option={option}
            selected={option.id === selectedId}
          />
        ))}
      </div>
    </section>
  );
}

// A single-select card within a slot. Clicking selects (or clears) this option
// for the slot; prices are fixed and never editable.
function SlotCard({
  category,
  slotSelectionKey,
  option,
  selected,
}: {
  category: Category;
  slotSelectionKey: string;
  option: FinishOption;
  selected: boolean;
}) {
  const toggleOption = useStore((s) => s.toggleOption);
  const tbd = !!option.tbd;
  const price = option.price;
  const imgClass = `card-img${category.fit === "contain" ? " card-img--contain" : ""}`;

  return (
    <div className={`card ${selected ? "selected" : ""}`}>
      <button
        className={imgClass}
        onClick={() => toggleOption(slotSelectionKey, option.id, false)}
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
        ) : tbd ? (
          <span className="tag tag-tbd">Price TBD</span>
        ) : (
          <span className="tag tag-upgrade">+{formatCAD(price)}</span>
        )}
      </button>
      <div className="card-body">
        <strong>{option.name}</strong>
        {option.description && <p>{option.description}</p>}
      </div>
    </div>
  );
}

// One selectable finish. Handles selection, unit-aware pricing, and quantity.
function OptionCard({ category, option }: { category: Category; option: FinishOption }) {
  const selected = useStore((s) => (s.project.selections[category.id] ?? []).includes(option.id));
  const quantity = useStore((s) => s.project.quantities[option.id]);
  const toggleOption = useStore((s) => s.toggleOption);
  const setQuantity = useStore((s) => s.setQuantity);

  const unit = resolveUnit(category, option);
  const price = option.price; // fixed catalog price — not editable
  const tbd = !!option.tbd;
  const isUpgrade = option.pricing === "upgrade" && !tbd;
  const qty = quantity ?? defaultQuantity(unit);
  const lineTotal = isUpgrade ? price * qty : 0;
  const imgClass = `card-img${category.fit === "contain" ? " card-img--contain" : ""}`;

  return (
    <div className={`card ${selected ? "selected" : ""}`}>
      <button
        className={imgClass}
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
        ) : tbd ? (
          <span className="tag tag-tbd">Price TBD</span>
        ) : (
          <span className="tag tag-upgrade">
            {unit === "sqft" ? formatUnitPrice(price, unit) : `+${formatCAD(price)}`}
          </span>
        )}
      </button>

      <div className="card-body">
        <strong>{option.name}</strong>
        {option.description && <p>{option.description}</p>}

        {/* Area field only for per-square-foot categories; flat/per-selection
            upgrades are added at their price (quantity 1). */}
        {selected && isUpgrade && unit === "sqft" && (
          <div className="qty-row">
            <label className="qty">
              Area (sq ft)
              <input
                type="number"
                min={0}
                value={quantity ?? ""}
                placeholder="0"
                onChange={(e) =>
                  setQuantity(option.id, e.target.value === "" ? null : Number(e.target.value))
                }
              />
            </label>
            <span className="line-total num">{formatCAD(lineTotal)}</span>
          </div>
        )}

        {/* Quantity for multi-select categories (e.g. a fan per bedroom) — how
            many of this option. */}
        {selected && category.multi && unit !== "sqft" && !tbd && (
          <div className="qty-row">
            <label className="qty">
              Qty
              <input
                type="number"
                min={1}
                value={quantity ?? 1}
                onChange={(e) =>
                  setQuantity(option.id, e.target.value === "" ? null : Number(e.target.value))
                }
              />
            </label>
            {isUpgrade && <span className="line-total num">{formatCAD(lineTotal)}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
