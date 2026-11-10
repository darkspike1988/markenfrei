import { test } from "node:test";
import assert from "node:assert/strict";
import { clientKey, createGuard, createRateLimiter, rateLimitKey } from "@/lib/rate-limit";

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

test("erlaubt bis zum Limit und lehnt danach ab", () => {
  const c = clock();
  const rl = createRateLimiter({ limit: 2, windowMs: 60_000, now: c.now });
  assert.equal(rl.check("a").allowed, true);
  assert.equal(rl.check("a").allowed, true);
  const third = rl.check("a");
  assert.equal(third.allowed, false);
  assert.ok(third.retryAfterSec >= 1);
});

test("nach Ablauf des Fensters ist wieder alles erlaubt", () => {
  const c = clock();
  const rl = createRateLimiter({ limit: 1, windowMs: 60_000, now: c.now });
  rl.check("a");
  assert.equal(rl.check("a").allowed, false);
  c.advance(60_001);
  assert.equal(rl.check("a").allowed, true);
});

test("Schlüssel zählen getrennt", () => {
  const rl = createRateLimiter({ limit: 1, windowMs: 60_000, now: clock().now });
  assert.equal(rl.check("a").allowed, true);
  assert.equal(rl.check("b").allowed, true);
  assert.equal(rl.check("a").allowed, false);
});

test("clientKey liest x-forwarded-for von rechts, gefälschte Einträge links zählen nicht", () => {
  const req = (xff: string) => new Request("http://x", { headers: { "x-forwarded-for": xff } });
  // Ein Proxy (Standard): der rechte Eintrag ist die Adresse, die der Proxy gesehen hat
  assert.equal(clientKey(req("1.2.3.4"), 1), "1.2.3.4");
  assert.equal(clientKey(req("6.6.6.6, 1.2.3.4"), 1), "1.2.3.4", "links gefälschte Adresse wird ignoriert");
  // Zwei Proxys (z. B. CDN und nginx)
  assert.equal(clientKey(req("6.6.6.6, 1.2.3.4, 10.0.0.2"), 2), "1.2.3.4");
  // Weniger Einträge als Proxys: den linkesten nehmen statt undefined
  assert.equal(clientKey(req("1.2.3.4"), 3), "1.2.3.4");
  // Ohne vertraute Proxys werden Header ignoriert
  assert.equal(clientKey(req("6.6.6.6"), 0), "local");
  assert.equal(clientKey(new Request("http://x"), 1), "local");
  assert.equal(clientKey(new Request("http://x", { headers: { "x-real-ip": "5.5.5.5" } }), 1), "5.5.5.5");
});

test("IPv6 zählt je /64-Netz, IPv4 und IPv4-mapped je Adresse", () => {
  const req = (xff: string) => new Request("http://x", { headers: { "x-forwarded-for": xff } });
  // Zwei Adressen im selben /64 teilen sich einen Zähler, ein anderes Netz nicht
  assert.equal(clientKey(req("2001:db8:1:2:aaaa::1"), 1), clientKey(req("2001:DB8:1:2:0:0:0:ffff"), 1));
  assert.equal(clientKey(req("2001:db8:1:2::1"), 1), "2001:db8:1:2::/64");
  assert.notEqual(clientKey(req("2001:db8:1:3::1"), 1), clientKey(req("2001:db8:1:2::1"), 1));
  assert.equal(rateLimitKey("::1"), "0:0:0:0::/64");
  assert.equal(rateLimitKey("[2001:db8::1]"), "2001:db8:0:0::/64");
  assert.equal(rateLimitKey("fe80::1%en0"), "fe80:0:0:0::/64");
  assert.equal(rateLimitKey("::ffff:1.2.3.4"), "1.2.3.4");
  assert.equal(rateLimitKey("1.2.3.4"), "1.2.3.4");
  // Unlesbares bleibt unverändert und wird nicht zusammengefasst
  assert.equal(rateLimitKey("1:2:3:4:5:6:7:8:9"), "1:2:3:4:5:6:7:8:9");
  assert.equal(rateLimitKey("zz::1"), "zz::1");
});

test("die Map bleibt auch bei sehr vielen Schlüsseln begrenzt", () => {
  const c = clock();
  const rl = createRateLimiter({ limit: 1, windowMs: 60_000, now: c.now });
  for (let i = 0; i < 12_000; i++) rl.check(`k${i}`);
  // Der jüngste Schlüssel ist noch gesperrt, der älteste wurde verdrängt und ist wieder frei
  assert.equal(rl.check("k11999").allowed, false);
  assert.equal(rl.check("k0").allowed, true);
});

