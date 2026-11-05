import { test, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createContactHandler, CONTACT_LIMIT_GLOBAL, CONTACT_LIMIT_PER_IP } from "@/app/api/_lib/contact";
import { POST as routePOST } from "@/app/api/contact/route";
import { CONTACT_MAX_AGE_MS, CONTACT_MIN_FILL_MS } from "@/lib/contact-limits";
import { checkContactToken, issueContactToken } from "@/lib/contact-token";
import { mailConfigFromEnv, type MailConfigResult, type MailTransport } from "@/lib/mail";

const SECRET_PASSWORD = "SehrGeheimesPasswort";
const CONFIG = mailConfigFromEnv({
  MARKENFREI_SMTP_URL: `smtps://form%40example.org:${SECRET_PASSWORD}@mail.example.org:465`,
  MARKENFREI_CONTACT_TO: "betreiber@example.org",
});
assert.equal(CONFIG.configured, true);

let clock = 1_800_000_000_000;
let ipCounter = 1;
const nextIp = () => `203.0.113.${ipCounter++}`;

type Sent = Parameters<MailTransport["sendMail"]>[0];

function setup(opts: { config?: MailConfigResult; fail?: boolean } = {}) {
  const sent: Sent[] = [];
  const handler = createContactHandler({
    getConfig: () => opts.config ?? CONFIG,
    now: () => clock,
    createTransport: () => ({
      async sendMail(mail) {
        if (opts.fail) throw Object.assign(new Error(`535 Login fehlgeschlagen ${SECRET_PASSWORD} ${mail.replyTo}`), { code: "EAUTH" });
        sent.push(mail);
        return {};
      },
    }),
  });
  return { handler, sent };
}

function validBody(over: Record<string, unknown> = {}) {
  return {
    name: "Erika Mustermann",
    email: "erika@example.net",
    message: "Guten Tag, ich habe eine Frage zu Ihrem Angebot.",
    consent: true,
    website: "",
    t: issueContactToken(clock - 10_000),
    ...over,
  };
}

function req(body: unknown, init: { ip?: string; raw?: boolean; type?: string; headers?: Record<string, string> } = {}) {
  return new Request("http://localhost/api/contact", {
    method: "POST",
    headers: {
      "Content-Type": init.type ?? "application/json",
      "x-forwarded-for": init.ip ?? nextIp(),
      ...init.headers,
    },
    body: init.raw ? String(body) : JSON.stringify(body),
  });
}

async function errorOf(res: Response): Promise<{ error: string; field?: string }> {
  return (await res.json()) as { error: string; field?: string };
}

// Konsole abfangen: nichts vom Besucher darf je dort landen
const consoleOutput: string[] = [];
const originalConsole = { ...console };
for (const level of ["log", "info", "warn", "error", "debug", "trace"] as const) {
  console[level] = (...args: unknown[]) => {
    consoleOutput.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  };
}
afterEach(() => {
  clock += 1;
});

test("gültige Nachricht: 200 { ok: true }, no-store, Transport erhält Absender, Empfänger, Reply-To, Betreff, Text", async () => {
  const { handler, sent } = setup();
  const res = await handler(req(validBody()));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].from, "form@example.org");
  assert.equal(sent[0].to, "betreiber@example.org");
  assert.equal(sent[0].replyTo, "erika@example.net");
  assert.equal(sent[0].subject, "Markenfrei Kontaktformular: neue Nachricht");
  assert.match(sent[0].text, /^Name: Erika Mustermann$/m);
  assert.match(sent[0].text, /^E-Mail: erika@example\.net$/m);
  assert.match(sent[0].text, /Guten Tag, ich habe eine Frage zu Ihrem Angebot\./);
  assert.match(sent[0].text, /Gesendet über das Kontaktformular von markenfrei\.app\n$/);
});

test("Name ist optional und wird getrimmt", async () => {
  const { handler, sent } = setup();
  for (const name of [undefined, "", "  Erika  "]) {
    const body = validBody(name === undefined ? {} : { name });
    if (name === undefined) delete (body as Record<string, unknown>).name;
    assert.equal((await handler(req(body))).status, 200);
  }
  assert.match(sent[0].text, /^Name: \(nicht angegeben\)$/m);
  assert.match(sent[1].text, /^Name: \(nicht angegeben\)$/m);
  assert.match(sent[2].text, /^Name: Erika$/m);
});

