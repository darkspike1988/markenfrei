import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONTACT_FOOTER,
  CONTACT_SUBJECT,
  MailSendError,
  mailConfigFromEnv,
  sendContactMail,
  type MailConfig,
  type MailTransport,
  type SmtpOptions,
} from "@/lib/mail";

const OPERATOR = { MARKENFREI_OPERATOR_EMAIL: "betreiber@example.org" };

function configured(env: Record<string, string | undefined>): MailConfig {
  const r = mailConfigFromEnv(env);
  assert.equal(r.configured, true, r.configured ? "" : String(r.problem));
  if (!r.configured) throw new Error("unreachable");
  return r.config;
}

function refused(env: Record<string, string | undefined>): string | null {
  const r = mailConfigFromEnv(env);
  assert.equal(r.configured, false);
  return r.configured ? null : r.problem;
}

test("ohne MARKENFREI_SMTP_URL ist das Formular nicht eingerichtet, ohne Fehlermeldung", () => {
  assert.deepEqual(mailConfigFromEnv({}), { configured: false, problem: null });
  assert.deepEqual(mailConfigFromEnv({ ...OPERATOR, MARKENFREI_SMTP_URL: "  " }), { configured: false, problem: null });
});

test("smtps: TLS von Anfang an, Standardport 465, Zugangsdaten URL-dekodiert", () => {
  const c = configured({ ...OPERATOR, MARKENFREI_SMTP_URL: "smtps://kontakt%40example.org:p%3Ass%2Fw@mail.example.org" });
  assert.equal(c.smtp.host, "mail.example.org");
  assert.equal(c.smtp.port, 465);
  assert.equal(c.smtp.secure, true);
  assert.equal(c.smtp.requireTLS, false);
  assert.deepEqual(c.smtp.auth, { user: "kontakt@example.org", pass: "p:ss/w" });
});

test("Zeitgrenzen: Verbindung 5 s, Begrüßung 5 s, Socket 10 s; keine Dateien oder URLs als Anhang", () => {
  const { smtp } = configured({ ...OPERATOR, MARKENFREI_SMTP_URL: "smtps://u:p@mail.example.org:465" });
  assert.equal(smtp.connectionTimeout, 5_000);
  assert.equal(smtp.greetingTimeout, 5_000);
  assert.equal(smtp.socketTimeout, 10_000);
  assert.equal(smtp.disableFileAccess, true);
  assert.equal(smtp.disableUrlAccess, true);
});

test("smtp auf Port 587 verlangt STARTTLS", () => {
  const c = configured({ ...OPERATOR, MARKENFREI_SMTP_URL: "smtp://user:pw@mail.example.org:587" });
  assert.equal(c.smtp.port, 587);
  assert.equal(c.smtp.secure, false);
  assert.equal(c.smtp.requireTLS, true);
  // ohne Port gilt 587
  assert.equal(configured({ ...OPERATOR, MARKENFREI_SMTP_URL: "smtp://user:pw@mail.example.org" }).smtp.port, 587);
});

test("unverschlüsseltes smtp wird zu entfernten Hosts abgelehnt, ohne das Passwort zu nennen", () => {
  for (const url of [
    "smtp://user:geheim@mail.example.org:25",
    "smtp://user:geheim@mail.example.org:2525",
    "smtp://user:geheim@mail.example.org:465",
    "smtp://user:geheim@192.0.2.10:25",
  ]) {
    const problem = refused({ ...OPERATOR, MARKENFREI_SMTP_URL: url });
    assert.match(problem ?? "", /smtp:\/\//, url);
    assert.doesNotMatch(problem ?? "", /geheim/, url);
  }
});

test("smtp ohne TLS ist nur zu localhost und Loopback erlaubt", () => {
  for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
    const c = configured({ ...OPERATOR, MARKENFREI_SMTP_URL: `smtp://${host}:2525` });
    assert.equal(c.smtp.requireTLS, false, host);
    assert.equal(c.smtp.port, 2525);
    assert.equal(c.smtp.auth, undefined);
  }
  assert.equal(configured({ ...OPERATOR, MARKENFREI_SMTP_URL: "smtp://[::1]:2525" }).smtp.host, "::1");
});

