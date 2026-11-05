"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import {
  CONTACT_EMAIL_MAX,
  CONTACT_MESSAGE_MAX,
  CONTACT_MESSAGE_MIN,
  CONTACT_NAME_MAX,
} from "@/lib/contact-limits";

type FieldName = "name" | "email" | "message" | "consent";
type Errors = Partial<Record<FieldName, string>>;
type Status = { kind: "idle" } | { kind: "sending" } | { kind: "done" } | { kind: "failed"; message: string };

const FIELD_ORDER: FieldName[] = ["name", "email", "message", "consent"];

const INPUT =
  "block w-full rounded-lg border border-line-strong bg-surface px-3.5 py-3 text-base text-ink placeholder:text-muted hover:border-muted aria-[invalid=true]:border-bad";

function isFieldName(value: unknown): value is FieldName {
  return typeof value === "string" && (FIELD_ORDER as string[]).includes(value);
}

/** Sehr grobe Vorabprüfung; die verbindliche Prüfung macht der Server. */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function Field({
  id,
  label,
  note,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  note?: string;
  hint?: React.ReactNode;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-ink">
        {label}
        {note ? <span className="font-normal text-muted"> {note}</span> : null}
      </label>
      {children}
      {hint ? (
        <div id={`${id}-hint`} className="mt-1.5 text-sm text-muted">
          {hint}
        </div>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm font-medium text-bad">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Kontaktformular. Sendet per fetch an POST /api/contact; nichts wird im Browser gespeichert.
 * token: die vom Server beim Rendern ausgestellte, signierte Zeitmarke (siehe src/lib/contact-token.ts).
 */
export function ContactForm({ token }: { token: string }) {
  const base = useId();
  const ids = {
    name: `${base}-name`,
    email: `${base}-email`,
    message: `${base}-message`,
    consent: `${base}-consent`,
  };
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const trapRef = useRef<HTMLInputElement>(null);

  function focusFirst(found: Errors) {
    const first = FIELD_ORDER.find((f) => found[f]);
    if (first) document.getElementById(ids[first])?.focus();
  }

  function validate(): Errors {
    const found: Errors = {};
    if (name.trim().length > CONTACT_NAME_MAX) found.name = `Der Name darf höchstens ${CONTACT_NAME_MAX} Zeichen lang sein.`;
    const mail = email.trim();
    if (!mail) found.email = "Bitte gib deine E-Mail-Adresse an, damit wir antworten können.";
    else if (!looksLikeEmail(mail) || mail.length > CONTACT_EMAIL_MAX) found.email = "Bitte gib eine gültige E-Mail-Adresse an.";
    const text = message.trim();
    if (text.length < CONTACT_MESSAGE_MIN) {
      found.message = `Bitte schreibe mindestens ${CONTACT_MESSAGE_MIN} Zeichen.`;
    } else if (text.length > CONTACT_MESSAGE_MAX) {
      found.message = `Die Nachricht darf höchstens ${CONTACT_MESSAGE_MAX} Zeichen lang sein.`;
    }
    if (!consent) found.consent = "Bitte bestätige, dass du die Datenschutzerklärung gelesen hast.";
    return found;
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status.kind === "sending") return;
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setStatus({ kind: "idle" });
      focusFirst(found);
      return;
    }
    setStatus({ kind: "sending" });
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          message: message.trim(),
          consent: true,
          website: trapRef.current?.value ?? "",
          t: token,
        }),
        signal: AbortSignal.timeout(20_000),
      });
      const data: unknown = await res.json().catch(() => null);
      const body = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
      if (res.ok && body.ok === true) {
        setName("");
        setEmail("");
        setMessage("");
        setConsent(false);
        setErrors({});
        setStatus({ kind: "done" });
        return;
      }
      const text =
        typeof body.error === "string"
          ? body.error
          : "Die Nachricht konnte nicht gesendet werden. Bitte später erneut versuchen.";
      if (isFieldName(body.field)) {
        const next = { [body.field]: text };
        setErrors(next);
        focusFirst(next);
      }
      setStatus({ kind: "failed", message: text });
    } catch {
      setStatus({
        kind: "failed",
        message: "Keine Verbindung zum Server. Bitte später erneut versuchen oder per E-Mail schreiben.",
      });
    }
  }

  const describedBy = (field: FieldName, hint: boolean) =>
    [hint ? `${ids[field]}-hint` : null, errors[field] ? `${ids[field]}-error` : null].filter(Boolean).join(" ") || undefined;
  const length = message.trim().length;
  const sending = status.kind === "sending";

  return (
    <form onSubmit={onSubmit} noValidate aria-label="Kontaktformular" className="space-y-6">
      <Field id={ids.name} label="Name" note="(optional)" error={errors.name}>
        <input
          id={ids.name}
          name="name"
          type="text"
          autoComplete="name"
          maxLength={CONTACT_NAME_MAX}
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={describedBy("name", false)}
          className={INPUT}
        />
      </Field>

      <Field
        id={ids.email}
        label="Deine E-Mail-Adresse"
        note="(Pflicht, für die Antwort)"
        hint="Dorthin schicken wir die Antwort. Sie wird nur dafür verwendet."
        error={errors.email}
      >
        <input
          id={ids.email}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          spellCheck={false}
          maxLength={CONTACT_EMAIL_MAX}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-required="true"
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={describedBy("email", true)}
          className={INPUT}
        />
      </Field>

      <Field
        id={ids.message}
        label="Nachricht"
        note="(Pflicht)"
        hint={
          <div className="flex justify-between gap-4">
            <span>
              {CONTACT_MESSAGE_MIN} bis {CONTACT_MESSAGE_MAX} Zeichen
            </span>
            <span className={`tabular-nums ${length > CONTACT_MESSAGE_MAX ? "font-medium text-bad" : ""}`}>
              {length} / {CONTACT_MESSAGE_MAX}
            </span>
          </div>
        }
        error={errors.message}
      >
        <textarea
          id={ids.message}
          name="message"
          rows={7}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          aria-required="true"
          aria-invalid={errors.message ? true : undefined}
          aria-describedby={describedBy("message", true)}
          className={`${INPUT} min-h-40 resize-y`}
        />
      </Field>

      {/* Honigfalle: für Menschen unsichtbar, nicht per Tab erreichbar, bleibt leer */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Dieses Feld bitte leer lassen
          <input ref={trapRef} type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>

      <div>
        <div className="flex items-start gap-3">
          <input
            id={ids.consent}
            name="consent"
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            aria-required="true"
            aria-invalid={errors.consent ? true : undefined}
            aria-describedby={describedBy("consent", false)}
            className="mt-0.5 size-6 shrink-0 accent-button"
          />
          <label htmlFor={ids.consent} className="min-h-6 text-sm text-soft">
            Ich habe die{" "}
            <Link href="/datenschutz#kontakt" target="_blank" className="underline hover:text-ink">
              Datenschutzerklärung<span className="sr-only"> (öffnet in neuem Tab)</span>
            </Link>{" "}
            gelesen.
          </label>
        </div>
        {errors.consent ? (
          <p id={`${ids.consent}-error`} className="mt-1.5 pl-9 text-sm font-medium text-bad">
            {errors.consent}
          </p>
        ) : null}
      </div>

      <div className="space-y-4">
        <button
          type="submit"
          aria-disabled={sending}
          className="inline-flex min-h-12 items-center justify-center rounded-lg bg-button px-6 font-medium text-button-ink transition-colors hover:bg-button-hover active:scale-[0.98] aria-disabled:opacity-60"
        >
          {sending ? "Wird gesendet …" : "Nachricht senden"}
        </button>
        <div aria-live="polite" aria-atomic="true" className="min-h-14">
          {status.kind === "done" ? (
            <p className="rounded-lg border border-line bg-ok-bg px-4 py-3 text-sm text-ok">
              Danke, deine Nachricht wurde gesendet. Die Antwort kommt per E-Mail an die angegebene Adresse.
            </p>
          ) : null}
          {status.kind === "failed" ? (
            <p className="rounded-lg border border-line bg-bad-bg px-4 py-3 text-sm text-bad">{status.message}</p>
          ) : null}
        </div>
      </div>
    </form>
  );
}
