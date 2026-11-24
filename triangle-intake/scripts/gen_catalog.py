#!/usr/bin/env python3
"""Generate triangle-catalog.json for the Triangle Kitchen intake app.

The catalog is an ordered list of wizard STEPS. Each step is one screen. A step
(or an individual option) can declare `showIf` to appear only when an earlier
step holds a matching selection — that is what 'spoon-feeds' the designer path
(e.g. the stain palette only appears for a stained solid-wood door, filtered to
the chosen species). Image paths point at files sliced from the Triangle
brochures (see scratchpad/slice.py); colours render as named swatches.
"""
import json, re, os

# Output resolves next to the app's public/ by default; override with CATALOG_OUT.
OUT = os.environ.get(
    "CATALOG_OUT",
    os.path.join(os.path.dirname(__file__), "..", "public", "triangle-catalog.json"),
)

def slug(s):
    s = s.lower().replace("&", "and")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")

def door_img(prefix, name):
    ext = "jpg"
    return f"triangle/doors/{prefix}-{slug(name)}.{ext}"

OUT = os.path.normpath(OUT)

# ---- species ----
SPECIES = [
    ("C",  "Cherry",          "#b5653f", "Pink/pale-brown hues, deepens richly with age."),
    ("M",  "Maple",           "#e3c59a", "Smooth, uniform hardwood; takes darker stains evenly."),
    ("O",  "Oak",             "#d6b280", "Open, prominent grain with a sweeping arch pattern."),
    ("P",  "Pine",            "#e8d3a7", "Knotty softwood; warm, rustic farmhouse character."),
    ("W",  "Walnut",          "#6b4a33", "Rich, dark, 'expensive' look with wavy grain."),
    ("WO", "White Oak Rift",  "#cdb690", "Straight, linear rift-cut grain; clean & contemporary."),
]

# ---- 5-piece solid wood door styles + species codes ----
FP = [
    ("Shaker","CMOPWWO"),("Kedgwick","CMOPWWO"),("Hanwell","CMOP"),("Shaker Light","CMOPWWO"),
    ("Shaker Round","CMOPWWO"),("Shaker Soft","CMOPWWO"),("Shaker Chamfer","CMOPWWO"),("Shaker Step","CMOPWWO"),
    ("Shaker Step Bevel","CMOPWWO"),("Shaker Dome","CMOP"),("Bar Harbour","M"),("Charlottetown","CMOPWWO"),
    ("Simply Shaker","CMOPWWO"),("Simply Beveled","CMOPWWO"),("Simply Pillow","CMOPWWO"),("Simply Step","CMOPWWO"),
    ("Plymouth","CMOPWWO"),("Regency","CMOP"),("Timeless","CMOPWWO"),("Portage","CMOPWWO"),
    ("Torino","CMOPWWO"),("Bellmont","CMOPWWO"),("Exeter Recessed","CMO"),("Classic","CMOP"),
    ("Classic Soft","CMOPWWO"),("Royal","CMOP"),("Dartmouth","CMOPWWO"),("Natik","CMOPWWO"),
    ("Chatham Recessed","CMO"),("Duxbury Recessed","CMOP"),("Duxbury Raised","CMOP"),("Middletown Recessed","CMOPWWO"),
    ("Middletown Raised","CMOPWWO"),("Cambridge Recessed","CMOPWWO"),("Cambridge Raised","CMOPWWO"),("Newport Recessed","CMOPW"),
    ("Newport Raised","CMOPW"),("Dome","CMOP"),("Roman","CMOP"),("Concord","CMOP"),
    ("Queen Anne","CMOP"),("Princess","CMOP"),
]

def split_codes(s):
    # "CMOPWWO" -> ['C','M','O','P','W','WO']
    out, i = [], 0
    while i < len(s):
        if s[i:i+2] == "WO":
            out.append("WO"); i += 2
        else:
            out.append(s[i]); i += 1
    return out

