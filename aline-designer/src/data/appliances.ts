// Built-in appliance presets — NOT priced (not OPPEIN product). Show as labelled
// blocks for spatial layout so the plan reads correctly.

export type AppliancePreset = {
  id: string;
  label: string;
  width: number;
  depth: number;
  height: number;
  mountZ: number;
  color: string;
};

export const APPLIANCES: AppliancePreset[] = [
  {
    id: "fridge-36",
    label: "Fridge 36\"",
    width: 36,
    depth: 30,
    height: 70,
    mountZ: 0,
    color: "#cfd6e0",
  },
  {
    id: "fridge-33",
    label: "Fridge 33\"",
    width: 33,
    depth: 30,
    height: 70,
    mountZ: 0,
    color: "#cfd6e0",
  },
  {
    id: "fridge-30",
    label: "Fridge 30\"",
    width: 30,
    depth: 30,
    height: 70,
    mountZ: 0,
    color: "#cfd6e0",
  },
  {
    id: "range-30",
    label: "Range 30\"",
    width: 30,
    depth: 26,
    height: 36,
    mountZ: 0,
    color: "#3c4150",
  },
  {
    id: "range-36",
    label: "Range 36\"",
    width: 36,
    depth: 26,
    height: 36,
    mountZ: 0,
    color: "#3c4150",
  },
  {
    id: "dishwasher-24",
    label: "Dishwasher 24\"",
    width: 24,
    depth: 24,
    height: 34.5,
    mountZ: 0,
    color: "#dce0e6",
  },
  {
    id: "microwave-otr",
    label: "Microwave (OTR) 30\"",
    width: 30,
    depth: 16,
    height: 17,
    mountZ: 54,
    color: "#2d2f3a",
  },
  {
    id: "hood-30",
    label: "Range Hood 30\"",
    width: 30,
    depth: 20,
    height: 12,
    mountZ: 66,
    color: "#9aa4b6",
  },
];
