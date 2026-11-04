"use client";

import { useEffect, useState } from "react";
import { ArrowSquareOut, Check, Copy, X } from "@phosphor-icons/react";
import type { ClearanceReport } from "@/app/api/clearance/route";
import { TONE_CLASS, TONE_DOT, VERDICT, buildSignals } from "@/lib/verdict";
import { DomainChip } from "@/components/result-row";

function Section({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details open={defaultOpen} className="group border-b border-line py-4">
      <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium">
        {title}
        <span
          className="font-mono text-muted group-open:hidden"
          aria-hidden
        >
          +
        </span>
        <span
          className="hidden font-mono text-muted group-open:inline"
          aria-hidden
        >
          −
        </span>
      </summary>
      <div className="mt-3 text-sm text-soft">{children}</div>
    </details>
  );
}

function ExternalLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs transition-colors hover:bg-wash"
    >
      {children}
      <ArrowSquareOut size={12} weight="bold" aria-hidden />
    </a>
  );
}

function Status({ value }: { value: "available" | "taken" | "unknown" }) {
  if (value === "available") return <span className="text-ok">frei</span>;
  if (value === "taken") return <span className="text-bad">vergeben</span>;
  return <span className="text-muted">unbekannt</span>;
}

export function DetailPanel({
  report,
  onClose,
}: {
  report: ClearanceReport;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const verdict = VERDICT[report.matrixScore.verdict];
  const signals = buildSignals(report);
  const t = report.trademark;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const copyQuery = async () => {
    await navigator.clipboard.writeText(t.dpmaExpertQuery);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-ink/20"
      onClick={onClose}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Details zu ${report.name}`}
        onClick={(e) => e.stopPropagation()}
        className="slide-in flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-line bg-surface"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-surface/95 px-6 py-5 backdrop-blur">
          <div>
            <h2 className="text-2xl font-medium tracking-tight">
              {report.name}
            </h2>
            <span
              className={`mt-2 inline-block rounded-full px-2.5 py-1 text-xs font-medium ${TONE_CLASS[verdict.tone]}`}
            >
              {verdict.label} · {report.matrixScore.totalScore}/100
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="cursor-pointer rounded-md p-1.5 text-muted transition-colors hover:bg-wash hover:text-ink"
          >
            <X size={18} weight="bold" />
          </button>
        </header>

        <div className="px-6 pb-8">
          <ul className="space-y-2.5 border-b border-line py-5">
            {signals.map((s, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span
                  className={`mt-2 size-1.5 shrink-0 rounded-full ${TONE_DOT[s.tone]}`}
                  aria-hidden
                />
                <span className="text-soft">{s.text}</span>
              </li>
            ))}
          </ul>

          <Section title="Domains" defaultOpen>
            <ul className="grid grid-cols-2 gap-2">
              {report.domains.map((d) => (
                <li
                  key={d.tld}
                  className="flex items-center justify-between rounded-md border border-line px-3 py-2"
                >
                  <DomainChip tld={d.tld} status={d.status} />
                  {d.status === "available" ? (
                    <a
                      href={d.registrarLinks.inwx}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs underline underline-offset-2"
                    >
                      Registrieren
                    </a>
                  ) : (
                    <span className="text-xs">
                      <Status value={d.status} />
                    </span>
                  )}
                </li>
              ))}
            </ul>

            {/* Domain-Preisvergleich & Hosting */}
            {report.domainPrices && Object.keys(report.domainPrices).length > 0 && (
              <div className="mt-4 pt-4 border-t border-line">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-ink">
                    Günstigste Registrare & Preisvergleich
                  </span>
                  <span className="text-[11px] text-muted">
                    Dauerpreis ohne Lockvogel-Fallen
                  </span>
                </div>

                <div className="space-y-2.5">
                  {Object.entries(report.domainPrices).map(([tld, comp]) => {
                    if (!comp) return null;
                    const domainObj = report.domains.find((d) => d.tld === tld);
                    const isAvailable = domainObj?.status === "available";

                    return (
                      <div
                        key={tld}
                        className={`rounded-lg border p-2.5 text-xs ${
                          isAvailable
                            ? "border-ok/30 bg-ok-bg/15"
                            : "border-line bg-surface"
                        }`}
                      >
                        <div className="flex items-center justify-between font-mono mb-1.5">
                          <span className="font-semibold text-ink">.{tld}</span>
                          <span className="text-[11px] text-muted">
                            Günstigster Dauerpreis:{" "}
                            <strong className="text-ok">
                              {comp.cheapestRenewal.currencyLabel}
                            </strong>{" "}
                            ({comp.cheapestRenewal.name})
                          </span>
                        </div>

                        <div className="divide-y divide-line/60">
                          {comp.registrars.slice(0, 6).map((r) => (
                            <div
                              key={r.id}
                              className="py-1 flex items-center justify-between text-[11px]"
                            >
                              <div className="flex items-center gap-1.5">
                                <span
                                  className="text-[11px]"
                                  title={r.region === "EU" ? "Europäischer Hoster" : r.region === "US" ? "US-amerikanischer Registrar" : "Global"}
                                >
                                  {r.region === "EU" ? "🇪🇺" : r.region === "US" ? "🇺🇸" : "🌐"}
                                </span>
                                <span className="font-medium text-soft">{r.name}</span>
                                {r.isAtCost && (
                                  <span className="rounded bg-ok/10 text-ok px-1 text-[10px]">
                                    At-Cost
                                  </span>
                                )}
                                {r.isTeaserTrap && (
                                  <span
                                    title={r.trapWarning}
                                    className="rounded bg-warn/15 text-warn px-1 text-[10px] cursor-help"
                                  >
                                    Lockangebot
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-muted">{r.currencyLabel}</span>
                                <a
                                  href={r.registerUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-ink underline hover:text-ok"
                                >
                                  Öffnen
                                </a>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <p className="mt-2 text-[11px] text-muted">
              Preise: Stand 2026, fest hinterlegt und nicht live abgefragt. Aktuellen Preis
              beim Anbieter prüfen.
            </p>
          </Section>

          <Section title="Markenrecherche">
            <p className="text-muted">
              Dies ist eine Vorprüfung, keine Rechtsberatung. Prüfe den Namen
              vor der Nutzung in den offiziellen Registern.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <ExternalLink href={t.registryLinks.dpma}>DPMAregister</ExternalLink>
              <ExternalLink href={t.registryLinks.tmview}>TMview (EU & DE)</ExternalLink>
              <ExternalLink href={t.registryLinks.euipo}>EUIPO eSearch</ExternalLink>
              <ExternalLink href={t.registryLinks.tmdb}>TMDB (DE & EU)</ExternalLink>
              <ExternalLink href={t.registryLinks.wipo}>WIPO Global Brand</ExternalLink>
              <ExternalLink href={t.registryLinks.uspto}>USPTO (USA)</ExternalLink>
              <ExternalLink href={t.registryLinks.unternehmensregister}>
                Handelsregister
              </ExternalLink>
              <ExternalLink href={t.registryLinks.offeneRegister}>
                OffeneRegister
              </ExternalLink>
            </div>

            <div className="mt-4">
              <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
                <span>Suchstring für die DPMA-Expertensuche</span>
                <button
                  type="button"
                  onClick={copyQuery}
                  className="inline-flex cursor-pointer items-center gap-1 text-ink hover:underline"
                >
                  {copied ? (
                    <Check size={12} weight="bold" />
                  ) : (
                    <Copy size={12} weight="bold" />
                  )}
                  {copied ? "Kopiert" : "Kopieren"}
                </button>
              </div>
              <pre className="overflow-x-auto rounded-md bg-wash p-3 font-mono text-xs text-soft">
                {t.dpmaExpertQuery}
              </pre>
            </div>

            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
              <dt className="text-muted">Kölner Phonetik</dt>
              <dd className="font-mono">{t.koelnerPhonetik}</dd>
              <dt className="text-muted">Soundex</dt>
              <dd className="font-mono">{t.soundex}</dd>
              {t.phoneticTwins.length > 0 && (
                <>
                  <dt className="text-muted">Klangvarianten</dt>
                  <dd className="font-mono">{t.phoneticTwins.join(", ")}</dd>
                </>
              )}
              <dt className="text-muted">Unterscheidungskraft</dt>
              <dd>{t.distinctivenessType}</dd>
            </dl>

            {t.officialFees && (
              <div className="mt-4 rounded-md border border-line bg-wash/50 p-3 text-xs">
                <p className="font-medium text-ink mb-1">Offizielle Amtsgebühren</p>
                <ul className="space-y-1 text-muted">
                  <li><strong className="text-soft">DPMA (DE):</strong> {t.officialFees.dpma}</li>
                  <li><strong className="text-soft">EUIPO (EU):</strong> {t.officialFees.euipo}</li>
                  <li><strong className="text-soft">USPTO (US):</strong> {t.officialFees.uspto}</li>
                </ul>
              </div>
            )}

            <div className="mt-4">
              <p className="mb-1.5 text-xs text-muted">
                Empfohlene Nizza-Klassen
              </p>
              <ul className="space-y-2">
                {t.niceClasses.map((c) => (
                  <li key={c.classNumber} className="text-xs rounded border border-line p-2">
                    <span className="font-medium text-ink">{c.title}</span>
                    <p className="mt-0.5 text-muted">{c.reason}</p>
                    {c.officialScope && (
                      <p className="mt-1 text-[11px] text-muted/80 italic leading-snug">
                        {c.officialScope}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </Section>

          <Section title={`App Stores & Bundle-IDs (${report.appStore.hits.length})`} defaultOpen>
            <div className="mb-3 text-xs text-muted">
              Werktitelschutz (§ 5 Abs. 3 MarkenG): App-Titel und Software genießen
              Schutz ab Veröffentlichung oder Titelschutzanzeige.
            </div>

            {report.appStore.bundleIds && report.appStore.bundleIds.length > 0 && (
              <div className="mb-4">
                <span className="mb-1.5 block text-xs font-medium text-soft">
                  Kanonische Bundle-IDs (iOS & Android)
                </span>
                <div className="space-y-1.5">
                  {report.appStore.bundleIds.map((b) => (
                    <div
                      key={b.bundleId}
                      className="flex items-center justify-between rounded border border-line bg-surface px-2.5 py-1.5 text-xs font-mono"
                    >
                      <span>{b.bundleId}</span>
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="text-muted">iOS:</span>
                        <Status value={b.appleStatus} />
                        <span className="text-muted ml-1">Play:</span>
                        <Status value={b.googlePlayStatus} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <span className="mb-1.5 block text-xs font-medium text-soft">
              Apple App Store Treffer
            </span>
            {report.appStore.hits.length === 0 ? (
              <p className="text-muted text-xs">Keine gleichnamige App im deutschen App Store.</p>
            ) : (
              <ul className="divide-y divide-line">
                {report.appStore.hits.map((a, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{a.trackName}</p>
                      <p className="truncate text-xs text-muted">
                        {a.sellerName} · {a.primaryGenreName}
                      </p>
                    </div>
                    {a.trackViewUrl && (
                      <a
                        href={a.trackViewUrl}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`${a.trackName} im App Store öffnen`}
                        className="text-muted hover:text-ink"
                      >
                        <ArrowSquareOut size={14} weight="bold" />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Wissensdatenbanken & Enzyklopädie">
            <div className="space-y-3">
              {report.wikipediaHit && (
                <div className="rounded-lg border border-line bg-wash/30 p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-ink flex items-center gap-1.5">
                      Wikipedia (DE)
                    </span>
                    <a
                      href={report.wikipediaHit.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-soft underline flex items-center gap-0.5 hover:text-ink"
                    >
                      Artikel lesen
                      <ArrowSquareOut size={11} weight="bold" />
                    </a>
                  </div>
                  <p className="mt-1 font-medium text-xs text-ink">
                    {report.wikipediaHit.title}
                  </p>
                  <p className="text-xs text-muted">
                    {report.wikipediaHit.description}
                  </p>
                  {report.wikipediaHit.extract && (
                    <p className="mt-1 text-[11px] text-muted/90 italic">
                      „{report.wikipediaHit.extract}“
                    </p>
                  )}
                </div>
              )}

              {report.duckDuckGoHit && (
                <div className="rounded-lg border border-line bg-wash/30 p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-ink">
                      DuckDuckGo Instant Answer
                    </span>
                    {report.duckDuckGoHit.entity && (
                      <span className="rounded bg-wash px-1.5 py-0.5 text-[10px] font-mono text-muted border border-line">
                        {report.duckDuckGoHit.entity}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 font-medium text-xs text-ink">
                    {report.duckDuckGoHit.heading}
                  </p>
                  <p className="text-xs text-muted">
                    {report.duckDuckGoHit.abstract}
                  </p>
                </div>
              )}

              <div>
                <span className="mb-1 block text-xs font-medium text-soft">
                  Wikidata Entitäten ({report.wikidataHits.length})
                </span>
                {report.wikidataHits.length === 0 ? (
                  <p className="text-muted text-xs">Keine gleichnamigen Einträge auf Wikidata.</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {report.wikidataHits.slice(0, 4).map((w) => (
                      <li key={w.id} className="py-2">
                        <a
                          href={w.url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium underline-offset-2 hover:underline text-xs"
                        >
                          {w.label}
                        </a>
                        <p className="text-xs text-muted">{w.description}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Section>

          <Section title="Entwickler-Namensräume">
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-xs">
              <dt className="text-muted">GitHub-Handle</dt>
              <dd>
                <Status value={report.devAndSocial.githubHandle} />
              </dd>
              <dt className="text-muted">npm</dt>
              <dd>
                <Status value={report.devAndSocial.npmPackage} />
              </dd>
              <dt className="text-muted">PyPI (Python)</dt>
              <dd>
                <Status value={report.devAndSocial.pypiPackage} />
              </dd>
              <dt className="text-muted">Crates.io (Rust)</dt>
              <dd>
                <Status value={report.devAndSocial.cratesIo} />
              </dd>
              <dt className="text-muted">Homebrew Formula</dt>
              <dd>
                <Status value={report.devAndSocial.homebrew} />
              </dd>
              <dt className="text-muted">Go Module (proxy.golang.org)</dt>
              <dd>
                <Status value={report.devAndSocial.golangModule} />
              </dd>
            </dl>
            {report.devAndSocial.topRepos.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs">
                {report.devAndSocial.topRepos.map((r) => (
                  <li key={r.fullName}>
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline-offset-2 hover:underline"
                    >
                      {r.fullName}
                    </a>
                    <span className="text-muted"> · {r.stars} Sterne</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Open Source & Methodik">
            <div className="space-y-2 text-xs text-muted">
              <p>
                Markenfrei nutzt verifizierte Datenquellen und Algorithmen:
              </p>
              <ul className="list-disc pl-4 space-y-1">
                <li><strong className="text-soft">RDAP & DoH:</strong> DENIC, Verisign, Google Registry, Identity Digital & Cloudflare DNS</li>
                <li><strong className="text-soft">Werktitelschutz (§ 5 MarkenG):</strong> Apple iTunes API & Google Play Store</li>
                <li><strong className="text-soft">Phonetik:</strong> Kölner Phonetik (Hans Joachim Postel) & Soundex</li>
                <li><strong className="text-soft">Brandability:</strong> 6-Faktoren-Modell inspiriert von r13i/dodomains</li>
                <li><strong className="text-soft">App-Inspektion:</strong> REA (Reverse Engineering Anything) Bundle-ID-Bridge</li>
              </ul>
            </div>
          </Section>
        </div>
      </aside>
    </div>
  );
}