test("CR oder LF in Name oder E-Mail wird abgelehnt (Header-Injection), nichts wird gesendet", async () => {
  const { handler, sent } = setup();
  const attempts: Record<string, unknown>[] = [
    { name: "Erika\r\nBcc: opfer@example.org" },
    { name: "Erika\nBcc: opfer@example.org" },
    { name: "Erika\rBcc: opfer@example.org" },
    { name: "Erika\r\n" },
    { email: "erika@example.net\r\nBcc: opfer@example.org" },
    { email: "erika@example.net\n" },
    { email: "erika\n@example.net" },
    { email: "erika@example.net\r" },
  ];
  for (const over of attempts) {
    const res = await handler(req(validBody(over)));
    assert.equal(res.status, 400, JSON.stringify(over));
    const body = await errorOf(res);
    assert.ok(body.field === "name" || body.field === "email");
    assert.doesNotMatch(JSON.stringify(body), /Bcc|opfer/);
  }
  assert.equal(sent.length, 0);
});

test("Honigfalle befüllt: 200 { ok: true } ohne Versand, auch bei sonst ungültigen Daten", async () => {
  const { handler, sent } = setup();
  for (const over of [{ website: "https://spam.example" }, { website: "x", email: "kaputt", consent: false, t: "" }]) {
    const res = await handler(req(validBody(over)));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  }
  assert.equal(sent.length, 0);
});

test("Honigfalle verbraucht kein Kontingent", async () => {
  const { handler, sent } = setup();
  const ip = nextIp();
  for (let i = 0; i < 5; i++) await handler(req(validBody({ website: "bot" }), { ip }));
  assert.equal((await handler(req(validBody(), { ip }))).status, 200);
  assert.equal(sent.length, 1);
});

test("zu schnell (unter 3 Sekunden) ergibt 400 ohne Versand", async () => {
  const { handler, sent } = setup();
  for (const age of [0, 1_000, CONTACT_MIN_FILL_MS - 1]) {
    const res = await handler(req(validBody({ t: issueContactToken(clock - age) })));
    assert.equal(res.status, 400, `Alter ${age}`);
    assert.match((await errorOf(res)).error, /zu schnell/);
  }
  assert.equal(sent.length, 0);
  assert.equal((await handler(req(validBody({ t: issueContactToken(clock - CONTACT_MIN_FILL_MS) })))).status, 200);
});

test("abgelaufene Marke (über 2 Stunden) ergibt 400, Marke aus der Zukunft gilt als zu schnell", async () => {
  const { handler, sent } = setup();
  const old = await handler(req(validBody({ t: issueContactToken(clock - CONTACT_MAX_AGE_MS - 1) })));
  assert.equal(old.status, 400);
  assert.match((await errorOf(old)).error, /abgelaufen/);
  const future = await handler(req(validBody({ t: issueContactToken(clock + 60_000) })));
  assert.equal(future.status, 400);
  assert.equal(sent.length, 0);
  assert.equal((await handler(req(validBody({ t: issueContactToken(clock - CONTACT_MAX_AGE_MS) })))).status, 200);
});

test("fehlende, gefälschte oder fremd signierte Marke ergibt 400", async () => {
  const { handler, sent } = setup();
  const real = issueContactToken(clock - 10_000);
  const [ts, sig] = real.split(".");
  const forged = [
    "",
    "abc",
    `${clock - 10_000}.${"A".repeat(43)}`,
    `${Number(ts) - 5_000_000}.${sig}`,
    issueContactToken(clock - 10_000, Buffer.from("anderes Geheimnis, 32 Bytes lang!!!")),
  ];
  for (const t of forged) {
    const res = await handler(req(validBody({ t })));
    assert.equal(res.status, 400, t);
    assert.match((await errorOf(res)).error, /ungültig/);
  }
  const missing = validBody();
  delete (missing as Record<string, unknown>).t;
  assert.equal((await handler(req(missing))).status, 400);
  assert.equal(sent.length, 0);
});

test("Marke: Prüfung direkt (Ausstellen und Prüfen mit eigener Zeit)", () => {
  const t = issueContactToken(5_000_000);
  assert.equal(checkContactToken(t, 5_000_000 + CONTACT_MIN_FILL_MS), "ok");
  assert.equal(checkContactToken(t, 5_000_000 + 100), "too_fast");
  assert.equal(checkContactToken(t, 5_000_000 + CONTACT_MAX_AGE_MS + 1), "expired");
  assert.equal(checkContactToken(`${t}x`, 5_000_000 + CONTACT_MIN_FILL_MS), "invalid");
});

