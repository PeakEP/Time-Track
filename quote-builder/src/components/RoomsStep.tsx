import { useApp } from "../store";
import { FLOOR_TYPES, newRoom, ROOM_KINDS } from "../data/questions";
import type { Room, RoomKind } from "../types";
import { roomGeometry } from "../engine/takeoff";
import { qty } from "../utils/format";

function Num({ label, value, onChange, unit }: { label: string; value: number; onChange: (n: number) => void; unit?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="unit-input">
        <input type="number" min={0} step="any" value={value === 0 ? "" : value} placeholder="0" onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))} />
        {unit && <em>{unit}</em>}
      </div>
    </label>
  );
}

function Check({ label, value, onChange }: { label: string; value: boolean; onChange: (b: boolean) => void }) {
  return <label className="check"><input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} /> {label}</label>;
}

export default function RoomsStep() {
  const { quote, update } = useApp();
  if (!quote) return null;
  const rooms = quote.answers.rooms;
  const set = (i: number, patch: Partial<Room>) => update((q) => { Object.assign(q.answers.rooms[i], patch); });

  return (
    <div style={{ marginTop: 14 }}>
      {rooms.map((r, i) => {
        const g = roomGeometry(r);
        const wet = r.kind === "bathroom" || r.kind === "ensuite";
        const kitchen = r.kind === "kitchen";
        return (
          <div className="room" key={r.id}>
            <div className="room-head">
              <input value={r.name} onChange={(e) => set(i, { name: e.target.value })} />
              <select value={r.kind} onChange={(e) => set(i, { kind: e.target.value as RoomKind })}>
                {ROOM_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
              <span className="muted small">{qty(g.floor)} SF floor · {qty(g.walls)} SF walls</span>
              <div className="spacer" />
              <button className="btn sm" onClick={() => update((q) => { q.answers.rooms.splice(i + 1, 0, { ...JSON.parse(JSON.stringify(r)), id: crypto.randomUUID(), name: `${r.name} (copy)` }); })}>Copy</button>
              <button className="btn sm danger" onClick={() => update((q) => { q.answers.rooms.splice(i, 1); })}>Remove</button>
            </div>
            <div className="room-body">
              <div className="grid four">
                <Num label="Length" unit="ft" value={r.length} onChange={(n) => set(i, { length: n })} />
                <Num label="Width" unit="ft" value={r.width} onChange={(n) => set(i, { width: n })} />
                <Num label="Ceiling height" unit="ft" value={r.height} onChange={(n) => set(i, { height: n })} />
                <div className="grid two">
                  <Num label="Doors" value={r.doors} onChange={(n) => set(i, { doors: n })} />
                  <Num label="Windows" value={r.windows} onChange={(n) => set(i, { windows: n })} />
                </div>
              </div>

              <div className="room-section">
                <h4>Demo, walls & finishes</h4>
                <div className="grid four">
                  <label className="field"><span>Floor</span>
                    <select value={r.floor} onChange={(e) => set(i, { floor: e.target.value as Room["floor"] })}>
                      {FLOOR_TYPES.map((t) => <option key={t.value} value={t.value}>{t.value === "none" ? "No change" : t.label}</option>)}
                    </select>
                  </label>
                  <label className="field"><span>Drywall</span>
                    <select value={r.drywall} onChange={(e) => set(i, { drywall: e.target.value as Room["drywall"] })}>
                      <option value="none">None</option><option value="patch">Patch & repair</option><option value="walls">New on walls</option><option value="walls+ceiling">New walls & ceiling</option>
                    </select>
                  </label>
                  <Num label="New interior doors" value={r.newInteriorDoors} onChange={(n) => set(i, { newInteriorDoors: n })} />
                  <Num label="Light fixtures" value={r.lightFixtures} onChange={(n) => set(i, { lightFixtures: n })} />
                </div>
                <div className="checks" style={{ marginTop: 10 }}>
                  <Check label="Remove existing floor" value={r.demoFloor} onChange={(b) => set(i, { demoFloor: b })} />
                  <Check label="Gut to studs" value={r.demoWalls} onChange={(b) => set(i, { demoWalls: b })} />
                  <Check label="Paint walls" value={r.paintWalls} onChange={(b) => set(i, { paintWalls: b })} />
                  <Check label="Paint ceiling" value={r.paintCeiling} onChange={(b) => set(i, { paintCeiling: b })} />
                  <Check label="New baseboard" value={r.baseboard} onChange={(b) => set(i, { baseboard: b })} />
                </div>
              </div>

              {(kitchen || r.cabinetLF > 0 || r.kind === "laundry") && (
                <div className="room-section">
                  <h4>Cabinets & counters</h4>
                  <div className="grid three">
                    <Num label="Cabinet run" unit="LF" value={r.cabinetLF} onChange={(n) => set(i, { cabinetLF: n })} />
                    <Num label="Countertop" unit="SF" value={r.countertopSF} onChange={(n) => set(i, { countertopSF: n })} />
                    <Num label="Backsplash" unit="SF" value={r.backsplashSF} onChange={(n) => set(i, { backsplashSF: n })} />
                  </div>
                </div>
              )}

              {(wet || r.toilet || r.vanity || r.tubShower !== "none") && (
                <div className="room-section">
                  <h4>Bathroom</h4>
                  <div className="grid four">
                    <label className="field"><span>Tub / shower</span>
                      <select value={r.tubShower} onChange={(e) => set(i, { tubShower: e.target.value as Room["tubShower"] })}>
                        <option value="none">None</option><option value="tub">Tub</option><option value="shower">Shower</option>
                      </select>
                    </label>
                    <Num label="Shower wall tile" unit="SF" value={r.showerWallTileSF} onChange={(n) => set(i, { showerWallTileSF: n })} />
                    <div className="checks" style={{ alignItems: "end" }}>
                      <Check label="Toilet" value={r.toilet} onChange={(b) => set(i, { toilet: b })} />
                      <Check label="Vanity & faucet" value={r.vanity} onChange={(b) => set(i, { vanity: b })} />
                    </div>
                  </div>
                </div>
              )}

              <div className="room-section">
                <h4>Layout changes</h4>
                <div className="grid four">
                  <Num label="Walls removed" unit="LF" value={r.wallsRemovedLF} onChange={(n) => set(i, { wallsRemovedLF: n })} />
                  <Num label="New walls" unit="LF" value={r.newWallsLF} onChange={(n) => set(i, { newWallsLF: n })} />
                  <div className="checks" style={{ alignItems: "end" }}>
                    <Check label="A removed wall is load-bearing" value={r.loadBearingRemoved} onChange={(b) => set(i, { loadBearingRemoved: b })} />
                    <Check label="Plumbing relocated" value={r.plumbingRelocated} onChange={(b) => set(i, { plumbingRelocated: b })} />
                  </div>
                </div>
              </div>
              <div className="room-section">
                <label className="field"><span>Notes for this room (shown on the quote)</span>
                  <input value={r.notes} onChange={(e) => set(i, { notes: e.target.value })} />
                </label>
              </div>
            </div>
          </div>
        );
      })}
      <div className="row">
        <span className="muted">Add a room:</span>
        {ROOM_KINDS.map((k) => (
          <button key={k.value} className="btn sm" onClick={() => update((q) => { q.answers.rooms.push(newRoom(k.value)); })}>+ {k.label}</button>
        ))}
      </div>
    </div>
  );
}