test("unbrauchbare URLs werden abgelehnt (Schema, Host, Port, Pfad, Parameter, Kodierung)", () => {
  for (const url of [
    "mail.example.org:465",
    "http://mail.example.org",
    "smtps://",
    "smtps://mail.example.org:99999",
    "smtps://mail.example.org:465/path",
    "smtps://mail.example.org:465?ignoreTLS=true",
    "smtps://user:%ZZ@mail.example.org:465",
  ]) {
    assert.ok(refused({ ...OPERATOR, MARKENFREI_SMTP_URL: url }), url);
  }
});

test("Empfänger: MARKENFREI_CONTACT_TO, sonst MARKENFREI_OPERATOR_EMAIL; ohne beide nicht eingerichtet", () => {
  const url = "smtps://u:p@mail.example.org:465";
  assert.equal(configured({ ...OPERATOR, MARKENFREI_SMTP_URL: url }).to, "betreiber@example.org");
  assert.equal(
    configured({ ...OPERATOR, MARKENFREI_SMTP_URL: url, MARKENFREI_CONTACT_TO: "anfragen@example.org" }).to,
    "anfragen@example.org",
  );
  assert.match(refused({ MARKENFREI_SMTP_URL: url }) ?? "", /MARKENFREI_CONTACT_TO/);
  assert.match(
    refused({ MARKENFREI_SMTP_URL: url, MARKENFREI_CONTACT_TO: "kein-mail" }) ?? "",
    /MARKENFREI_CONTACT_TO/,
  );
});

test("Absender: MARKENFREI_CONTACT_FROM, sonst SMTP-Benutzer (wenn Adresse), sonst Empfänger", () => {
  assert.equal(
    configured({ ...OPERATOR, MARKENFREI_SMTP_URL: "smtps://form%40example.org:p@mail.example.org", MARKENFREI_CONTACT_FROM: "absender@example.org" }).from,
    "absender@example.org",
  );
  assert.equal(configured({ ...OPERATOR, MARKENFREI_SMTP_URL: "smtps://form%40example.org:p@mail.example.org" }).from, "form@example.org");
  assert.equal(configured({ ...OPERATOR, MARKENFREI_SMTP_URL: "smtps://formular:p@mail.example.org" }).from, "betreiber@example.org");
  assert.equal(configured({ ...OPERATOR, MARKENFREI_SMTP_URL: "smtp://localhost:2525" }).from, "betreiber@example.org");
  assert.match(
    refused({ ...OPERATOR, MARKENFREI_SMTP_URL: "smtps://u:p@mail.example.org", MARKENFREI_CONTACT_FROM: "x@y.de\r\nBcc: z@y.de" }) ?? "",
    /MARKENFREI_CONTACT_FROM/,
  );
});

// --- Versand ----------------------------------------------------------------------------------

const CONFIG: MailConfig = configured({
  ...OPERATOR,
  MARKENFREI_SMTP_URL: "smtps://form%40example.org:SehrGeheim@mail.example.org:465",
  MARKENFREI_CONTACT_TO: "anfragen@example.org",
});

type Sent = Parameters<MailTransport["sendMail"]>[0];

function fakeTransport(behavior: (mail: Sent) => Promise<unknown> = async () => ({ accepted: ["x"] })) {
  const state = { options: [] as SmtpOptions[], sent: [] as Sent[], closed: 0 };
  const factory = (options: SmtpOptions): MailTransport => {
    state.options.push(options);
    return {
      async sendMail(mail) {
        state.sent.push(mail);
        return behavior(mail);
      },
      close() {
        state.closed++;
      },
    };
  };
  return { state, factory };
}

