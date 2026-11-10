import { test } from "node:test";
import assert from "node:assert/strict";
import type { SourceResult, Status } from "@/lib/engine/types";
import { rankReports } from "@/lib/engine/verdict";
import {
  buildQuery,
  buildRequestBody,
  checkerProfiles,
  findTld,
  groupFeaturedTlds,
  groupOptional,
  groupStandard,
  hasAnySource,
  matchesProfile,
  parseSelection,
  previewNames,
  selectionSummary,
  type CheckerConfig,
  type SourceInfo,
} from "@/components/checker-config";
import { groupNotes, hiddenNoteLead, shortlistSummary } from "@/components/verdict-text";

function res(label: string, status: Status, note?: string): SourceResult {
  return { sourceId: label, namespace: "domains", label, target: label, status, ...(note ? { note } : {}) };
}

test("?q=foo%20bar ergibt einen Namen mit Leerzeichen (Browser-Suche)", () => {
  const config = {
    namespaces: [{ id: "domains" as const, label: "Domains" }],
    defaultNamespaces: ["domains" as const],
    tlds: ["de", "com"],
    defaultTlds: ["de"],
    featuredTlds: ["de", "com"],
    maxTlds: 10,
    maxNames: 50,
    sources: [],
  } as CheckerConfig;
  assert.deepEqual(parseSelection(new URLSearchParams("q=foo%20bar"), config).names, ["foo bar"]);
  assert.deepEqual(parseSelection(new URLSearchParams("q=wachwerk"), config).names, ["wachwerk"]);
  assert.deepEqual(parseSelection(new URLSearchParams("q=a,b"), config).names, ["a", "b"]);
});

test("selectionSummary nennt Namensräume, Endungen und Zusatzquellen in einer Zeile", () => {
  const config = {
    namespaces: [
      { id: "domains" as const, label: "Domains" },
      { id: "packages" as const, label: "Pakete" },
    ],
    sources: [],
  };
  assert.equal(
    selectionSummary({ namespaces: ["domains", "packages"], tlds: ["de", "com"], extra: [], excluded: [] }, config),
    "Domains, Pakete · .de .com",
  );
  assert.equal(
    selectionSummary({ namespaces: ["packages"], tlds: ["de"], extra: ["nuget", "pypi"], excluded: [] }, config),
    "Pakete · +2 weitere Quellen",
  );
  assert.equal(selectionSummary({ namespaces: [], tlds: [], extra: ["nuget"], excluded: [] }, config), "+1 weitere Quelle");
  assert.equal(selectionSummary({ namespaces: [], tlds: [], extra: [], excluded: [] }, config), "Keine Quelle gewählt");
});

const SEL_CONFIG: CheckerConfig = {
  namespaces: [{ id: "domains", label: "Domains" }],
  defaultNamespaces: ["domains"],
  tlds: ["de", "com", "dev", "app", "io", "shop", "academy"],
  featuredTlds: ["de", "com", "dev", "app", "io"],
  defaultTlds: ["de", "com", "dev", "app", "io"],
  maxTlds: 3,
  maxNames: 10,
  sources: [],
};

test("parseSelection akzeptiert eine nicht kuratierte Endung aus ?tld=", () => {
  const sel = parseSelection(new URLSearchParams("q=foo&tld=shop,.Academy,gibtsnicht,de,com"), SEL_CONFIG);
  assert.deepEqual(sel.tlds, ["shop", "academy", "de"], "unbekannte raus, Obergrenze (3) gilt");
  const only = parseSelection(new URLSearchParams("tld=gibtsnicht"), SEL_CONFIG);
  assert.deepEqual(only.tlds, SEL_CONFIG.defaultTlds, "nur Unbekanntes: Standard");
  assert.equal(
    buildQuery({ names: ["foo"], namespaces: ["domains"], tlds: ["shop", "de"], extra: [], excluded: [] }, SEL_CONFIG),
    "q=foo&tld=shop,de",
  );
});

test("groupFeaturedTlds gruppiert in Länder, Allgemein und Neue Endungen; findTld normalisiert", () => {
  const groups = groupFeaturedTlds(["de", "com", "dev", "shop", "at", "net"]);
  assert.deepEqual(groups, [
    { label: "Länder", tlds: ["de", "at"] },
    { label: "Allgemein", tlds: ["com", "net"] },
    { label: "Neue Endungen", tlds: ["dev", "shop"] },
  ]);
  assert.equal(findTld(" .Shop ", SEL_CONFIG.tlds), "shop");
  assert.equal(findTld("nope", SEL_CONFIG.tlds), undefined);
  assert.equal(findTld("", SEL_CONFIG.tlds), undefined);
});