MDF = ["Shaker MDF","Shaker Beveled MDF","Shaker Light MDF","Shaker Round MDF","Shaker Soft MDF","Shaker Step MDF",
    "Shaker Step Bevel MDF","Simply Beveled MDF","Simply Pillow MDF","Simply Shaker MDF","Simply Slim Shaker MDF","Simply Step MDF",
    "Plymouth MDF","Bellmont MDF","Pleasant Hill MDF","Portage MDF","Torino MDF","Fancy Beveled MDF",
    "Queen Anne Amherst MDF","Queen Anne Round MDF","Roman Amherst MDF","Roman Round MDF","Royal Amherst MDF","Royal Round MDF"]

# slab: (name, kind) kind=solid|mdf
SLAB = [("Metro","solid"),("Nova Solid Wood","solid"),("Nova MDF","mdf"),
        ("Linate MDF","mdf"),("Nantucket MDF","mdf"),("Heritage MDF","mdf")]

THERMO = ["Euro","Belfast","Dublin","Nanaimo","Shaker 5 piece","Shaker Beveled 5 piece",
    "Paris","Porto","Elysa","British","British Arch","British Cathedral",
    "Scandinavian","Scandinavian Arch","Scandinavian Cathedral","Manhattan","Manhattan Arch","Manhattan Cathedral"]

# ---- finishes (colour swatches) ----
# stains: name -> (hex, species-codes available)
STAINS = {
    "Natural": ("#d8b689","CMOPWWO"), "Light Stain": ("#cfa670","CMWO...W"),
    "Wheat": ("#dcc08a","M"), "Cinnamon": ("#a7673d","MC"),
    "Venetian Gold": ("#b07b3e","OMCP"), "Paprika": ("#9c4a2a","OMCP"),
    "Antique": ("#8a6a46","OC"), "Praline": ("#7f5433","OM"),
    "Caramel": ("#95572c","OM"), "Scandinavian": ("#c79b63","O WO".replace(" ","")),
    "Biscotti": ("#c3a277","OM"), "Driftwood": ("#9a8f80","OMWWO"),
    "Harbour Mist": ("#8d8378","OM"), "River Rock": ("#6f6b66","OMW"),
    "Heritage Brown": ("#5a3f2b","OM"), "Sterling": ("#7c7670","OM"),
    "Beluga": ("#3b3330","OMW"), "Spiced Cider": ("#8a4f2c","OMC"),
    "Cappuccino": ("#5e4636","OMCP"), "Chestnut Brown": ("#5b3a24","OM"),
    "Coffee Bean": ("#3a2a20","OM"),
}
# normalize species strings (some had typos above) -> rebuild cleanly
STAIN_SPECIES = {
    "Natural":"CMOPWWO","Light Stain":"CMW","Wheat":"M","Cinnamon":"CM",
    "Venetian Gold":"CMOP","Paprika":"CMOP","Antique":"CO","Praline":"MO",
    "Caramel":"MO","Scandinavian":"O WO".replace(" ",""),"Biscotti":"MO",
    "Driftwood":"MOW WO".replace(" ",""),"Harbour Mist":"MO","River Rock":"MOW",
    "Heritage Brown":"MO","Sterling":"MO","Beluga":"MOW","Spiced Cider":"CMO",
    "Cappuccino":"CMOP","Chestnut Brown":"MO","Coffee Bean":"MO",
}
STAIN_HEX = {k: v[0] for k, v in STAINS.items()}
STAIN_ORDER = ["Natural","Light Stain","Wheat","Cinnamon","Venetian Gold","Paprika","Antique",
    "Praline","Caramel","Scandinavian","Biscotti","Driftwood","Harbour Mist","River Rock",
    "Heritage Brown","Sterling","Beluga","Spiced Cider","Cappuccino","Chestnut Brown","Coffee Bean"]

PAINTS = [("Winter White","#f2efe6"),("Cloud White","#eceae0"),("Soft Cream","#ece3cf"),("Silver Satin","#e7e3da"),
    ("Biscuit","#e6dcc6"),("Silver Strand","#c9c6bd"),("Collingwood","#d6cfc4"),("Cottage Green","#8f9b86"),
    ("Evergreen Fog","#95948a"),("Laurel Green","#a7ad93"),("Green Smoke","#93a08f"),("Summerville","#cfc3ac"),
    ("Denim","#4e6079"),("Neptune","#7d93a1"),("Weathered Barn","#6f6a5f"),("Fossil","#c9c3b6"),
    ("Dolphin Grey","#8f8f8c"),("Metropolis Grey","#7a7c7e"),("Urban Grey","#6d6e6b"),("Juniper Haze","#8a9a96"),
    ("Hale Navy","#434a54"),("Inkwell Blue","#3f4a57"),("Charcoal","#40403f"),("Black","#222222")]

