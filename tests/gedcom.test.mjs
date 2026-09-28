// GEDCOM import/export: preview, duplicates, nothing lost silently, idempotent re-import, round trip,
// clear refusals, and export that respects protected people.
import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./support/worker-fixture.mjs";
import { gedcomDate } from "../src/gedcom.mjs";

const SAMPLE = [
  "0 HEAD",
  "1 SOUR TestProgram",
  "1 GEDC",
  "2 VERS 5.5.1",
  "1 CHAR UTF-8",
  "0 @I1@ INDI",
  "1 NAME Ahmet /Sarıçiçek/",
  "1 BIRT",
  "2 DATE 12 MAR 1950",
  "2 PLAC Gaziantep",
  "1 OCCU Öğretmen",
  "1 FAMS @F1@",
  "0 @I2@ INDI",
  "1 NAME Şükriye /Sarıçiçek/",
  "1 BIRT",
  "2 DATE ABT 1952",
  "1 RESI",
  "2 PLAC İzmir",
  "1 NOTE @N1@",
  "1 FAMS @F1@",
  "0 @I3@ INDI",
  "1 NAME Deniz /Sarıçiçek/",
  "1 BIRT",
  "2 DATE 1 JAN 1980",
  "1 DEAT",
  "2 DATE 5 MAY 2020",
  "1 SOUR Nüfus kaydı",
  "2 PAGE s. 12",
  "1 FAMC @F1@",
  "0 @I4@ INDI",
  "1 NAME Ege /Sarıçiçek/",
  "1 FAMC @F1@",
  "2 PEDI adopted",
  "0 @F1@ FAM",
  "1 HUSB @I1@",
  "1 WIFE @I2@",
  "1 MARR",
  "2 DATE 20 JUN 1975",
  "1 CHIL @I3@",
  "1 CHIL @I4@",
  "1 CHIL @I9@",
  "0 @N1@ NOTE Uzun bir hikâye:",
  "1 CONT ikinci satır",
  "1 CONC  devamı",
  "0 @O1@ OBJE",
  "1 FILE foto.jpg",
  "0 @R1@ REPO",
  "1 NAME Arşiv",
  "0 TRLR",
].join("\n");

test("dates: only complete dates become tree dates", () => {
  assert.equal(gedcomDate("12 MAR 1950"), "1950-03-12");
  assert.equal(gedcomDate("1 jan 1980"), "1980-01-01");
  for (const partial of ["1950", "MAR 1950", "ABT 1952", "BET 1940 AND 1945", "31 FEB 1950"]) assert.equal(gedcomDate(partial), null, partial);
});

