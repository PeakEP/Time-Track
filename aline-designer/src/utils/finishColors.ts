// Approximate display hex colors for ALINE finish codes (3D shading only).
const FINISH_HEX: Record<string, string> = {
  // Melamine
  MEL: "#e9e6df", // Standard Melamine (light neutral)
  // High Gloss
  HGW: "#f7f8f8", // High Gloss White
  HGLG: "#bcc0c3", // High Gloss Light Grey
  HGG: "#7e8389", // High Gloss Grey
  // Matte
  MW: "#f5f6f5", // Matte White
  MG: "#8a8f93", // Matte Grey
  // Shaker
  SW: "#f3f4f3", // Shaker White
  GR: "#8e9398", // Shaker Grey
  SSW: "#f4f5f4", // Slim Shaker White
  SSG: "#6e7d5f", // Slim Shaker Green (sage)
  SMC: "#a87a4d", // Shaker Maple Caramel
  WG: "#9b9588", // Wood Grey (Bois Gris)
  WO: "#d7c8a6", // White Oak (Chêne Blanc)
  NW: "#c8a875", // Natural Wood (Bois Naturel)
  // Veneer
  SSV: "#c8a875", // Slim Shaker Veneer (natural)
  // Double Shaker
  BL: "#274066", // Blue
  DSW: "#f2f3f3", // White
};

export function finishColor(code: string): string {
  return FINISH_HEX[code] ?? "#dad7d0";
}

export function darken(hex: string, amt = 0.12): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = Math.max(0, ((n >> 16) & 0xff) - Math.round(255 * amt));
  const g = Math.max(0, ((n >> 8) & 0xff) - Math.round(255 * amt));
  const b = Math.max(0, (n & 0xff) - Math.round(255 * amt));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
