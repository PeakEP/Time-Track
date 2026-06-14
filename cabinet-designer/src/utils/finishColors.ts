// Approximate display hex colors for OPPEIN finish codes (3D shading only).
const FINISH_HEX: Record<string, string> = {
  // Essential
  MPW: "#f8f8f7", // Flat Pure White
  MNW: "#c8a875", // Natural Wood
  MSO: "#6b4a2b", // Smoked Oak
  // Essential Plus
  SPW: "#f5f6f6", // Shaker Pure White
  // Trend
  KKNW: "#d8c69b", // Skeleton Natural Wood
  KNW: "#d8c69b", // legacy alias — old saved projects still resolve
  // Premium Shaker
  WSS: "#f2f3f3", // White Shaker
  GSS: "#8c9298", // Gray Shaker
  BSS: "#274066", // Blue Shaker (navy)
  // Urban Select
  PMW: "#f7f8f8", // Matte White
  PGW: "#f1f3f4", // Glossy White
  // Signature Prestige
  PMA: "#b2a691", // Matte Ash
  PMB: "#1c1c1c", // Matte Black
  PMG: "#8d8c89", // Matte Grey
  PGA: "#a89a82", // Glossy Ash
  PGG: "#7a7d80", // Glossy Gray
  // Elite
  SSW: "#f4f5f5", // Slim Shaker White
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