test("fehlende Einwilligung ergibt 400", async () => {
  const { handler, sent } = setup();
  for (const consent of [false, "true", 1, undefined]) {
    const res = await handler(req(validBody({ consent })));
    assert.equal(res.status, 400);
    assert.equal((await errorOf(res)).field, "consent");
  }
  assert.equal(sent.length, 0);
});

test("ungültige E-Mail-Adresse ergibt 400", async () => {
  const { handler } = setup();
  for (const email of ["", "kein-mail", "a@b", "a b@example.org", "<a@example.org>", "a@example.org, b@example.org", `${"a".repeat(200)}@example.org`, 42]) {
    const res = await handler(req(validBody({ email })));
    assert.equal(res.status, 400, String(email));
    assert.equal((await errorOf(res)).field, "email");
  }
});

test("Nachricht muss 10 bis 2000 Zeichen haben, Name höchstens 100", async () => {
  const { handler } = setup();
  for (const message of ["", "kurz", "         x         ", "x".repeat(2001)]) {
    const res = await handler(req(validBody({ message })));
    assert.equal(res.status, 400, message.slice(0, 20));
    assert.equal((await errorOf(res)).field, "message");
  }
  assert.equal((await handler(req(validBody({ message: "x".repeat(10) })))).status, 200);
  assert.equal((await handler(req(validBody({ message: "x".repeat(2000) })))).status, 200);
  const longName = await handler(req(validBody({ name: "n".repeat(101) })));
  assert.equal(longName.status, 400);
  assert.equal((await errorOf(longName)).field, "name");
  assert.equal((await handler(req(validBody({ name: "n".repeat(100) })))).status, 200);
});

test("Zeilenumbrüche in der Nachricht sind erlaubt, andere Steuerzeichen nicht", async () => {
  const { handler, sent } = setup();
  assert.equal((await handler(req(validBody({ message: "Zeile 1\r\nZeile 2\n\tZeile 3 mit Einzug" })))).status, 200);
  assert.equal((await handler(req(validBody({ message: "Text mit \u0000 Nullbyte drin" })))).status, 400);
  assert.equal(sent.length, 1);
});

test("zu großer Body ergibt 413 (auch ohne Content-Length)", async () => {
  const { handler, sent } = setup();
  const big = JSON.stringify(validBody({ message: "x".repeat(9_000) }));
  assert.equal((await handler(req(big, { raw: true }))).status, 413);
  // duplex ist für Stream-Bodies in Node nötig, steht aber nicht in jedem RequestInit-Typ
  const init: RequestInit & { duplex: "half" } = {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": nextIp() },
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(big));
        controller.close();
      },
    }),
    duplex: "half",
  };
  const streamed = new Request("http://localhost/api/contact", init);
  assert.equal((await handler(streamed)).status, 413);
  assert.equal(sent.length, 0);
});

test("falscher Content-Type ergibt 415, fremder Origin 403, kaputtes JSON 400", async () => {
  const { handler, sent } = setup();
  assert.equal((await handler(req(JSON.stringify(validBody()), { raw: true, type: "text/plain" }))).status, 415);
  assert.equal((await handler(req(JSON.stringify(validBody()), { raw: true, type: "application/x-www-form-urlencoded" }))).status, 415);
  assert.equal((await handler(req(validBody(), { headers: { Origin: "https://boese.example" } }))).status, 403);
  assert.equal((await handler(req("{kaputt", { raw: true }))).status, 400);
  assert.equal((await handler(req("[]", { raw: true }))).status, 400);
  assert.equal((await handler(req("null", { raw: true }))).status, 400);
  assert.equal(sent.length, 0);
});

test("die vierte Nachricht derselben IP innerhalb einer Stunde ergibt 429 mit Retry-After", async () => {
  const { handler, sent } = setup();
  const ip = nextIp();
  for (let i = 0; i < CONTACT_LIMIT_PER_IP; i++) {
    assert.equal((await handler(req(validBody(), { ip }))).status, 200, `Nachricht ${i + 1}`);
  }
  const res = await handler(req(validBody(), { ip }));
  assert.equal(res.status, 429);
  const retry = Number(res.headers.get("retry-after"));
  assert.ok(retry >= 1 && retry <= 3600, `Retry-After ${retry}`);
  assert.match((await errorOf(res)).error, /zu viele Nachrichten/i);
  assert.equal(sent.length, CONTACT_LIMIT_PER_IP);
  // andere IP ist nicht betroffen
  assert.equal((await handler(req(validBody()))).status, 200);
});

