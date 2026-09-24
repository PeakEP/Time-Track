import { useState } from "react";
import { X } from "lucide-react";

const SEEN_KEY = "jmrc.selections.welcome.v1";

// First-run help dialog. Shown once per browser; dismissable.
export function Welcome() {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(SEEN_KEY) !== "1";
    } catch {
      return true;
    }
  });

  if (!open) return null;

  function dismiss() {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // ignore
    }
    setOpen(false);
  }

  return (
    <div className="modal-backdrop" onClick={dismiss}>
      <div className="modal welcome" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Finish Selections</h3>
          <button className="icon-btn" onClick={dismiss} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <p className="welcome-lede">
          Walk a client through their custom-home interior finishes, then export a branded PDF.
        </p>
        <ul className="welcome-list">
          <li>Pick a <strong>category</strong> on the left, then choose finishes from the cards.</li>
          <li>
            <strong>Included</strong> finishes are in the base package; <strong>upgrades</strong> add to
            the running total.
          </li>
          <li>
            <strong>Designer</strong> mode shows costs, price overrides and discounts; <strong>Client</strong>{" "}
            mode is a clean selection view.
          </li>
          <li>Your work autosaves. Use <strong>Projects</strong> to save, reopen, import or export.</li>
        </ul>
        <div className="modal-foot">
          <span className="spacer" />
          <button className="btn-primary" onClick={dismiss}>
            Start selecting
          </button>
        </div>
      </div>
    </div>
  );
}
