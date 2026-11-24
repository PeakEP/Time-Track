#!/usr/bin/env python3
"""Slice Triangle Kitchen brochure pages into per-option images for the intake app.

Reproduces triangle-intake/public/triangle/ from the Triangle brochures. Needs
poppler (pdftoppm) + ImageMagick (convert/montage). Inputs are the brochure
pages pre-rendered to PNG at 150 dpi into PAGES as doors-NN.png / paint-N.png /
hood-N.png, e.g.:

    pdftoppm -png -r 150 tk-door_stylesoptions_brochure-fa.pdf $PAGES/doors
    pdftoppm -png -r 150 tk_paintstainoptions_flyer-sept-2026_0.pdf $PAGES/paint
    pdftoppm -png -r 150 tk-range-hood-brochure.pdf $PAGES/hood

Then: PAGES=<dir> OUT=<app>/public/triangle python slice_brochures.py
Colour finishes (stain/paint/TFL/thermo) are NOT sliced — the app renders them
as named swatches from gen_catalog.py. The grid geometry below is tuned to the
Sept-2026 brochures; re-check the montages in CALIB if the brochures change.
"""
import os, re, subprocess, json, sys

PAGES = os.environ.get("PAGES", "pages")
OUT = os.environ.get("OUT", os.path.join(os.path.dirname(__file__), "..", "public", "triangle"))
CALIB = os.environ.get("CALIB", "calib")
os.makedirs(CALIB, exist_ok=True)

def slug(s):
    s = s.lower().replace("&", "and")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s

def crop(src, box, out, trim=False, pad=0, maxpx=300, fmt="jpg", quality=82, bg="white"):
    w,h,x,y = box
    cmd = ["convert", src, "-crop", f"{w}x{h}+{x}+{y}", "+repage"]
    if trim:
        cmd += ["-bordercolor", bg, "-border", "6", "-fuzz", "14%", "-trim", "+repage"]
    if pad:
        cmd += ["-bordercolor", bg, "-border", f"{pad}x{pad}"]
    cmd += ["-resize", f"{maxpx}x{maxpx}>"]
    if fmt == "jpg":
        cmd += ["-background", bg, "-flatten", "-quality", str(quality)]
    cmd += [out]
    subprocess.run(cmd, check=True)

def montage(files, out, tile, geom="150x215+3+3"):
    subprocess.run(["montage"] + files + ["-tile", tile, "-geometry", geom,
                    "-background", "#888", out], check=True)

manifest = {}

def grid(page, names, x0, xp, w, y0, yp, h, cols, subdir, prefix, trim=False, fmt="jpg", maxpx=300, verify=None):
    src = f"{PAGES}/{page}.png"
    outdir = f"{OUT}/{subdir}"
    os.makedirs(outdir, exist_ok=True)
    made = []
    for i, name in enumerate(names):
        r, c = divmod(i, cols)
        x = int(round(x0 + c*xp)); y = int(round(y0 + r*yp))
        fn = f"{prefix}-{slug(name)}.{fmt}"
        out = f"{outdir}/{fn}"
        crop(src, (w, h, x, y), out, trim=trim, pad=(8 if trim else 0), maxpx=maxpx, fmt=fmt)
        manifest[f"{prefix}:{name}"] = f"triangle/{subdir}/{fn}"
        made.append(out)
    if verify:
        montage(made, f"{CALIB}/{verify}", f"{cols}x{(len(names)+cols-1)//cols}",
                geom=("150x215+3+3" if not trim else "170x210+3+3"))
    return made

# ---------- 5-piece solid wood ----------
P4 = ["Shaker","Kedgwick","Hanwell","Shaker Light","Shaker Round","Shaker Soft",
      "Shaker Chamfer","Shaker Step","Shaker Step Bevel","Shaker Dome","Bar Harbour","Charlottetown",
      "Simply Shaker","Simply Beveled","Simply Pillow","Simply Step","Plymouth","Regency",
      "Timeless","Portage","Torino","Bellmont","Exeter Recessed","Classic"]
grid("doors-04", P4, 120, 173.0, 150, 268, 306, 215, 6, "doors", "fp", verify="v_p4.png")

P5 = ["Classic Soft","Royal","Dartmouth","Natik","Chatham Recessed","Duxbury Recessed",
      "Duxbury Raised","Middletown Recessed","Middletown Raised","Cambridge Recessed","Cambridge Raised","Newport Recessed",
      "Newport Raised","Dome","Roman","Concord","Queen Anne","Princess"]