GLAZE = [("Espresso","#4a382a"),("Classic Brown","#5b4330"),("Dark Chocolate","#3c2c20"),
         ("Soap Stone","#6f6f6a"),("Black","#1b1b1b")]

TFL = [
    ("White","#f6f6f3","Solid"),("Matt White","#f1f1ee","Solid"),("Folkstone","#d8d9d4","Solid"),
    ("Summer Drops","#cfcabb","Solid"),("Morning Dew","#d8d2c6","Solid"),("Ashen","#8c8372","Solid"),
    ("Mysterious Blue","#2f3a42","Solid"),("Orion Grey","#3b3b3b","Solid"),
    ("Snow White","#f4f4f1","Supermatt"),("Ice Grey","#c9ccce","Supermatt"),("Timeless Grey","#8a8f92","Supermatt"),
    ("Dolphin Grey","#3e4346","Supermatt"),("Sahara Cream","#d8cebb","Supermatt"),("Pearl Black","#121212","Supermatt"),
    ("Woodgrain","#caa36a","Wood & Fabric"),("Linen","#c9c7bd","Wood & Fabric"),("Weekend Getaway","#cfc9bd","Wood & Fabric"),
    ("Cast at First Light","#cbb084","Wood & Fabric"),("Après-Ski","#7a5a3f","Wood & Fabric"),("Tea for Two","#8a5a30","Wood & Fabric"),
    ("Winter Fun","#e6e2d7","Wood & Fabric"),("Sunset Cruise","#6b5848","Wood & Fabric"),("Sugar on Ice","#5a4030","Wood & Fabric"),
    ("Sunday Brunch","#4b3a2c","Wood & Fabric"),("After Hours","#3a332c","Wood & Fabric"),
    ("High Gloss White","#f2f2f0","High Gloss"),("Artic Grey","#9a9a98","High Gloss"),("Fog","#8f8f8d","High Gloss"),
    ("Fumé","#3f4245","High Gloss"),("Magnolia","#e9e2d2","High Gloss"),("New Black","#111111","High Gloss"),
]

THERMO_COLORS = [("White Deco Velvet","#f4f2ec"),("Cotton Mist","#efeee7"),("Summer Drops","#d7d8d3"),
    ("Morning Dew","#cdc6b9"),("Dusk","#4f5559"),("Black Velvet","#1c1c1c"),("Fossil","#6f6a60"),
    ("Celadon Green","#9aa894"),("Winter Fun","#e7e3d6"),("Sunset Cruise","#6b5848"),("Après-Ski","#7a5a3f"),
    ("Sunday Brunch","#4b3a2c")]

HOODS = [("Bedford","BD-Series"),("Bristal","BX-Series"),("Cambridge","C-Series"),("Eastland","E3-Series"),
    ("Elegance","E2-Series"),("Elevation","E-Series"),("Fanfare","FX2-Series"),("Georgetown","G-Series"),
    ("Plymouth","P-Series"),("Springfield","S-Series"),("Thompson","T-Series"),("Zenith","Z200-Series")]

GLASS = ["Clear","Mirror","Smoked","Delta","Frosted","Reeded","Gothic"]
MULLION = ["Frame Only","4 Lites","6 Lites","8 Lites","Deluxe Mullion","2 Lites Horizontal",
    "3 Lites Horizontal","2 Lites Vertical","3 Lites Vertical","X-Mullion","Deluxe X-Mullion","Fancy Mullion"]

# ---------------- build steps ----------------
def opt(id, name, **kw):
    o = {"id": id, "name": name}
    o.update({k: v for k, v in kw.items() if v is not None})
    return o

steps = []