test("preview, import without silent loss, duplicates, idempotent re-import", async () => {
  const { db, call, member } = fixture();
  await call("/api/me");
  const existing = (await call("/api/people", "POST", { name: "Ahmet Sarıçiçek", birthDate: "1950-03-12" })).body.id;
  const before = JSON.stringify(db.prepare("SELECT * FROM people WHERE id=?").get(existing));
  const preview = await call("/api/archive/gedcom/preview", "POST", { text: SAMPLE });
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  const p = preview.body;
  assert.equal(p.people, 4);
  assert.deepEqual(p.skippedRecords, { OBJE: 1, REPO: 1 });
  assert.deepEqual(
    p.unsupported.map((x) => x.tag),
    ["OCCU", "RESI"],
  );
  assert.ok(p.warnings.some((w) => w.includes("ABT 1952")));
  assert.ok(p.warnings.some((w) => w.includes("@I9@")));
  const ahmet = p.items.find((x) => x.ref === "@I1@");
  assert.deepEqual(ahmet.matches, [{ id: existing, name: "Ahmet Sarıçiçek", birthDate: "1950-03-12", exact: true }]);

  const member1 = await member("uye@test.invalid");
  assert.equal((await call("/api/archive/gedcom/preview", "POST", { text: SAMPLE }, member1.email)).status, 403);

  const imported = await call("/api/archive/gedcom/import", "POST", { text: SAMPLE, decisions: {} });
  assert.equal(imported.status, 200, JSON.stringify(imported.body));
  assert.equal(imported.body.createdPeople, 3, "Ahmet is linked to the existing record, not duplicated");
  assert.equal(imported.body.createdRelations, 1 + 2 * 2, "spouse + two parents for each of two children");
  const byName = Object.fromEntries(
    db
      .prepare("SELECT * FROM people WHERE deletedAt IS NULL")
      .all()
      .map((x) => [x.name, x]),
  );
  assert.equal(Object.keys(byName).length, 4);
  assert.match(byName["Şükriye Sarıçiçek"].biography, /Uzun bir hikâye:\nikinci satır devamı[\s\S]*GEDCOM'dan:\nDoğum tarihi: ABT 1952\nİkamet: İzmir/);
  assert.equal(byName["Deniz Sarıçiçek"].deathDate, "2020-05-05");
  assert.equal(byName["Deniz Sarıçiçek"].source, "Nüfus kaydı, s. 12");
  const types = db
    .prepare("SELECT type,COUNT(*) n FROM relations GROUP BY type ORDER BY type")
    .all()
    .map((r) => [r.type, r.n]);
  assert.deepEqual(types, [
    ["adoptive", 2],
    ["parent", 2],
    ["spouse", 1],
  ]);
  // The existing person's record is left exactly as it was.
  assert.equal(JSON.stringify(db.prepare("SELECT * FROM people WHERE id=?").get(existing)), before);

  // Importing the same file again adds nothing.
  const again = await call("/api/archive/gedcom/import", "POST", { text: SAMPLE, decisions: {} });
  assert.equal(again.body.createdPeople, 0);
  assert.equal(again.body.createdRelations, 0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM people WHERE deletedAt IS NULL").get().n, 4);

  // "skip" leaves a person (and their links) out.
  const { call: call2, db: db2 } = fixture();
  await call2("/api/me");
  const partial = await call2("/api/archive/gedcom/import", "POST", { text: SAMPLE, decisions: { "@I4@": "skip" } });
  assert.equal(partial.body.createdPeople, 3);
  assert.equal(db2.prepare("SELECT COUNT(*) n FROM relations").get().n, 3);
});

test("export and re-import keep people, dates and links; protected people stay out of others' exports", async () => {
  const { db, call, member } = fixture();
  await call("/api/me");
  await call("/api/archive/gedcom/import", "POST", { text: SAMPLE, decisions: {} });
  const exported = await call("/api/archive/gedcom/export");
  assert.equal(exported.status, 200);
  const text = new TextDecoder().decode(exported.body);
  assert.match(text, /^0 HEAD\r\n[\s\S]*1 CHAR UTF-8[\s\S]*0 TRLR\r\n$/);
  assert.match(text, /1 NAME Ahmet \/Sarıçiçek\/\r\n1 BIRT\r\n2 DATE 12 MAR 1950\r\n2 PLAC Gaziantep/);
  assert.match(text, /2 PEDI adopted/);

  const fresh = fixture();
  await fresh.call("/api/me");
  const back = await fresh.call("/api/archive/gedcom/import", "POST", { text, decisions: {} });
  assert.equal(back.status, 200, JSON.stringify(back.body));
  const names = (d) =>
    d
      .prepare("SELECT name,birthDate,deathDate FROM people ORDER BY name")
      .all()
      .map((x) => JSON.stringify(x));
  assert.deepEqual(names(fresh.db), names(db));
  const rel = (d) => d.prepare("SELECT type,COUNT(*) n FROM relations GROUP BY type ORDER BY type").all();
  assert.deepEqual(rel(fresh.db), rel(db));

  // A person under guardianship is left out of another member's export.
  const guarded = db.prepare("SELECT id FROM people WHERE name='Ege Sarıçiçek'").get().id;
  const guardian = await member("veli@test.invalid"),
    other = await member("diger@test.invalid");
  db.prepare("INSERT INTO person_guardians(personId,userId) VALUES(?,?)").run(guarded, guardian.id);
  const othersText = new TextDecoder().decode((await call("/api/archive/gedcom/export", "GET", null, other.email)).body);
  assert.ok(!othersText.includes("Ege"), "protected person not exported to others");
  assert.ok(new TextDecoder().decode((await call("/api/archive/gedcom/export", "GET", null, guardian.email)).body).includes("Ege"));
});

test("clear refusals for files that cannot be read correctly", async () => {
  const { call } = fixture();
  await call("/api/me");
  const refuse = async (text, pattern) => {
    const r = await call("/api/archive/gedcom/preview", "POST", { text });
    assert.equal(r.status, 400, text.slice(0, 40));
    assert.match(r.body.error, pattern);
  };
  await refuse("0 HEAD\n1 CHAR ANSEL\n0 TRLR", /ANSEL.*UTF-8/);
  await refuse("0 @I1@ INDI\n1 NAME A /B/\n0 TRLR", /HEAD/);
  await refuse("0 HEAD\n1 CHAR UTF-8\nbu bir satır değil\n0 TRLR", /3\. satır/);
  await refuse("0 HEAD\n2 CHAR UTF-8", /seviye/);
  await refuse("", /boş/);
});
