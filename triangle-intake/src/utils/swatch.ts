// Image resolver for options. A real brochure photo when present (under
// BASE_URL); otherwise a generated colour tile from the option's `swatch` hex
// (used for paint/stain/TFL/thermo colours and material chips).

import type { Option } from "../types";

function shade(hex: string, percent: number): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, "$1$1") : h, 16);
  const t = percent < 0 ? 0 : 255;
  const p = Math.abs(percent) / 100;
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  const mix = (c: number) => Math.round((t - c) * p + c);
  return `#${((1 << 24) + (mix(r) << 16) + (mix(g) << 8) + mix(b)).toString(16).slice(1)}`;
}

// A clean two-stop colour tile (no label — the card already shows the name).
export function swatchDataUri(color: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300' viewBox='0 0 400 300'>
    <defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
      <stop offset='0' stop-color='${shade(color, 8)}'/>
      <stop offset='1' stop-color='${shade(color, -14)}'/>
    </linearGradient></defs>
    <rect width='400' height='300' fill='url(#g)'/>
    <rect x='0.5' y='0.5' width='399' height='299' fill='none' stroke='#00000018' stroke-width='1'/>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function optionImage(option: Option): string {
  if (option.image) {
    return option.image.startsWith("http") || option.image.startsWith("data:")
      ? option.image
      : `${import.meta.env.BASE_URL}${option.image.replace(/^\//, "")}`;
  }
  return swatchDataUri(option.swatch ?? "#b9b4a7");
}

// True when the option is a flat colour tile (affects card styling).
export const isSwatch = (option: Option): boolean => !option.image;