steps.append({
    "id": "project", "nav": "Project", "name": "Project details", "kind": "info",
    "subtitle": "Who the kitchen is for and the basics the designer needs to start the layout.",
})

# Door construction
steps.append({
    "id": "construction", "nav": "Construction", "name": "Door construction",
    "kind": "choose",
    "subtitle": "Start here — this decides which door styles, species and finishes you'll choose from next.",
    "help": "Triangle is a frameless (full-access) cabinet line. The construction type drives everything downstream.",
    "options": [
        opt("fivepiece", "5-Piece Solid Wood", note="Framed solid-wood door — choose a species and a stain or paint. The most traditional look.", swatch="#d8b689"),
        opt("mdf", "1-Piece MDF (Paint)", note="Smooth one-piece MDF door, painted only. Crisp, no wood grain, very stable.", swatch="#ece9e0"),
        opt("slab", "Slab (Flat)", note="Flat slab door in solid wood or MDF. Clean, contemporary.", swatch="#e3cfa9"),
        opt("tfl", "TFL — Urban", note="Textured laminate on a panel — durable, low-maintenance; colour is chosen directly.", swatch="#8c8372"),
        opt("thermo", "Thermofoil", note="Vacuum-formed polymer over MDF — seamless, wipeable; choose a profile and colour.", swatch="#cdc6b9"),
    ],
})

# Door style — solid/mdf/slab/thermo each a grid, gated by construction
fp_opts = [opt(f"style-{slug(n)}", n, image=door_img("fp", n), species=split_codes(c)) for n, c in FP]
steps.append({
    "id": "style-fivepiece", "nav": "Door style", "name": "Door style — 5-Piece Solid Wood",
    "kind": "choose", "fit": "contain", "showIf": {"step": "construction", "in": ["fivepiece"]},
    "subtitle": "Pick the door profile. The letters under the brochure name are the species it's offered in.",
    "options": fp_opts,
})
mdf_opts = [opt(f"style-{slug(n)}", n.replace(" MDF", ""), image=door_img("mdf", n)) for n in MDF]
steps.append({
    "id": "style-mdf", "nav": "Door style", "name": "Door style — 1-Piece MDF",
    "kind": "choose", "fit": "contain", "showIf": {"step": "construction", "in": ["mdf"]},
    "subtitle": "One-piece MDF doors. Painted finish only.",
    "options": mdf_opts,
})
slab_opts = [opt(f"style-{slug(n)}", n, image=door_img("slab", n), kind=k) for n, k in SLAB]
steps.append({
    "id": "style-slab", "nav": "Door style", "name": "Door style — Slab",
    "kind": "choose", "fit": "contain", "showIf": {"step": "construction", "in": ["slab"]},
    "subtitle": "Metro and Nova Solid Wood take a species + stain/paint; the MDF slabs are painted only.",
    "options": slab_opts,
})
thermo_opts = [opt(f"style-{slug(n)}", n, image=door_img("thermo", n)) for n in THERMO]
steps.append({
    "id": "style-thermo", "nav": "Door style", "name": "Door style — Thermofoil",
    "kind": "choose", "fit": "contain", "showIf": {"step": "construction", "in": ["thermo"]},
    "subtitle": "Thermofoil door profile. You'll pick a thermo colour next.",
    "options": thermo_opts,
})

# Species (solid-wood paths)
steps.append({
    "id": "species", "nav": "Species", "name": "Wood species",
    "kind": "choose", "showIf": {"step": "construction", "in": ["fivepiece", "slab"]},
    "subtitle": "The wood the door is built from. (Slab: solid-wood Metro/Nova only.)",
    "help": "Each species carries its own stain palette, shown on the next step.",
    "options": [opt(f"sp-{slug(nm)}", nm, swatch=hx, note=desc, code=code) for code, nm, hx, desc in SPECIES],
})

