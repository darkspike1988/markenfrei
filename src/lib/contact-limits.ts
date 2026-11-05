/** Grenzen des Kontaktformulars: gelten für die Oberfläche und für POST /api/contact gleichermaßen. */

export const CONTACT_NAME_MAX = 100;
export const CONTACT_EMAIL_MAX = 200;
export const CONTACT_MESSAGE_MIN = 10;
export const CONTACT_MESSAGE_MAX = 2000;

/** Frühestens so lange nach dem Rendern des Formulars wird eine Nachricht angenommen. */
export const CONTACT_MIN_FILL_MS = 3_000;
/** Spätestens so lange nach dem Rendern ist das Formular gültig. */
export const CONTACT_MAX_AGE_MS = 2 * 60 * 60 * 1000;