test("groupOptional gruppiert nur wählbare Quellen und folgt der Reihenfolge der Namensräume", () => {
  const src = (id: string, namespace: SourceInfo["namespace"], defaultEnabled = false): SourceInfo => ({
    id,
    label: id,
    namespace,
    description: "",
    defaultEnabled,
  });
  const groups = groupOptional([
    src("wikipedia", "known_names"),
    src("npm", "packages", true),
    src("nuget", "packages"),
    src("pypi", "packages"),
    src("github", "social"),
  ]);
  assert.deepEqual(
    groups.map((g) => [g.ns, g.list.map((s) => s.id)]),
    [
      ["packages", ["nuget", "pypi"]],
      ["social", ["github"]],
      ["known_names", ["wikipedia"]],
    ],
  );
});

test("shortlistSummary kürzt lange Listen und behält die Statusunterscheidung", () => {
  const results = [".de", ".com", ".dev", ".app", ".io", ".net"].map((l) => res(l, "taken"));
  const [entry] = rankReports([{ name: "x", verdict: "red", results }]);
  assert.equal(shortlistSummary(entry), "vergeben: .de, .com, .dev, .app +2");
});

test("groupNotes blendet Hinweise zu „nicht gefunden“ aus, verliert aber keinen", () => {
  const rows = [
    res(".de", "not_found", "Bei der Registry nicht registriert."),
    res(".com", "not_found", "Bei der Registry nicht registriert."),
    res(".dev", "taken", "Bei der Registry registriert."),
    res(".app", "taken", "Bei der Registry registriert."),
    res(".io", "unknown", "RDAP ohne Antwort."),
  ];
  const n = groupNotes(rows);
  assert.deepEqual(n.shared, [{ status: "taken", note: "Bei der Registry registriert." }]);
  assert.deepEqual([...n.inline], [[".io", "RDAP ohne Antwort."]]);
  assert.deepEqual(n.hidden, [{ labels: [".de", ".com"], note: "Bei der Registry nicht registriert." }]);
  assert.equal(hiddenNoteLead(n.hidden[0], n.hidden.length), "Alle");

  const mixed = groupNotes([res("npm", "not_found", "a"), res("PyPI", "not_found", "b")]);
  assert.equal(hiddenNoteLead(mixed.hidden[0], mixed.hidden.length), "npm");
});

test("previewNames zeigt den geprüften Namen, den Ablehnungsgrund und Doppelte wie der Server", () => {
  assert.deepEqual(previewNames(""), []);
  assert.deepEqual(previewNames("wachwerk"), [{ input: "wachwerk", name: "wachwerk" }]);
  assert.deepEqual(previewNames("Wach Werk, Müller.de\nwachwerk"), [
    { input: "Wach Werk", name: "wachwerk" },
    { input: "Müller.de", name: "mueller" },
    { input: "wachwerk", name: "wachwerk", duplicate: true },
  ]);

  const [tooShort, dotted, hyphen] = previewNames("a, foo.bar.baz, -x-");
  for (const p of [tooShort, dotted, hyphen]) {
    assert.equal(p.name, null, p.input);
    assert.ok(p.error && p.error.length > 0, p.input);
    assert.equal(p.duplicate, undefined);
  }
  // Der Grund ist derselbe Text, den normalizeName (und damit /api/check) liefert.
  assert.match(tooShort.error ?? "", /mindestens 2 Zeichen/);
  assert.match(hyphen.error ?? "", /Bindestrich/);
});

const src = (id: string, namespace: SourceInfo["namespace"], defaultEnabled: boolean): SourceInfo => ({
  id,
  label: id,
  namespace,
  description: "",
  defaultEnabled,
});

/** Kleine Konfiguration mit Standard- und Zusatzquellen in zwei Namensräumen. */
const SRC_CONFIG: CheckerConfig = {
  namespaces: [
    { id: "domains", label: "Domains" },
    { id: "packages", label: "Pakete" },
    { id: "known_names", label: "Bekannte Namen" },
  ],
  defaultNamespaces: ["domains", "packages", "known_names"],
  tlds: ["de", "com", "dev"],
  featuredTlds: ["de", "com", "dev"],
  defaultTlds: ["de", "com"],
  maxTlds: 3,
  maxNames: 10,
  sources: [
    src("npm", "packages", true),
    src("pypi", "packages", true),
    src("github", "packages", true),
    src("pub", "packages", false),
    src("known_brands", "known_names", true),
    src("wikipedia", "known_names", false),
  ],
};

test("abgewählte Standardquellen: ?x= liest nur bekannte Standardquellen, der Link enthält sie nur, wenn welche abgewählt sind", () => {
  const sel = parseSelection(new URLSearchParams("q=foo&x=npm,gibtsnicht,pub,npm"), SRC_CONFIG);
  assert.deepEqual(sel.excluded, ["npm"], "unbekannte und Zusatzquellen fallen weg, Doppelte auch");
  assert.equal(buildQuery(sel, SRC_CONFIG), "q=foo&x=npm");
  const old = parseSelection(new URLSearchParams("q=foo&src=pub"), SRC_CONFIG);
  assert.deepEqual(old.excluded, [], "alte Links ohne x= wählen nichts ab");
  assert.equal(buildQuery(old, SRC_CONFIG), "q=foo&src=pub");
});