# Finish type
steps.append({
    "id": "finish-type", "nav": "Finish", "name": "Finish type",
    "kind": "choose", "showIf": {"step": "construction", "in": ["fivepiece", "mdf", "slab"]},
    "subtitle": "How the door is coloured. Stains show the wood grain; paints give a smooth solid colour.",
    "options": [
        opt("stained", "Stained", note="Enhances the natural grain. Solid-wood doors only.", swatch="#95572c",
            showIf={"step": "construction", "in": ["fivepiece", "slab"]}),
        opt("painted", "Painted", note="Smooth, consistent solid colour. Any species or MDF.", swatch="#eceae0"),
        opt("glazed", "Glazed", note="Hand-applied glaze over paint for depth and a softened, aged look.", swatch="#6f6f6a",
            showIf={"step": "construction", "in": ["fivepiece", "mdf", "slab"]}),
        opt("accented-glaze", "Accented Glaze", note="Glaze plus hand-accenting in the grooves — heirloom look.", swatch="#4a382a",
            showIf={"step": "construction", "in": ["fivepiece", "mdf", "slab"]}),
        opt("rub-through", "Rub-Through", note="Distressed, time-worn painted look. Most labour-intensive.", swatch="#8a7a66",
            showIf={"step": "construction", "in": ["fivepiece", "slab"]}),
        opt("custom-match", "Custom Colour Match", note="Match a paint chip or stained sample. A physical sample is required for approval.", swatch="#c9b79a"),
    ],
})

# Stain colour — filtered by species
stain_opts = []
for nm in STAIN_ORDER:
    codes = split_codes(STAIN_SPECIES[nm])
    stain_opts.append(opt(f"stain-{slug(nm)}", nm, swatch=STAIN_HEX[nm], species=codes))
steps.append({
    "id": "stain-colour", "nav": "Stain", "name": "Stain colour",
    "kind": "choose", "speciesFilter": True, "showIf": {"step": "finish-type", "in": ["stained"]},
    "subtitle": "Stain palette for the species you chose. Final colour must be confirmed from a physical door sample.",
    "options": stain_opts,
})

# Paint colour
steps.append({
    "id": "paint-colour", "nav": "Paint", "name": "Paint colour",
    "kind": "choose", "showIf": {"step": "finish-type", "in": ["painted", "glazed", "accented-glaze", "rub-through"]},
    "subtitle": "Designer paint palette. Any colour can also be custom-matched.",
    "options": [opt(f"paint-{slug(n)}", n, swatch=hx) for n, hx in PAINTS],
})

# Glaze colour
steps.append({
    "id": "glaze-colour", "nav": "Glaze", "name": "Glaze colour",
    "kind": "choose", "showIf": {"step": "finish-type", "in": ["glazed", "accented-glaze", "rub-through"]},
    "subtitle": "Glaze strength, light to dark.",
    "options": [opt(f"glaze-{slug(n)}", n, swatch=hx) for n, hx in GLAZE],
})

# TFL colour
steps.append({
    "id": "tfl-colour", "nav": "TFL colour", "name": "TFL — Urban colour",
    "kind": "choose", "showIf": {"step": "construction", "in": ["tfl"]},
    "subtitle": "The TFL colour is the door — grouped by finish family.",
    "options": [opt(f"tfl-{slug(n)}", n, swatch=hx, group=g) for n, hx, g in TFL],
})

# Thermo colour
steps.append({
    "id": "thermo-colour", "nav": "Thermo colour", "name": "Thermofoil colour",
    "kind": "choose", "showIf": {"step": "construction", "in": ["thermo"]},
    "subtitle": "Thermofoil colour palette.",
    "options": [opt(f"thermo-{slug(n)}", n, swatch=hx) for n, hx in THERMO_COLORS],
})

# Box / carcass
steps.append({
    "id": "box", "nav": "Box material", "name": "Box / carcass material",
    "kind": "choose",
    "subtitle": "What the cabinet boxes are built from. 5/8\" furniture board is standard.",
    "options": [
        opt("box-furniture", "5/8\" Furniture Board (Standard)", swatch="#d9d2c4", note="Triangle's standard carcass. Durable, cost-effective."),
        opt("box-particle", "Particle Board", swatch="#cabfa6", note="Economical core option."),
        opt("box-plywood", "Plywood", swatch="#d8c29a", note="Upgrade — lighter, screws/joints hold well, moisture-tolerant."),
        opt("box-tfl", "TFL Interior", swatch="#e9e6df", note="Textured-laminate interior; many interior colours (M01–M67)."),
    ],
})

