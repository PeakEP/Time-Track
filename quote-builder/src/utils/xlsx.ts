import JSZip from "jszip";

// Minimal .xlsx reader (enough for the JMRC master catalog workbook): sheet
// names → rows of cell values. Shared strings, inline strings and numbers.
export async function readXlsx(data: ArrayBuffer): Promise<Record<string, (string | number | null)[][]>> {
  const zip = await JSZip.loadAsync(data);
  const parse = (xml: string) => new DOMParser().parseFromString(xml, "application/xml");
  const text = async (path: string) => (await zip.file(path)?.async("string")) || "";

  const shared: string[] = [];
  const ss = await text("xl/sharedStrings.xml");
  if (ss) for (const si of Array.from(parse(ss).getElementsByTagName("si")))
    shared.push(Array.from(si.getElementsByTagName("t")).map((t) => t.textContent || "").join(""));

  const wb = parse(await text("xl/workbook.xml"));
  const rels = parse(await text("xl/_rels/workbook.xml.rels"));
  const target = new Map(Array.from(rels.getElementsByTagName("Relationship")).map((r) => [r.getAttribute("Id"), r.getAttribute("Target") || ""]));
  const out: Record<string, (string | number | null)[][]> = {};
  for (const sh of Array.from(wb.getElementsByTagName("sheet"))) {
    const rid = sh.getAttribute("r:id") || sh.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
    let t = target.get(rid) || "";
    t = t.startsWith("/") ? t.slice(1) : `xl/${t.replace(/^\.\//, "")}`;
    const doc = parse(await text(t));
    const rows: (string | number | null)[][] = [];
    for (const row of Array.from(doc.getElementsByTagName("row"))) {
      const r: (string | number | null)[] = [];
      for (const c of Array.from(row.getElementsByTagName("c"))) {
        const ref = c.getAttribute("r") || "";
        const col = ref.replace(/\d+/g, "").split("").reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;
        const type = c.getAttribute("t");
        const v = c.getElementsByTagName("v")[0]?.textContent ?? null;
        let val: string | number | null = v;
        if (type === "s" && v != null) val = shared[Number(v)] ?? "";
        else if (type === "inlineStr") val = Array.from(c.getElementsByTagName("t")).map((x) => x.textContent || "").join("");
        else if (type !== "str" && type !== "b" && v != null && v !== "" && !isNaN(Number(v))) val = Number(v);
        while (r.length < col) r.push(null);
        r[col] = val;
      }
      rows.push(r);
    }
    out[sh.getAttribute("name") || t] = rows;
  }
  return out;
}