grid("doors-05", P5, 120, 173.0, 150, 268, 306, 215, 6, "doors", "fp", verify="v_p5.png")

# ---------- 1-piece MDF ----------
P6 = ["Shaker MDF","Shaker Beveled MDF","Shaker Light MDF","Shaker Round MDF","Shaker Soft MDF","Shaker Step MDF",
      "Shaker Step Bevel MDF","Simply Beveled MDF","Simply Pillow MDF","Simply Shaker MDF","Simply Slim Shaker MDF","Simply Step MDF",
      "Plymouth MDF","Bellmont MDF","Pleasant Hill MDF","Portage MDF","Torino MDF","Fancy Beveled MDF",
      "Queen Anne Amherst MDF","Queen Anne Round MDF","Roman Amherst MDF","Roman Round MDF","Royal Amherst MDF","Royal Round MDF"]
grid("doors-06", P6, 120, 173.0, 150, 268, 306, 215, 6, "doors", "mdf", verify="v_p6.png")

# ---------- Slab (top row of page 7) ----------
P7 = ["Metro","Nova Solid Wood","Nova MDF","Linate MDF","Nantucket MDF","Heritage MDF"]
grid("doors-07", P7, 120, 173.0, 150, 270, 306, 215, 6, "doors", "slab", verify="v_p7.png")

# ---------- Thermo doors (page 8) ----------
P8 = ["Euro","Belfast","Dublin","Nanaimo","Shaker 5 piece","Shaker Beveled 5 piece",
      "Paris","Porto","Elysa","British","British Arch","British Cathedral",
      "Scandinavian","Scandinavian Arch","Scandinavian Cathedral","Manhattan","Manhattan Arch","Manhattan Cathedral"]
grid("doors-08", P8, 120, 173.0, 150, 268, 306, 215, 6, "doors", "thermo", verify="v_p8.png")

# ---------- Mullion styles (page 10, first 2 rows = 12 core) ----------
P10 = ["Frame Only","4 Lites","6 Lites","8 Lites","Deluxe Mullion","2 Lites Horizontal",
       "3 Lites Horizontal","2 Lites Vertical","3 Lites Vertical","X-Mullion","Deluxe X-Mullion","Fancy Mullion"]
grid("doors-10", P10, 118, 173.0, 150, 180, 320, 290, 6, "details", "mullion", trim=True, fmt="png", maxpx=260, verify="v_p10.png")

# ---------- Glass styles (page 11, 5-col) ----------
P11 = ["Clear","Mirror","Smoked","Delta","Frosted","Reeded","Gothic"]
grid("doors-11", P11, 118, 224.0, 165, 325, 223, 160, 5, "details", "glass", trim=True, fmt="jpg", maxpx=240, verify="v_p11.png")

# ---------- Range hood series (first/standard variant per series) ----------
# box = (w,h,x,y) generous; trimmed to the line drawing.
HOODS = [
    ("hood-2", "Bedford",    (240, 175, 310, 205)),
    ("hood-2", "Bristal",    (240, 175, 310, 430)),
    ("hood-2", "Cambridge",  (230, 185, 320, 655)),
    ("hood-2", "Eastland",   (240, 180, 310, 895)),
    ("hood-2", "Elegance",   (240, 185, 310, 1135)),
    ("hood-2", "Elevation",  (240, 165, 310, 1380)),
    ("hood-3", "Fanfare",    (240, 175, 300, 190)),
    ("hood-3", "Georgetown", (230, 200, 310, 415)),
    ("hood-3", "Plymouth",   (240, 180, 310, 655)),
    ("hood-3", "Springfield",(240, 175, 310, 885)),
    ("hood-3", "Thompson",   (230, 195, 320, 1120)),
    ("hood-3", "Zenith",     (240, 175, 310, 1400)),
]
os.makedirs(f"{OUT}/hoods", exist_ok=True)
hood_made = []
for page, name, (w, h, x, y) in HOODS:
    fn = f"hood-{slug(name)}.png"
    out = f"{OUT}/hoods/{fn}"
    crop(f"{PAGES}/{page}.png", (w, h, x, y), out, trim=True, pad=8, maxpx=300, fmt="png")
    manifest[f"hood:{name}"] = f"triangle/hoods/{fn}"
    hood_made.append(out)
montage(hood_made, f"{CALIB}/v_hoods.png", "6x2", geom="180x150+3+3")

with open(f"{CALIB}/manifest.json", "w") as f:
    json.dump(manifest, f, indent=1)
print("sliced", len(manifest), "images")