# Drawer system
steps.append({
    "id": "drawer", "nav": "Drawers", "name": "Drawer system",
    "kind": "choose",
    "subtitle": "Triangle GG28 drawer options. Soft-close is included on all three.",
    "help": "Tell the designer which to quote — the glide and box differ.",
    "options": [
        opt("drawer-metabox", "Metabox", swatch="#b9bcc0", note="Single-extension steel box, soft-close included. Base level — no upcharge."),
        opt("drawer-melamine", "Melamine", swatch="#e6e2d8", note="5/8\" board box, soft-close. Single or full extension; White, Woodgrain or Orion Grey interior."),
        opt("drawer-dovetail", "Dovetail", swatch="#c89a5f", note="Hardwood, full-extension, soft-close. Optional Tip-On Blumotion (Movento, 88 lb)."),
    ],
})

# Edge profile (optional)
steps.append({
    "id": "edge", "nav": "Edge", "name": "Edge profile",
    "kind": "choose", "optional": True,
    "subtitle": "Optional outer-edge detail on the door. Leave blank for the standard square edge. Availability varies by door — the designer confirms.",
    "options": [opt(f"edge-{n}", f"Profile {n}", swatch="#d8c7a8") for n in [1,2,3,4,5,6,7,8,10,11]],
})

# Construction joint (optional)
steps.append({
    "id": "joint", "nav": "Joint", "name": "Construction joint",
    "kind": "choose", "optional": True,
    "subtitle": "A construction joint conceals the hairline cracks that solid wood naturally forms at the rail/stile joints. Recommended on painted solid wood.",
    "options": [
        opt("joint-none", "None (standard)", swatch="#e4ddcd"),
        opt("joint-u", "Type U", swatch="#d9cdb4"),
        opt("joint-v", "Type V", swatch="#cdbf9f"),
    ],
})

# Glass doors (optional multi) + mullion
steps.append({
    "id": "glass", "nav": "Glass", "name": "Glass doors",
    "kind": "choose", "multi": True, "optional": True, "fit": "cover",
    "subtitle": "Optional — pick any glass styles you'd like on feature doors. Skip if none.",
    "options": [opt(f"glass-{slug(n)}", n, image=f"triangle/details/glass-{slug(n)}.jpg") for n in GLASS],
})
steps.append({
    "id": "mullion", "nav": "Mullion", "name": "Mullion style",
    "kind": "choose", "optional": True, "fit": "contain",
    "showIf": {"step": "glass", "in": [f"glass-{slug(n)}" for n in GLASS]},
    "subtitle": "The muntin/mullion layout for your glass doors.",
    "options": [opt(f"mullion-{slug(n)}", n, image=f"triangle/details/mullion-{slug(n)}.png") for n in MULLION],
})

# Detailing extras (multi, optional)
steps.append({
    "id": "detailing", "nav": "Detailing", "name": "Detailing & trim",
    "kind": "choose", "multi": True, "optional": True,
    "subtitle": "Tick anything the customer wants. The designer works out exact parts.",
    "options": [opt(f"det-{slug(n)}", n, swatch="#d8cdb6", note=d) for n, d in [
        ("Matching finished ends", "Exposed cabinet ends finished to match the doors."),
        ("Crown moulding", "Crown/cornice at the top of wall cabinets."),
        ("Light rail / valance", "Trim under wall cabinets to hide under-cabinet lighting."),
        ("Decorative toe kick", "Furniture-style or decorative toe kick instead of standard."),
        ("Corbels / brackets", "Decorative supports (e.g. under a hood or counter overhang)."),
        ("Furniture legs / feet", "Turned or square legs for a furniture look."),
        ("Open shelving", "Open shelves in place of some wall cabinets."),
        ("Plate rack", "Built-in plate display."),
        ("Wine rack", "Built-in wine storage."),
        ("Interior finished to match", "Cabinet interiors finished to match the door, not standard white."),
    ]],
})

