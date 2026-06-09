// Per-view PNG capture. Designed to be dead simple and predictable:
// - SVG views (plan, elevation) are serialized and rasterized at 2x device pixels.
// - The 3D canvas (Three.js) is read directly via toBlob.
// Output is a PNG file downloaded to the user's browser.

function safeFilename(name: string): string {
  return (name || "Untitled").replace(/[^a-z0-9\-_ ]/gi, "_");
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/**
 * Capture an <svg> element to PNG. Rasterizes at 2x for crisp lines, fills the
 * background white (SVGs default to transparent — looks wrong for plans).
 */
export async function captureSvgToPng(svg: SVGSVGElement, filename: string): Promise<void> {
  const rect = svg.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width || svg.clientWidth));
  const h = Math.max(1, Math.round(rect.height || svg.clientHeight));
  // Clone so we can safely add an explicit width/height for the rasterizer
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("width", String(w));
  clone.setAttribute("height", String(h));
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const svgString = new XMLSerializer().serializeToString(clone);
  const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);

  await new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = w * scale;
      canvas.height = h * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not get 2D context"));
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(svgUrl);
      canvas.toBlob((b) => {
        if (!b) {
          reject(new Error("Capture failed"));
          return;
        }
        downloadBlob(b, filename);
        resolve();
      }, "image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(svgUrl);
      reject(new Error("SVG rasterization failed"));
    };
    img.src = svgUrl;
  });
}

/**
 * Capture an HTMLCanvasElement (the Three.js WebGL canvas) to PNG.
 * Requires the renderer to be created with preserveDrawingBuffer:true,
 * otherwise the canvas is cleared by the time we read it.
 */
export function captureCanvasToPng(canvas: HTMLCanvasElement, filename: string): void {
  canvas.toBlob((b) => {
    if (!b) return;
    downloadBlob(b, filename);
  }, "image/png");
}

export function buildCaptureFilename(projectName: string, view: string): string {
  return `JMRC-${safeFilename(projectName)}-${view}.png`;
}
