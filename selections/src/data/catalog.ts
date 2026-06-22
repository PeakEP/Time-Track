import type { Category } from "../types";

/**
 * Generate a placeholder swatch image as an SVG data URI.
 * These stand in for real product photos in the demo — replace `image`
 * values with photo URLs (or imported assets) when the real catalog is ready.
 */
export function swatch(label: string, color: string, accent = "#ffffff"): string {
  const safe = label.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300' viewBox='0 0 400 300'>
    <defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
      <stop offset='0' stop-color='${color}'/>
      <stop offset='1' stop-color='${shade(color, -18)}'/>
    </linearGradient></defs>
    <rect width='400' height='300' fill='url(#g)'/>
    <rect x='14' y='14' width='372' height='272' fill='none' stroke='${accent}' stroke-opacity='0.35' stroke-width='2'/>
    <text x='200' y='160' text-anchor='middle' font-family='Georgia,serif' font-size='26' fill='${accent}'>${safe}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// Lighten/darken a hex color by a percentage.
function shade(hex: string, percent: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const t = percent < 0 ? 0 : 255;
  const p = Math.abs(percent) / 100;
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  const mix = (c: number) => Math.round((t - c) * p + c);
  return `#${((1 << 24) + (mix(r) << 16) + (mix(g) << 8) + mix(b)).toString(16).slice(1)}`;
}

/**
 * DEMO CATALOG — sample interior finishes for Robins Interiors & Designs.
 * Structure is real; names, prices, and "included vs upgrade" flags are
 * placeholders to be replaced with your actual catalog spreadsheet.
 */
export const CATALOG: Category[] = [
  {
    id: "flooring",
    name: "Flooring",
    description: "Main living areas. One selection per home for the standard package.",
    options: [
      { id: "floor-lvp", name: "Luxury Vinyl Plank", description: "Waterproof, wood-look. Standard package.", image: swatch("LVP — Oak", "#b08b5e"), pricing: "included", price: 0 },
      { id: "floor-carpet", name: "Plush Carpet (Bedrooms)", description: "Stain-resistant nylon.", image: swatch("Carpet — Greige", "#a9a097"), pricing: "included", price: 0 },
      { id: "floor-hardwood", name: "Engineered Hardwood", description: "5\" white oak, matte finish.", image: swatch("Hardwood — White Oak", "#8a6240"), pricing: "upgrade", price: 4200 },
      { id: "floor-tile", name: "Porcelain Wood-Look Tile", description: "Through-body porcelain plank.", image: swatch("Tile — Plank", "#9c8a74"), pricing: "upgrade", price: 5600 },
    ],
  },
  {
    id: "cabinets",
    name: "Kitchen Cabinets",
    description: "Door style and finish for the main kitchen.",
    options: [
      { id: "cab-white", name: "Shaker — White", description: "Painted white shaker. Standard.", image: swatch("Shaker White", "#eee9e1", "#7a6f5d"), pricing: "included", price: 0 },
      { id: "cab-grey", name: "Shaker — Stone Grey", description: "Painted grey shaker. Standard.", image: swatch("Shaker Grey", "#9a9a93"), pricing: "included", price: 0 },
      { id: "cab-twotone", name: "Two-Tone (Island Accent)", description: "Contrasting island color.", image: swatch("Two-Tone Navy", "#33415c"), pricing: "upgrade", price: 1850 },
      { id: "cab-custom", name: "Custom Color Match", description: "Any paint color, soft-close.", image: swatch("Custom Color", "#6b7a5e"), pricing: "upgrade", price: 2950 },
    ],
  },
  {
    id: "countertops",
    name: "Countertops",
    description: "Kitchen counters and island.",
    options: [
      { id: "counter-lam", name: "Laminate", description: "Standard package.", image: swatch("Laminate", "#cfc6b8"), pricing: "included", price: 0 },
      { id: "counter-granite", name: "Granite", description: "Level 1 granite, eased edge.", image: swatch("Granite", "#6e6a66"), pricing: "upgrade", price: 2400 },
      { id: "counter-quartz", name: "Quartz", description: "Engineered quartz, low maintenance.", image: swatch("Quartz — White", "#e8e6e2", "#8a8378"), pricing: "upgrade", price: 3300 },
      { id: "counter-quartzite", name: "Natural Quartzite", description: "Premium natural stone.", image: swatch("Quartzite", "#cdd2d4", "#6c7378"), pricing: "upgrade", price: 5200 },
    ],
  },
  {
    id: "backsplash",
    name: "Kitchen Backsplash",
    options: [
      { id: "bs-subway", name: "Subway Tile", description: "3x6 ceramic, standard.", image: swatch("Subway White", "#f2efe9", "#8a8378"), pricing: "included", price: 0 },
      { id: "bs-mosaic", name: "Mosaic Accent", description: "Glass/stone blend.", image: swatch("Mosaic", "#7f8c8d"), pricing: "upgrade", price: 950 },
      { id: "bs-slab", name: "Full-Height Slab", description: "Counter material to underside of uppers.", image: swatch("Slab Backsplash", "#d9d4cc", "#7a6f5d"), pricing: "upgrade", price: 2100 },
    ],
  },
  {
    id: "paint",
    name: "Interior Paint",
    options: [
      { id: "paint-white", name: "Builder White (Whole Home)", description: "One standard color throughout.", image: swatch("Builder White", "#f4f1ea", "#8a8378"), pricing: "included", price: 0 },
      { id: "paint-designer", name: "Designer Color Scheme", description: "Curated whole-home palette.", image: swatch("Designer Palette", "#b9c0b0"), pricing: "upgrade", price: 1200 },
      { id: "paint-accent", name: "Accent Walls (up to 4)", description: "Feature walls in select rooms.", image: swatch("Accent Wall", "#4a5a66"), pricing: "upgrade", price: 650 },
    ],
  },
  {
    id: "plumbing",
    name: "Plumbing Fixtures",
    description: "Faucet and fixture finish.",
    options: [
      { id: "plumb-chrome", name: "Polished Chrome", description: "Standard.", image: swatch("Chrome", "#c8ccce", "#5a5f63"), pricing: "included", price: 0 },
      { id: "plumb-nickel", name: "Brushed Nickel", description: "Standard.", image: swatch("Brushed Nickel", "#a9a8a3"), pricing: "included", price: 0 },
      { id: "plumb-black", name: "Matte Black", description: "Upgrade finish.", image: swatch("Matte Black", "#2b2b2b"), pricing: "upgrade", price: 780 },
      { id: "plumb-gold", name: "Brushed Gold", description: "Upgrade finish.", image: swatch("Brushed Gold", "#b39256"), pricing: "upgrade", price: 1150 },
    ],
  },
  {
    id: "hardware",
    name: "Cabinet Hardware",
    options: [
      { id: "hw-nickel", name: "Brushed Nickel Pulls", description: "Standard.", image: swatch("Nickel Pulls", "#aaa9a4"), pricing: "included", price: 0 },
      { id: "hw-black", name: "Matte Black Pulls", description: "Upgrade.", image: swatch("Black Pulls", "#2f2f2f"), pricing: "upgrade", price: 320 },
      { id: "hw-gold", name: "Champagne Gold Pulls", description: "Upgrade.", image: swatch("Gold Pulls", "#bfa066"), pricing: "upgrade", price: 480 },
    ],
  },
  {
    id: "lighting",
    name: "Lighting Package",
    options: [
      { id: "light-standard", name: "Standard Fixtures", description: "Builder lighting allowance.", image: swatch("Standard Lighting", "#d8cfa8", "#6b5f3a"), pricing: "included", price: 0 },
      { id: "light-designer", name: "Designer Fixtures", description: "Upgraded pendants & fixtures.", image: swatch("Designer Lighting", "#c4a35a"), pricing: "upgrade", price: 1650 },
    ],
  },
  {
    id: "addons",
    name: "Optional Add-Ons",
    description: "Select any that apply.",
    multi: true,
    options: [
      { id: "add-island", name: "Waterfall Island Edge", image: swatch("Waterfall Edge", "#dcd7cf", "#7a6f5d"), pricing: "upgrade", price: 1900 },
      { id: "add-pantry", name: "Walk-In Pantry Shelving", image: swatch("Pantry Shelving", "#b59b76"), pricing: "upgrade", price: 1250 },
      { id: "add-undercab", name: "Under-Cabinet LED Lighting", image: swatch("Under-Cab LED", "#e6dca0", "#6b5f3a"), pricing: "upgrade", price: 740 },
      { id: "add-trim", name: "Upgraded Trim & Crown", image: swatch("Crown Molding", "#efebe3", "#8a8378"), pricing: "upgrade", price: 2100 },
    ],
  },
];

export const DEFAULT_BASE_PRICE = 18500;
