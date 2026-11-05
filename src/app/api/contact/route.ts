import { createContactHandler } from "@/app/api/_lib/contact";

/**
 * POST /api/contact: Kontaktformular, sendet eine Nachricht per E-Mail an den Betreiber.
 * Eingabe, Schutzmaßnahmen und Grenzen stehen in _lib/contact.ts, die Versandkonfiguration
 * (MARKENFREI_SMTP_URL …) in src/lib/mail.ts.
 */
export const POST = createContactHandler();