test("buildRequestBody: abgewählte Standardquellen fehlen in sources; ohne Abweichung bleibt die Anfrage wie bisher", () => {
  const base = { namespaces: SRC_CONFIG.defaultNamespaces, tlds: ["de"], extra: [], excluded: [] };
  assert.deepEqual(buildRequestBody("foo", base, SRC_CONFIG), {
    names: ["foo"],
    namespaces: ["domains", "packages", "known_names"],
    tlds: ["de"],
  });
  assert.deepEqual(buildRequestBody("foo", { ...base, extra: ["pub"] }, SRC_CONFIG).sources, [
    "npm",
    "pypi",
    "github",
    "known_brands",
    "pub",
  ]);
  assert.deepEqual(buildRequestBody("foo", { ...base, extra: ["pub"], excluded: ["npm", "pypi"] }, SRC_CONFIG).sources, [
    "github",
    "known_brands",
    "pub",
  ]);
  assert.deepEqual(buildRequestBody("foo", { ...base, excluded: ["github"] }, SRC_CONFIG).sources, [
    "npm",
    "pypi",
    "known_brands",
  ]);
  // Eine Abwahl in einem nicht gewählten Namensraum ändert nichts an der Anfrage.
  const narrow = { namespaces: ["domains" as const], tlds: ["de"], extra: [], excluded: ["npm"] };
  assert.equal(buildRequestBody("foo", narrow, SRC_CONFIG).sources, undefined);
});

test("hasAnySource und selectionSummary berücksichtigen abgewählte Standardquellen", () => {
  const allOff = { namespaces: ["packages" as const], tlds: [], extra: [], excluded: ["npm", "pypi", "github"] };
  assert.equal(hasAnySource(allOff, SRC_CONFIG), false);
  assert.equal(hasAnySource({ ...allOff, extra: ["pub"] }, SRC_CONFIG), true);
  assert.equal(hasAnySource({ ...allOff, namespaces: ["domains", "packages"] }, SRC_CONFIG), true);
  assert.equal(
    selectionSummary({ namespaces: ["packages", "known_names"], tlds: [], extra: [], excluded: ["npm"] }, SRC_CONFIG),
    "Pakete (2 von 3), Bekannte Namen",
  );
  assert.equal(selectionSummary(allOff, SRC_CONFIG), "Keine Quelle gewählt");
});

test("groupStandard listet je umschaltbarem Namensraum seine Standardquellen", () => {
  assert.deepEqual(
    groupStandard(SRC_CONFIG).map((g) => [g.ns, g.list.map((s) => s.id)]),
    [
      ["packages", ["npm", "pypi", "github"]],
      ["known_names", ["known_brands"]],
    ],
  );
});

test("checkerProfiles: Allgemein ist die Standardauswahl, ein Vorhaben wählt Standardquellen ab und Zusatzquellen an", () => {
  const profiles = checkerProfiles(SRC_CONFIG);
  const general = profiles.find((p) => p.id === "allgemein")!;
  assert.deepEqual(general, {
    id: "allgemein",
    label: "Allgemein",
    namespaces: ["domains", "packages", "known_names"],
    tlds: ["de", "com"],
    extra: [],
    excluded: [],
  });
  const dart = profiles.find((p) => p.id === "dart")!;
  assert.deepEqual(dart.namespaces, ["packages", "known_names"]);
  assert.deepEqual(dart.extra, ["pub"]);
  assert.deepEqual(dart.excluded, ["npm", "pypi"]);
  assert.deepEqual(buildRequestBody("foo", dart, SRC_CONFIG).sources, ["github", "known_brands", "pub"]);
  // Web-App: nur wählbare Endungen, höchstens maxTlds
  const web = profiles.find((p) => p.id === "web-app")!;
  assert.ok(web.tlds.every((t) => SRC_CONFIG.tlds.includes(t)) && web.tlds.length <= SRC_CONFIG.maxTlds);
});

test("matchesProfile: gleich, was abgefragt würde; jede Änderung von Hand hebt die Übereinstimmung auf", () => {
  const dart = checkerProfiles(SRC_CONFIG).find((p) => p.id === "dart")!;
  // Reihenfolge und wirkungslose Abwahl (Domains nicht gewählt, Endungen egal) zählen nicht
  assert.equal(matchesProfile({ ...dart, namespaces: ["known_names", "packages"], tlds: ["dev"] }, dart, SRC_CONFIG), true);
  assert.equal(matchesProfile({ ...dart, excluded: ["npm"] }, dart, SRC_CONFIG), false);
  assert.equal(matchesProfile({ ...dart, extra: [] }, dart, SRC_CONFIG), false);
  const general = checkerProfiles(SRC_CONFIG)[0];
  assert.equal(matchesProfile({ ...general, tlds: ["de"] }, general, SRC_CONFIG), false, "mit Domains zählen die Endungen");
});