test("Fehleingaben verbrauchen das Kontingent nicht; nach einer Stunde geht es wieder", async () => {
  const { handler } = setup();
  const ip = nextIp();
  for (let i = 0; i < 6; i++) assert.equal((await handler(req(validBody({ message: "kurz" }), { ip }))).status, 400);
  for (let i = 0; i < 3; i++) assert.equal((await handler(req(validBody(), { ip }))).status, 200);
  assert.equal((await handler(req(validBody(), { ip }))).status, 429);
  clock += 3_600_001;
  assert.equal((await handler(req(validBody(), { ip }))).status, 200);
});

test("globale Obergrenze: höchstens 30 Nachrichten pro Stunde und Prozess", async () => {
  const { handler, sent } = setup();
  for (let i = 0; i < CONTACT_LIMIT_GLOBAL; i++) assert.equal((await handler(req(validBody()))).status, 200, `Nachricht ${i + 1}`);
  const res = await handler(req(validBody()));
  assert.equal(res.status, 429);
  assert.ok(Number(res.headers.get("retry-after")) >= 1);
  assert.equal(sent.length, CONTACT_LIMIT_GLOBAL);
});

test("ohne Mailkonfiguration: 503 mit deutscher Meldung, ohne Versand", async () => {
  for (const config of [{ configured: false, problem: null } as const, { configured: false, problem: "MARKENFREI_SMTP_URL ist keine gültige URL" } as const]) {
    const { handler, sent } = setup({ config });
    const res = await handler(req(validBody()));
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: "Das Kontaktformular ist gerade nicht verfügbar." });
    assert.equal(sent.length, 0);
  }
});

test("die echte Route ohne MARKENFREI_SMTP_URL antwortet mit 503", async () => {
  const saved = process.env.MARKENFREI_SMTP_URL;
  delete process.env.MARKENFREI_SMTP_URL;
  try {
    const res = await routePOST(req(validBody({ t: issueContactToken(Date.now() - 10_000) })));
    assert.equal(res.status, 503);
  } finally {
    if (saved !== undefined) process.env.MARKENFREI_SMTP_URL = saved;
  }
});

test("Fehler beim Versand: 502 mit allgemeiner Meldung, ohne Details, Zugangsdaten oder Eingaben", async () => {
  const { handler } = setup({ fail: true });
  const res = await handler(req(validBody()));
  assert.equal(res.status, 502);
  const text = await res.text();
  assert.match(text, /konnte nicht gesendet werden/);
  assert.doesNotMatch(text, new RegExp(`${SECRET_PASSWORD}|535|EAUTH|erika|Mustermann|Angebot|mail\\.example\\.org`));
});

test("Antworten geben nie Eingaben des Besuchers zurück", async () => {
  const { handler } = setup();
  const marker = "EINZIGARTIG-4711";
  const bodies = [
    validBody({ name: `${marker}\r\n`, message: `${marker} ${marker}` }),
    validBody({ email: `${marker}@x`, message: marker }),
    validBody({ consent: false, message: `${marker} Nachricht` }),
    validBody({ message: `${marker} ok, genug Zeichen` }),
    validBody({ website: marker }),
  ];
  for (const body of bodies) {
    const res = await handler(req(body));
    assert.doesNotMatch(await res.text(), new RegExp(marker));
  }
});

test("nichts vom Besucher landet in der Konsole, auch nicht bei Fehlern", async () => {
  const marker = "GEHEIMTEXT-0815";
  const { handler: ok } = setup();
  const { handler: broken } = setup({ fail: true });
  const bodies = [
    validBody({ name: `${marker}-Name`, email: `${marker}@example.net`, message: `${marker} Nachricht` }),
    validBody({ name: `${marker}\r\nBcc: x`, message: `${marker} Nachricht` }),
    validBody({ website: marker, message: `${marker} Nachricht` }),
    validBody({ message: marker }),
  ];
  for (const body of bodies) {
    await ok(req(body));
    await broken(req(body));
  }
  assert.ok(consoleOutput.length > 0, "der Fehlerfall meldet den Fehlercode");
  const joined = consoleOutput.join("\n");
  assert.doesNotMatch(joined, new RegExp(`${marker}|erika|Mustermann|example\\.net|${SECRET_PASSWORD}|mail\\.example\\.org`, "i"));
  assert.match(joined, /Versand fehlgeschlagen \(failed, EAUTH\)/);
});

after(() => {
  Object.assign(console, originalConsole);
});