test("an der Obergrenze behält der Anfragende sein laufendes Fenster", () => {
  const c = clock();
  const rl = createRateLimiter({ limit: 2, windowMs: 60_000, now: c.now, maxKeys: 3 });
  rl.check("a");
  rl.check("a");
  rl.check("b");
  rl.check("c");
  // Befund: "a" war der älteste Eintrag, wurde bei der eigenen Anfrage verdrängt und begann bei 0
  assert.equal(rl.check("a").allowed, false);
  assert.equal(rl.check("a").allowed, false);
  // Ein neuer Schlüssel verdrängt weiterhin den ältesten
  assert.equal(rl.check("d").allowed, true);
  assert.equal(rl.check("a").allowed, true, "a wurde von d verdrängt");
});

test("ein erneuertes Fenster gilt als jung und wird nicht als ältestes verdrängt", () => {
  const c = clock();
  const rl = createRateLimiter({ limit: 2, windowMs: 60_000, now: c.now, maxKeys: 4 });
  rl.check("a");
  c.advance(30_000);
  rl.check("b", 2);
  rl.check("c", 2);
  c.advance(31_000);
  // Fenster von a ist abgelaufen und beginnt neu; b und c laufen noch
  rl.check("a", 2);
  rl.check("d");
  // Befund: a behielt nach der Erneuerung den ersten Platz und wurde als "ältester" verdrängt
  assert.equal(rl.check("e").allowed, true, "verdrängt b, nicht a");
  assert.equal(rl.check("a").allowed, false, "a bleibt am Limit");
  assert.equal(rl.check("c").allowed, false, "c läuft noch");
});

test("abgelaufene Fenster werden vor laufenden entfernt", () => {
  const c = clock();
  const rl = createRateLimiter({ limit: 1, windowMs: 60_000, now: c.now, maxKeys: 3 });
  rl.check("alt");
  c.advance(30_000);
  rl.check("b");
  c.advance(31_000);
  rl.check("c");
  // "alt" ist abgelaufen: d passt hinein, ohne dass b oder c verdrängt werden
  rl.check("d");
  assert.equal(rl.check("b").allowed, false);
  assert.equal(rl.check("c").allowed, false);
  assert.equal(rl.check("d").allowed, false);
});

test("ein Port in x-forwarded-for ergibt keinen eigenen Zähler", () => {
  const req = (xff: string) => new Request("http://x", { headers: { "x-forwarded-for": xff } });
  assert.equal(rateLimitKey("1.2.3.4:5678"), "1.2.3.4");
  assert.equal(clientKey(req("1.2.3.4:5678"), 1), clientKey(req("1.2.3.4:41000"), 1));
  assert.equal(rateLimitKey("[2001:db8::1]:443"), "2001:db8:0:0::/64");
  assert.equal(clientKey(req("[2001:db8::1]:443"), 1), clientKey(req("[2001:db8::2]:50000"), 1));
  assert.equal(rateLimitKey("[::ffff:1.2.3.4]:8080"), "1.2.3.4");
  // Eine reine IPv6-Adresse hat keinen Port: die letzte Gruppe gehört zur Adresse
  assert.equal(rateLimitKey("2001:db8:1:2::443"), "2001:db8:1:2::/64");
  assert.equal(rateLimitKey("2001:db8:1:2:3:4:5:8080"), "2001:db8:1:2::/64");
  assert.equal(rateLimitKey("::1"), "0:0:0:0::/64");

  const rl = createRateLimiter({ limit: 1, windowMs: 60_000, now: clock().now });
  const guard = createGuard(rl);
  assert.equal(guard(req("9.9.9.9:1111")), null);
  assert.equal(guard(req("9.9.9.9:2222"))?.status, 429, "anderer Port, derselbe Zähler");
});

test("Wächter antwortet mit 429, Retry-After und deutschem Text", async () => {
  const guard = createGuard(createRateLimiter({ limit: 1, windowMs: 60_000, now: clock().now }));
  const req = () => new Request("http://x", { headers: { "x-forwarded-for": "9.9.9.9" } });
  assert.equal(guard(req()), null);
  const res = guard(req());
  assert.ok(res);
  assert.equal(res.status, 429);
  assert.ok(Number(res.headers.get("Retry-After")) >= 1);
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /Zu viele Anfragen/);
});

test("Gewichtung: eine teure Anfrage verbraucht mehrere Einheiten", () => {
  const rl = createRateLimiter({ limit: 10, windowMs: 60_000, now: clock().now });
  assert.equal(rl.check("a", 8).allowed, true);
  assert.equal(rl.check("a", 3).allowed, false, "8 + 3 > 10");
  assert.equal(rl.check("a", 2).allowed, true, "8 + 2 = 10");
  assert.equal(rl.check("a").allowed, false);
});
