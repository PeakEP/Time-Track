// Generates a placeholder swatch image (SVG data URI) for catalog options that
// don't yet have a real product photo. Real photos live in public/ and are
// referenced by an option's `image` field; until then `swatch` (a hex colour)
// drives this generator so the demo renders.

import type { FinishOption } from "../types";

// Lighten/darken a hex colour by a percentage (negative = darker).
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

function swatchDataUri(label: string, color: string): string {
  const accent = "#ffffff";
  const safe = label.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300' viewBox='0 0 400 300'>
    <defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
      <stop offset='0' stop-color='${color}'/>
      <stop offset='1' stop-color='${shade(color, -18)}'/>
    </linearGradient></defs>
    <rect width='400' height='300' fill='url(#g)'/>
    <rect x='14' y='14' width='372' height='272' fill='none' stroke='${accent}' stroke-opacity='0.3' stroke-width='2'/>
    <text x='200' y='160' text-anchor='middle' font-family='Georgia,serif' font-size='24' fill='${accent}'>${safe}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// Resolve the image src for an option: a real photo when present (under
// BASE_URL), otherwise a generated swatch.
export function optionImage(option: FinishOption): string {
  if (option.image) {
    return option.image.startsWith("http") || option.image.startsWith("data:")
      ? option.image
      : `${import.meta.env.BASE_URL}${option.image.replace(/^\//, "")}`;
  }
  return swatchDataUri(option.name, option.swatch ?? "#9a9a93");
}
