// GEDCOM 5.5.1 import and export for the family tree (both runtimes).
// Import is two steps: a preview (what will be added, possible duplicates, anything that cannot be
// represented) and the import itself, which re-reads the file on the server and applies the member's
// decisions. Nothing is dropped silently: facts the tree has no field for, partial dates and notes are
// written into the person's biography under "GEDCOM'dan", and whole records that cannot be attached
// (sources, repositories, media) are counted in the report.
import { assert, clean, personInput } from "./domain.mjs";
import { hiddenPeople } from "./privacy.mjs";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
export const LIMITS = { bytes: 10 * 1024 * 1024, people: 20000 };
const LABELS = {
  OCCU: "Meslek",
  RESI: "İkamet",
  EDUC: "Eğitim",
  RELI: "Din",
  TITL: "Unvan",
  NATI: "Milliyet",
  BAPM: "Vaftiz",
  CHR: "Vaftiz",
  BURI: "Defin",
  CREM: "Yakılma",
  EMIG: "Göç (çıkış)",
  IMMI: "Göç (varış)",
  NATU: "Vatandaşlık",
  EVEN: "Olay",
  FACT: "Bilgi",
  SEX: "Cinsiyet",
  GRAD: "Mezuniyet",
  RETI: "Emeklilik",
  MILI: "Askerlik",
  CENS: "Nüfus sayımı",
  ADOP: "Evlat edinme",
  DIV: "Boşanma",
  ENGA: "Nişan",
  OBJE: "Görsel/dosya bağlantısı",
  _UID: "Kimlik",
  UID: "Kimlik",
};

/** Lines -> tree of {tag, xref, value, children}. Throws a clear error for anything malformed. */
export function parseGedcom(text) {
  const source = String(text || "");
  assert(source.length > 0, 400, "GEDCOM dosyası boş.");
  assert(source.length <= LIMITS.bytes, 413, "GEDCOM dosyası en fazla 10 MB olabilir.");
  const lines = source.replace(/^\uFEFF/, "").split(/\r\n|\r|\n/);
  const root = { children: [] },
    stack = [root],
    warnings = [];
  lines.forEach((raw, i) => {
    const line = raw.trimStart();
    if (!line.trim()) return;
    const m = line.match(/^(\d{1,2})\s+(?:(@[^@\s]+@)\s+)?([A-Za-z0-9_]+)(?:\s(.*))?$/);
    assert(m, 400, `GEDCOM ${i + 1}. satır okunamadı: "${line.slice(0, 60)}"`);
    const level = Number(m[1]);
    assert(level <= stack.length - 1, 400, `GEDCOM ${i + 1}. satırda seviye atlanmış.`);
    const node = { tag: m[3].toUpperCase(), xref: m[2] || null, value: m[4] ?? "", children: [], line: i + 1 };
    stack.length = level + 1;
    if (node.tag === "CONT" || node.tag === "CONC") {
      const parent = stack[level];
      assert(parent && parent !== root, 400, `GEDCOM ${i + 1}. satırda devam satırı yerinde değil.`);
      parent.value += (node.tag === "CONT" ? "\n" : "") + node.value;
      return;
    }
    stack[level].children.push(node);
    stack.push(node);
  });
  const head = root.children.find((n) => n.tag === "HEAD");
  assert(head, 400, "Geçerli bir GEDCOM dosyası değil: HEAD kaydı yok.");
  const charset = (head.children.find((n) => n.tag === "CHAR")?.value || "UTF-8").toUpperCase();
  assert(
    ["UTF-8", "UTF8", "ASCII", "UNICODE"].includes(charset),
    400,
    `Dosyanın karakter kodlaması (${charset}) desteklenmiyor. Aile ağacı programınızdan UTF-8 olarak dışa aktarın; aksi hâlde Türkçe harfler bozulur.`,
  );
  if (!root.children.some((n) => n.tag === "TRLR")) warnings.push("Dosya TRLR satırıyla bitmiyor; eksik olabilir.");
  return { records: root.children, warnings };
}

const child = (node, tag) => node.children.find((c) => c.tag === tag);
const children = (node, tag) => node.children.filter((c) => c.tag === tag);

