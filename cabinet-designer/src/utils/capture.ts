// Per-view PNG capture. Designed to be reliable across the SVG-based views
// (plan, elevation) and the Three.js WebGL canvas (3D).
//
// Lessons learned from the first cut that silently did nothing:
// 1) Blob-URL → <img> rasterization fails opaquely if the SVG has any quirk
//    (missing namespace, oversized viewport, external font reference, …);
//    a base64 data URL is more forgiving.
// 2) Three.js canvas requires gl.preserveDrawingBuffer=true upstream, otherwise
//    toBlob hands back a blank/null image. Done at the <Canvas> level.
// 3) When something does fail, surface it to the user with an alert so they
//    can tell us what broke instead of clicking a dead button.

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

// Browser-safe base64 of a UTF-8 string (btoa alone fails on non-ASCII).
function utf8ToBase64(s: string): string {
  // encodeURIComponent + unescape is the well-known browser idiom.
  return btoa(unescape(encodeURIComponent(s)));
}

// Hard cap on output dimensions so a giant kitchen plan doesn't blow out the
// canvas (some browsers reject > ~16k px on a single axis).
const MAX_DIM = 4096;

export async function captureSvgToPng(svg: SVGSVGElement, filename: string): Promise<void> {
  try {
    // Determine intrinsic dimensions. Prefer the SVG's own width/height
    // attributes; fall back to bounding box if those aren't set.
    let w = parseFloat(svg.getAttribute("width") || "") || 0;
    let h = parseFloat(svg.getAttribute("height") || "") || 0;
    if (!w || !h) {
      const rect = svg.getBoundingClientRect();
      w = rect.width || svg.clientWidth || 800;
      h = rect.height || svg.clientHeight || 600;
    }
    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));

    // Clone so we can stamp explicit attributes without affecting the live SVG.
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
    clone.setAttribute("width", String(w));
    clone.setAttribute("height", String(h));
    if (!clone.getAttribute("viewBox")) {
      clone.setAttribute("viewBox", `0 0 ${w} ${h}`);
    }

    const svgString =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      new XMLSerializer().serializeToString(clone);
    // Base64 data URL — more reliable than blob URL across browsers for SVG→<img>.
    const dataUrl = "data:image/svg+xml;base64," + utf8ToBase64(svgString);

    const img = await loadImage(dataUrl);

    // Scale up for crispness, but stay under MAX_DIM on the long axis.
    let scale = 2;
    const longest = Math.max(w, h) * scale;
    if (longest > MAX_DIM) scale = MAX_DIM / Math.max(w, h);

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable in this browser");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob = await canvasToBlob(canvas, "image/png");
    downloadBlob(blob, filename);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[capture] SVG → PNG failed:", err);
    alert("Capture failed: " + msg);
  }
}

export function captureCanvasToPng(canvas: HTMLCanvasElement, filename: string): void {
  try {
    canvas.toBlob((b) => {
      if (!b) {
        console.error("[capture] Canvas → PNG returned null blob (preserveDrawingBuffer set?)");
        alert(
          "Capture failed: the 3D canvas returned no image. Try clicking once on the 3D view first, then capture.",
        );
        return;
      }
      downloadBlob(b, filename);
    }, "image/png");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[capture] Canvas → PNG threw:", err);
    alert("Capture failed: " + msg);
  }
}

export function buildCaptureFilename(projectName: string, view: string): string {
  return `JMRC-${safeFilename(projectName)}-${view}.png`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(
        new Error(
          "Browser couldn't rasterize the SVG. This can happen if the view is very large or has unsupported elements.",
        ),
      );
    img.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error("Canvas produced no image data."));
    }, type);
  });
}