test("Versand: Von ist der eingestellte Absender, Reply-To der Besucher, Betreff fest, Klartext mit Fußzeile", async () => {
  const { state, factory } = fakeTransport();
  await sendContactMail(CONFIG, { name: "Erika Muster", email: "erika@example.net", message: "Hallo,\nbitte um Rückruf." }, factory);
  assert.equal(state.sent.length, 1);
  const mail = state.sent[0];
  assert.equal(mail.from, "form@example.org");
  assert.equal(mail.to, "anfragen@example.org");
  assert.equal(mail.replyTo, "erika@example.net");
  assert.notEqual(mail.from, "erika@example.net");
  assert.equal(mail.subject, CONTACT_SUBJECT);
  assert.equal(mail.subject, "Markenfrei Kontaktformular: neue Nachricht");
  assert.equal(
    mail.text,
    ["Name: Erika Muster", "E-Mail: erika@example.net", "", "Nachricht:", "Hallo,\nbitte um Rückruf.", "", "--", CONTACT_FOOTER, ""].join("\n"),
  );
  assert.equal(CONTACT_FOOTER, "Gesendet über das Kontaktformular von markenfrei.app");
  assert.deepEqual(state.options[0], CONFIG.smtp);
  assert.equal(state.closed, 1);
});

test("Versand: kein Text des Besuchers im Betreff, fehlender Name wird benannt", async () => {
  const { state, factory } = fakeTransport();
  await sendContactMail(CONFIG, { name: "", email: "a@example.net", message: "Betreff-Test mit Text" }, factory);
  assert.doesNotMatch(state.sent[0].subject, /Betreff-Test|a@example/);
  assert.match(state.sent[0].text, /^Name: \(nicht angegeben\)$/m);
});

test("Fehler des Transports: allgemeine Meldung ohne Ursache, Zugangsdaten oder Eingaben", async () => {
  const { factory, state } = fakeTransport(async () => {
    throw Object.assign(new Error("535 Auth failed for form@example.org with SehrGeheim: Betreff erika@example.net"), {
      code: "EAUTH",
      response: "535 SehrGeheim",
    });
  });
  await assert.rejects(
    () => sendContactMail(CONFIG, { name: "E", email: "erika@example.net", message: "Geheime Nachricht 123" }, factory),
    (err: unknown) => {
      assert.ok(err instanceof MailSendError);
      assert.equal(err.reason, "failed");
      assert.equal(err.code, "EAUTH");
      const dump = `${err.message} ${err.stack} ${JSON.stringify(err)} ${String(err.cause)}`;
      assert.doesNotMatch(dump, /SehrGeheim|erika@example|Geheime Nachricht|535/);
      return true;
    },
  );
  assert.equal(state.closed, 1);
});

test("Fehler beim Erzeugen oder synchroner Fehler im Transport ergeben ebenfalls MailSendError", async () => {
  await assert.rejects(
    () =>
      sendContactMail(CONFIG, { name: "", email: "a@example.net", message: "Nachricht 1234" }, () => {
        throw new Error("SehrGeheim");
      }),
    (err: unknown) => err instanceof MailSendError && !/SehrGeheim/.test(err.message),
  );
});

test("Gesamtbudget: hängt der Versand, bricht er nach dem Budget mit timeout ab und schließt den Transport", async () => {
  const { factory, state } = fakeTransport(() => new Promise(() => undefined));
  const started = Date.now();
  await assert.rejects(
    () => sendContactMail(CONFIG, { name: "", email: "a@example.net", message: "Nachricht 1234" }, factory, 40),
    (err: unknown) => err instanceof MailSendError && err.reason === "timeout",
  );
  assert.ok(Date.now() - started < 2_000);
  assert.equal(state.closed, 1);
});

test("Fehlerhafte Fehlercodes werden nicht übernommen", async () => {
  const { factory } = fakeTransport(async () => {
    throw Object.assign(new Error("x"), { code: "enthält Passwort SehrGeheim" });
  });
  await assert.rejects(
    () => sendContactMail(CONFIG, { name: "", email: "a@example.net", message: "Nachricht 1234" }, factory),
    (err: unknown) => err instanceof MailSendError && err.code === undefined,
  );
});
