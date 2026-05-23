// Approximate display hex colors for OPPEIN finish codes (3D shading only).
const FINISH_HEX: Record<string, string> = {
  MPW: "#f3f1ec", // Pure White
  MNW: "#c8a875", // Natural Wood
  MSO: "#6b4a2b", // Smoked Oak
  SPW: "#efeee9", // Shaker Pure White
  KNW: "#d8c69b", // Edge White / light wood
  WSS: "#ecebe6", // White Shaker
  GSS: "#8c8f93", // Gray Shaker
  BSS: "#2a3a55", // Blue Shaker (navy)
  PGW: "#bfbcb4", // Gray White
  PMW: "#f6f5f1", // Matte White
  PMA: "#b2a691", // Matte Ash
  PMB: "#1c1c1c", // Matte Black
  PGG: "#7a7d80", // Gloss Gray
  PMG: "#8d8c89", // Matte Gray
  PGA: "#a89a82", // Gloss Ash
  SSW: "#eeece6", // Slim Shaker White
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
