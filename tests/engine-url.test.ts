import { test } from "node:test";
import assert from "node:assert/strict";
import { safeHttpUrl } from "@/lib/engine/url";
import { checkName, clearResultCache } from "@/lib/engine/check";
import type { Source } from "@/lib/engine/types";

test("nur http und https ohne Zugangsdaten sind erlaubt", () => {
  assert.equal(safeHttpUrl("https://example.org/a?b=1"), "https://example.org/a?b=1");
  assert.equal(safeHttpUrl("http://example.org/"), "http://example.org/");
  for (const bad of [
    "javascript:alert(1)", "JaVaScRiPt:alert(1)", " javascript:alert(1)", "data:text/html,<script>1</script>",
    "vbscript:x", "file:///etc/passwd", "ftp://example.org", "//example.org", "/relativ", "",
    "https://user:pw@example.org/", "https://" + "a".repeat(3000) + ".org", 42, null, undefined, {},
  ]) {
    assert.equal(safeHttpUrl(bad), undefined, String(bad));
  }
});

test("ein manipulierter Link aus einer Quelle erreicht den Bericht nicht", async () => {
  clearResultCache();
  const evil: Source = {
    id: "evil", namespace: "packages", label: "evil", defaultEnabled: true, description: "", endpoint: "",
    async check(name) {
      return { sourceId: "evil", namespace: "packages", label: "evil", target: name, status: "taken", url: "javascript:alert(document.cookie)" };
    },
  };
  const r = await checkName("linktest", { registry: [evil] });
  assert.equal(r.results[0].url, undefined);
  assert.equal(r.results[0].status, "taken");
});
