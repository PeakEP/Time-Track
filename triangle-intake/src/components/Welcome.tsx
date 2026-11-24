import { useState } from "react";
import { X } from "lucide-react";

const SEEN_KEY = "jmrc.triangle.welcome.v1";

// First-run help, shown once per browser.
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
          <h3>Triangle Kitchen Intake</h3>
          <button className="icon-btn" onClick={dismiss} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <p className="welcome-lede">
          A quick, picture-led walk-through to capture a customer's Triangle cabinet choices, then hand it off to the designer.
          <strong> No prices here</strong> — it's a starting point for the cabinet layout.
        </p>
        <ul className="welcome-list">
          <li>Work <strong>top to bottom</strong> down the steps on the left — each one only shows what fits the choices so far.</li>
          <li>Tap a <strong>picture</strong> to choose. A green check means it's selected; the form moves you along.</li>
          <li>Most steps are required; a few (edge profile, glass, accessories) are <strong>optional — skip them</strong> if they don't apply.</li>
          <li>At the end, <strong>Review &amp; hand off</strong> shows everything and exports a PDF for the designer.</li>
          <li>Colours on screen are approximate — the designer confirms the real finish from a Triangle sample.</li>
        </ul>
        <div className="modal-foot">
          <span className="spacer" />
          <button className="btn-primary" onClick={dismiss}>
            Start the intake
          </button>
        </div>
      </div>
    </div>
  );
}
