import { Check } from "lucide-react";
import { useStore } from "../store";

// Left rail: one row per catalog category, with a selected-count indicator.
export function CategoryNav() {
  const catalog = useStore((s) => s.catalog);
  const selections = useStore((s) => s.project.selections);
  const activeCategory = useStore((s) => s.activeCategory);
  const setActiveCategory = useStore((s) => s.setActiveCategory);

  if (!catalog) return null;

  return (
    <nav className="catnav">
      {catalog.categories.map((c) => {
        const count = (selections[c.id] ?? []).length;
        return (
          <button
            key={c.id}
            className={`catnav-row ${activeCategory === c.id ? "active" : ""}`}
            onClick={() => setActiveCategory(c.id)}
          >
            <span className="catnav-name">{c.name}</span>
            {count > 0 ? (
              <span className="catnav-check">
                <Check size={12} />
              </span>
            ) : (
              <span className="catnav-dot" />
            )}
          </button>
        );
      })}
    </nav>
  );
}