# Ventilation
steps.append({
    "id": "ventilation", "nav": "Ventilation", "name": "Ventilation above the range",
    "kind": "choose",
    "subtitle": "Pick ONE. Note: an over-the-range microwave is NOT a Triangle wood range hood.",
    "help": "A wood range hood is a decorative Triangle hood; an OTR microwave has a cabinet built above the microwave instead.",
    "options": [
        opt("vent-otr", "OTR Microwave", swatch="#cfd2d4", note="Over-the-range microwave with a cabinet built above it. NOT a wood range hood."),
        opt("vent-hood", "Wood Range Hood (Triangle)", swatch="#e7e1d2", note="Decorative Triangle wood hood — choose a series next."),
        opt("vent-other", "Other Vent (by others)", swatch="#c6c6c4", note="Chimney/insert/downdraft hood supplied by others."),
        opt("vent-none", "None / By others", swatch="#e4e2dc", note="No ventilation in the Triangle scope."),
    ],
})

# Hood series (showIf wood range hood)
steps.append({
    "id": "hood-series", "nav": "Hood series", "name": "Wood range hood series",
    "kind": "choose", "fit": "contain", "showIf": {"step": "ventilation", "in": ["vent-hood"]},
    "subtitle": "Representative shape per series. Base options (standard / hardwood / panel base, beading) and size are confirmed with the designer.",
    "options": [opt(f"hood-{slug(nm)}", f"{nm}", image=f"triangle/hoods/hood-{slug(nm)}.png", note=series) for nm, series in HOODS],
})
# Hood ventilator liner (showIf wood range hood)
steps.append({
    "id": "hood-liner", "nav": "Hood liner", "name": "Hood ventilator liner",
    "kind": "choose", "optional": True, "showIf": {"step": "ventilation", "in": ["vent-hood"]},
    "subtitle": "Insert ventilator for the wood hood (dimmable LED, variable-speed, dishwasher-safe filters).",
    "options": [
        opt("liner-baffle", "Baffle Liner Ventilator", swatch="#c9c9c9"),
        opt("liner-mesh", "Mesh Liner Ventilator", swatch="#bdb09a"),
        opt("liner-none", "No liner / by others", swatch="#e4e2dc"),
    ],
})

# Accessories (multi optional)
steps.append({
    "id": "accessories", "nav": "Accessories", "name": "Interior accessories",
    "kind": "choose", "multi": True, "optional": True,
    "subtitle": "Pull-outs and organizers to quote. Door hinges are soft-close as standard.",
    "help": "Cabinet hardware (handles/pulls), countertops and flooring are supplied separately — not Triangle.",
    "options": [opt(f"acc-{slug(n)}", n, swatch="#d7d2c4") for n in [
        "Pull-out waste / recycle", "Cutlery divider", "Spice pull-out", "Tray dividers",
        "Lazy Susan / corner solution", "Roll-out trays", "Under-cabinet lighting prep",
        "Appliance garage", "Pantry pull-out", "Knife block", "Cutting board", "Drawer peg system",
    ]],
})

# Notes
steps.append({
    "id": "notes", "nav": "Notes", "name": "Notes & special requests",
    "kind": "info",
    "subtitle": "Anything else the designer should know — layout quirks, must-haves, inspiration, deadlines.",
})

# Review
steps.append({
    "id": "review", "nav": "Review & hand off", "name": "Review & hand off to the designer",
    "kind": "review",
    "subtitle": "Check the summary, flag anything to confirm, then export the PDF for the designer.",
})

catalog = {
    "_meta": {
        "line": "Triangle Kitchen",
        "company": "Robins Interiors & Design",
        "designer_default": "Susan Parlee",
        "note": "Intake / selection form. No pricing — a hand-off for the designer to build the cabinet layout. Colours shown as named swatches; confirm exact species, door style and finish from a physical Triangle sample before ordering. Hardware, countertops and flooring are supplied separately. Bathroom vanities are usually Oppein, not Triangle.",
    },
    "steps": steps,
}

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w") as f:
    json.dump(catalog, f, indent=1, ensure_ascii=False)

nopt = sum(len(s.get("options", [])) for s in steps)
print(f"wrote {OUT}: {len(steps)} steps, {nopt} options")