/** "12 MAR 1950" -> "1950-03-12"; anything less exact returns null (the original text is kept elsewhere). */
export function gedcomDate(value) {
  const m = String(value || "")
    .trim()
    .toUpperCase()
    .match(/^(\d{1,2}) ([A-Z]{3}) (\d{4})$/);
  if (!m || !MONTHS.includes(m[2])) return null;
  const iso = `${m[3]}-${String(MONTHS.indexOf(m[2]) + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return !isNaN(Date.parse(iso)) && new Date(iso).toISOString().slice(0, 10) === iso ? iso : null;
}
export const toGedcomDate = (iso) => {
  const [y, m, d] = String(iso).split("-");
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
};
const personName = (value) =>
  clean(
    String(value || "")
      .replace(/\//g, " ")
      .replace(/\s+/g, " "),
    120,
  );
const folded = (s) =>
  String(s || "")
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i")
    .replace(/\s+/g, " ")
    .trim();

/** GEDCOM records -> people and relations the tree can hold, plus everything that could not be mapped. */
export function mapGedcom(records) {
  const notes = new Map(records.filter((r) => r.tag === "NOTE" && r.xref).map((r) => [r.xref, r.value]));
  const people = [],
    relations = [],
    warnings = [],
    unsupported = new Map(),
    skippedRecords = {};
  const note = (tag, label, text) => {
    const u = unsupported.get(tag) || { tag, label, count: 0, examples: [] };
    u.count++;
    if (u.examples.length < 3 && text) u.examples.push(text.slice(0, 80));
    unsupported.set(tag, u);
  };
  for (const r of records.filter((x) => x.tag === "INDI")) {
    const extra = [];
    const nameNode = child(r, "NAME");
    const name =
      personName(nameNode?.value) ||
      [child(nameNode || { children: [] }, "GIVN")?.value, child(nameNode || { children: [] }, "SURN")?.value].filter(Boolean).join(" ");
    const event = (tag, label) => {
      const e = child(r, tag);
      if (!e) return { date: null, place: "" };
      const raw = child(e, "DATE")?.value || "",
        date = gedcomDate(raw);
      if (raw && !date) {
        extra.push(`${label} tarihi: ${raw}`);
        warnings.push(`${name || r.xref}: "${raw}" tam bir tarih değil; nota yazıldı.`);
      }
      return { date, place: clean(child(e, "PLAC")?.value || "", 200) };
    };
    const birth = event("BIRT", "Doğum"),
      death = event("DEAT", "Vefat");
    const bio = [];
    for (const n of children(r, "NOTE")) bio.push(notes.get(n.value) ?? n.value);
    const sources = children(r, "SOUR").map(
      (s) => (s.value.startsWith("@") ? `Kaynak ${s.value}` : s.value) + (child(s, "PAGE") ? ", " + child(s, "PAGE").value : ""),
    );
    if (death.place) extra.push("Vefat yeri: " + death.place);
    const known = new Set(["NAME", "BIRT", "DEAT", "NOTE", "SOUR", "FAMC", "FAMS", "CHAN", "RIN", "NICK"]);
    for (const n of r.children) {
      if (known.has(n.tag)) continue;
      const label = LABELS[n.tag] || n.tag;
      const detail = [n.value, child(n, "DATE")?.value, child(n, "PLAC")?.value, child(n, "TYPE")?.value].filter(Boolean).join(", ");
      extra.push(`${label}: ${detail || "(değer yok)"}`);
      note(n.tag, label, detail);
    }
    if (children(r, "NAME").length > 1)
      extra.push(
        "Diğer adlar: " +
          children(r, "NAME")
            .slice(1)
            .map((n) => personName(n.value))
            .join("; "),
      );
    const biography = [...bio, extra.length ? "GEDCOM'dan:\n" + extra.join("\n") : ""].filter(Boolean).join("\n\n");
    people.push({
      ref: r.xref,
      name: name || "(adsız)",
      nickname: clean(child(r, "NICK")?.value || child(nameNode || { children: [] }, "NICK")?.value || "", 100),
      birthDate: birth.date,
      deathDate: death.date,
      birthPlace: birth.place,
      biography: clean(biography, 5000),
      source: clean(sources.join("; "), 1000),
      carried: extra.length,
    });
    if (!name) warnings.push(`${r.xref}: kişinin adı yok; "(adsız)" olarak eklenecek.`);
  }
  const refs = new Set(people.map((p) => p.ref));
  for (const f of records.filter((x) => x.tag === "FAM")) {
    const husband = child(f, "HUSB")?.value,
      wife = child(f, "WIFE")?.value;
    const parents = [husband, wife].filter((x) => x && refs.has(x));
    for (const x of [husband, wife]) if (x && !refs.has(x)) warnings.push(`${f.xref}: ${x} kişisi dosyada yok; bağlantı atlandı.`);
    if (parents.length === 2)
      relations.push({ a: parents[0], b: parents[1], type: "spouse", date: gedcomDate(child(child(f, "MARR") || { children: [] }, "DATE")?.value) });
    for (const c of children(f, "CHIL")) {
      if (!refs.has(c.value)) {
        warnings.push(`${f.xref}: çocuk ${c.value} dosyada yok; bağlantı atlandı.`);
        continue;
      }
      // Adoption is marked on the child's FAMC link (PEDI adopted).
      const childRecord = records.find((x) => x.xref === c.value);
      const famc = childRecord && children(childRecord, "FAMC").find((x) => x.value === f.xref);
      const adopted = /adopted/i.test(child(famc || { children: [] }, "PEDI")?.value || "");
      for (const p of parents) relations.push({ a: p, b: c.value, type: adopted ? "adoptive" : "parent", date: null });
    }
    for (const n of f.children)
      if (!["HUSB", "WIFE", "CHIL", "MARR", "CHAN", "RIN"].includes(n.tag)) note("FAM." + n.tag, "Aile kaydı: " + (LABELS[n.tag] || n.tag), n.value);
  }
  for (const r of records) if (!["HEAD", "TRLR", "INDI", "FAM", "NOTE", "SUBM"].includes(r.tag)) skippedRecords[r.tag] = (skippedRecords[r.tag] || 0) + 1;
  assert(people.length <= LIMITS.people, 413, `Bir seferde en fazla ${LIMITS.people} kişi aktarılabilir.`);
  return { people, relations, warnings, unsupported: [...unsupported.values()], skippedRecords };
}

/** Existing people that probably are the same person: same name and, when both are known, same birth year. */
function duplicates(people, existing) {
  const byName = new Map();
  for (const e of existing) byName.set(folded(e.name), [...(byName.get(folded(e.name)) || []), e]);
  const seenInFile = new Map();
  return people.map((p) => {
    const same = (byName.get(folded(p.name)) || []).filter((e) => !p.birthDate || !e.birthDate || e.birthDate.slice(0, 4) === p.birthDate.slice(0, 4));
    const key = folded(p.name) + "|" + (p.birthDate || "");
    const twin = seenInFile.get(key);
    seenInFile.set(key, twin || p.ref);
    return {
      ref: p.ref,
      // "exact": same name and the same birth date (both empty counts), and no other candidate.
      matches: same.map((e) => ({
        id: e.id,
        name: e.name,
        birthDate: e.birthDate || null,
        exact: same.length === 1 && (e.birthDate || null) === (p.birthDate || null),
      })),
      twinInFile: twin || null,
    };
  });
}

export async function gedcom({ path, method, u, read, all, one, batch }) {
  const reply = (x, status = 200) =>
    new Response(JSON.stringify(x), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
  if (path === "/api/archive/gedcom/export" && method === "GET") {
    const hidden = await hiddenPeople(all, u);
    const people = (await all("SELECT * FROM people WHERE deletedAt IS NULL ORDER BY createdAt")).filter((p) => !hidden.has(p.id));
    const ids = new Map(people.map((p, i) => [p.id, `@I${i + 1}@`]));
    const links = (await all("SELECT * FROM relations")).filter((r) => ids.has(r.personA) && ids.has(r.personB));
    const text = (v) =>
      String(v || "")
        .split("\n")
        .map((l, i) => (i ? "2 CONT " : "") + l)
        .join("\n");
    const out = ["0 HEAD", "1 SOUR SARICICEK", "2 NAME Sarıçiçek Konağı", "1 GEDC", "2 VERS 5.5.1", "2 FORM LINEAGE-LINKED", "1 CHAR UTF-8"];
    // Families: one per spouse pair, plus one per single parent with children.
    const families = new Map(),
      family = (a, b) => {
        const key = [a, b].filter(Boolean).sort().join("+");
        if (!families.has(key))
          families.set(key, { id: `@F${families.size + 1}@`, parents: [a, b].filter(Boolean), children: [], adopted: new Set(), date: null });
        return families.get(key);
      };
    for (const r of links.filter((x) => x.type === "spouse")) family(r.personA, r.personB).date = r.date;
    const parentsOf = new Map();
    for (const r of links.filter((x) => x.type !== "spouse")) parentsOf.set(r.personB, [...(parentsOf.get(r.personB) || []), r]);
    for (const [childId, rels] of parentsOf) {
      const ps = rels.map((r) => r.personA).slice(0, 2);
      const f = family(ps[0], ps[1]);
      f.children.push(childId);
      if (rels.some((r) => r.type === "adoptive")) f.adopted.add(childId);
    }
    for (const p of people) {
      const [given, ...rest] = p.name.split(" ");
      out.push(`0 ${ids.get(p.id)} INDI`, `1 NAME ${rest.length ? given + " /" + rest.join(" ") + "/" : given}`);
      if (p.nickname) out.push("1 NICK " + p.nickname);
      if (p.birthDate || p.birthPlace) {
        out.push("1 BIRT");
        if (p.birthDate) out.push("2 DATE " + toGedcomDate(p.birthDate));
        if (p.birthPlace) out.push("2 PLAC " + p.birthPlace);
      }
      if (p.deathDate) out.push("1 DEAT", "2 DATE " + toGedcomDate(p.deathDate));
      if (p.place || p.country) out.push("1 RESI", "2 PLAC " + [p.place, p.country].filter(Boolean).join(", "));
      if (p.biography) out.push("1 NOTE " + text(p.biography));
      if (p.source) out.push("1 SOUR " + text(p.source));
      for (const f of families.values()) {
        if (f.children.includes(p.id)) out.push("1 FAMC " + f.id, ...(f.adopted.has(p.id) ? ["2 PEDI adopted"] : []));
        if (f.parents.includes(p.id)) out.push("1 FAMS " + f.id);
      }
    }
    for (const f of families.values()) {
      out.push(`0 ${f.id} FAM`);
      f.parents.forEach((pid, i) => out.push(`1 ${i ? "WIFE" : "HUSB"} ${ids.get(pid)}`));
      if (f.date) out.push("1 MARR", "2 DATE " + toGedcomDate(f.date));
      for (const c of f.children) out.push("1 CHIL " + ids.get(c));
    }
    out.push("0 TRLR");
    return new Response(out.join("\r\n") + "\r\n", {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="saricicek-soyagaci-${new Date().toISOString().slice(0, 10)}.ged"`,
        "Cache-Control": "private, no-store",
      },
    });
  }
  const preview = path === "/api/archive/gedcom/preview" && method === "POST",
    run = path === "/api/archive/gedcom/import" && method === "POST";
  if (!preview && !run) return null;
  assert(u.role !== "member", 403, "GEDCOM aktarımı aile yöneticisi ve moderatörlere açık.");
  const b = await read(LIMITS.bytes * 1.2);
  const parsed = parseGedcom(b.text);
  const mapped = mapGedcom(parsed.records);
  const existing = await all("SELECT id,name,birthDate FROM people WHERE deletedAt IS NULL");
  const dups = duplicates(mapped.people, existing);
  const summary = {
    people: mapped.people.length,
    relations: mapped.relations.length,
    warnings: [...parsed.warnings, ...mapped.warnings].slice(0, 200),
    warningCount: parsed.warnings.length + mapped.warnings.length,
    unsupported: mapped.unsupported,
    skippedRecords: mapped.skippedRecords,
    carried: mapped.people.filter((p) => p.carried).length,
  };
  if (preview)
    return reply({
      ...summary,
      items: mapped.people
        .slice(0, 2000)
        .map((p, i) => ({ ref: p.ref, name: p.name, birthDate: p.birthDate, deathDate: p.deathDate, carried: p.carried, ...dups[i] })),
    });

  // Import. Decisions per person ref: "new", "skip" or "link:<existing id>". Default: a person with an
  // exact match (same name and birth date) is linked to it; everyone else is added.
  const decisions = b.decisions && typeof b.decisions === "object" ? b.decisions : {};
  const existingIds = new Set(existing.map((e) => e.id));
  const target = new Map(),
    inserts = [],
    now = new Date().toISOString();
  mapped.people.forEach((p, i) => {
    const exact = dups[i].matches.find((m) => m.exact);
    const choice = String(decisions[p.ref] || (exact ? "link:" + exact.id : dups[i].twinInFile ? "link-file:" + dups[i].twinInFile : "new"));
    if (choice === "skip") return;
    if (choice.startsWith("link:")) {
      const id = choice.slice(5);
      assert(existingIds.has(id), 400, "Eşleştirilen kişi bulunamadı: " + p.name);
      target.set(p.ref, id);
      return;
    }
    if (choice.startsWith("link-file:") && target.has(choice.slice(10))) {
      target.set(p.ref, target.get(choice.slice(10)));
      return;
    }
    let person;
    try {
      person = personInput({ ...p, name: p.name.length >= 2 ? p.name : "(adsız)" });
    } catch (e) {
      // Invalid or future dates: import the person without them and say so in the biography.
      person = personInput({
        ...p,
        name: p.name.length >= 2 ? p.name : "(adsız)",
        birthDate: null,
        deathDate: null,
        biography: clean([p.biography, `GEDCOM'dan: tarihler geçersizdi (${p.birthDate || "-"} / ${p.deathDate || "-"}).`].filter(Boolean).join("\n\n"), 5000),
      });
      summary.warnings.push(`${p.name}: ${e.message} Tarihler nota yazıldı.`);
    }
    const id = crypto.randomUUID();
    target.set(p.ref, id);
    inserts.push([
      "INSERT INTO people(id,name,nickname,birthPlace,birthDate,deathDate,place,country,biography,source,createdBy,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
      id,
      person.name,
      person.nickname,
      person.birthPlace,
      person.birthDate,
      person.deathDate,
      person.place,
      person.country,
      person.biography,
      person.source,
      u.id,
      now,
      now,
    ]);
  });
  // Relations: skip ones that already exist or would make a person their own ancestor.
  const links = (await all("SELECT personA,personB,type FROM relations")).map((r) => ({ ...r }));
  const ancestors = (id) => {
    const seen = new Set(),
      queue = [id];
    while (queue.length) {
      const current = queue.pop();
      for (const r of links)
        if (r.type !== "spouse" && r.personB === current && !seen.has(r.personA)) {
          seen.add(r.personA);
          queue.push(r.personA);
        }
    }
    return seen;
  };
  let added = 0,
    skipped = 0;
  for (const r of mapped.relations) {
    const a = target.get(r.a),
      c = target.get(r.b);
    if (!a || !c || a === c) {
      skipped++;
      continue;
    }
    const dup = links.some((x) => x.type === r.type && ((x.personA === a && x.personB === c) || (r.type === "spouse" && x.personA === c && x.personB === a)));
    if (dup || (r.type !== "spouse" && ancestors(a).has(c))) {
      skipped++;
      continue;
    }
    links.push({ personA: a, personB: c, type: r.type });
    inserts.push(["INSERT INTO relations(id,personA,personB,type,date) VALUES(?,?,?,?,?)", crypto.randomUUID(), a, c, r.type, r.date]);
    added++;
  }
  if (skipped) summary.warnings.push(`${skipped} bağlantı zaten vardı, eksik kişiye bağlıydı ya da döngü oluşturacaktı; eklenmedi.`);
  inserts.push(["INSERT INTO audit(userId,action,entityId,createdAt) VALUES(?,?,?,?)", u.id, "GEDCOM içe aktarıldı", "", now]);
  await batch(inserts); // one transaction: a failure leaves the tree as it was
  const createdPeople = inserts.filter((x) => x[0].startsWith("INSERT INTO people")).length;
  return reply({ ...summary, createdPeople, linkedPeople: target.size - createdPeople, createdRelations: added, skippedRelations: skipped });
}
