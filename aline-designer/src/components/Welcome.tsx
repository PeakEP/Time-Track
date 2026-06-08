import { useEffect, useState } from "react";
import { MousePointerClick, Layers, Box, FileText, X } from "lucide-react";

const KEY = "jmrc.aline.welcomeShown.v1";

export function Welcome() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setOpen(true);
    } catch {
      // ignore
    }
  }, []);

  function close() {
    setOpen(false);
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      // ignore
    }
  }

  if (!open) return null;
  return (
    <div className="dialog-backdrop" onClick={close}>
      <div className="dialog welcome" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-head welcome-head">
          <div>
            <div className="welcome-title">JMRC — Aline Cabinet Designer</div>
            <div className="welcome-sub">Catalog: ALINE 2025 · 282 SKUs · Robins Interiors & Designs dealer (66% off list)</div>
          </div>
          <button className="welcome-close" onClick={close} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="dialog-body welcome-body">
          <p className="welcome-lead">
            Lay out a kitchen fast in 2D, present it in 3D, and export a priced
            schedule. Every cabinet you drop is priced live from the ALINE dealer
            sheet against the door style, color, and box you pick.
          </p>
          <div className="welcome-grid">
            <Step
              icon={<MousePointerClick size={18} />}
              title="Pick & place"
              body="Click a SKU in the catalog on the left, then click in the plan. Cabinets snap to walls and to a 3″ grid. Drag to move, R to rotate, Del to remove."
            />
            <Step
              icon={<Layers size={18} />}
              title="Shape the room"
              body="Room menu has rectangle, L-shape, and U-shape presets, plus custom dimensions. Turn on Edit vertices to drag walls into any polygon."
            />
            <Step
              icon={<Box size={18} />}
              title="See it in 3D"
              body="Top bar toggles split / plan only / 3D only. The 3D view orbits like a sphere — left-drag to rotate, wheel to zoom, right-drag to pan."
            />
            <Step
              icon={<FileText size={18} />}
              title="Schedule & export"
              body="The right panel lists every cabinet you place. File → Export PDF builds a branded landscape sheet with the plan + schedule. Save the .json to keep working."
            />
          </div>
          <div className="welcome-tips">
            <strong>Pricing is off by default.</strong> Turn it on anytime with “Show pricing”
            in the schedule panel or Settings → Pricing — it adds live ALINE dealer costs,
            markup and HST to the schedule and exports.
          </div>
        </div>
        <div className="dialog-foot welcome-foot">
          <span className="welcome-hint">Press <kbd>Cmd/Ctrl-Z</kbd> to undo · drafts autosave to this browser</span>
          <button className="btn-primary" onClick={close}>Get started</button>
        </div>
      </div>
    </div>
  );
}

function Step({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="welcome-step">
      <div className="welcome-step-icon">{icon}</div>
      <div>
        <div className="welcome-step-title">{title}</div>
        <div className="welcome-step-body">{body}</div>
      </div>
    </div>
  );
}
