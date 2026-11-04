/**
 * Security-Header für alle Antworten (siehe next.config.ts).
 *
 * CSP ohne Nonce: Die Seiten sind statisch vorgerendert, dort lässt sich pro Anfrage kein Nonce
 * einsetzen (Next-Doku, "Content Security Policy"). Deshalb erlaubt script-src inline-Skripte,
 * die Next für die Hydration einbettet. Fremde Skriptquellen, Plug-ins, Einbettung in fremde
 * Seiten und fremde Formularziele bleiben gesperrt. 'unsafe-eval' gibt es nur in der Entwicklung.
 */
export function buildCsp(isDev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function securityHeaders(isDev: boolean): { key: string; value: string }[] {
  return [
    { key: "Content-Security-Policy", value: buildCsp(isDev) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    // Nur über HTTPS wirksam; Browser ignorieren den Header auf http://. Meist setzt ihn der Proxy ohnehin.
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  ];
}
