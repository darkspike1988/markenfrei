import { Suspense } from "react";
import { DEFAULT_NAMESPACES, MAX_NAMES, MAX_TLDS, STATIC_SOURCES } from "@/lib/engine/check";
import { DEFAULT_DOMAIN_TLDS, DOMAIN_TLDS } from "@/lib/engine/sources/domains";
import { NAMESPACE_LABEL, NAMESPACES } from "@/lib/engine/types";
import type { CheckerConfig } from "@/components/checker-config";
import { CheckerFallback, CheckerFromUrl } from "@/components/checker";

/**
 * Startseite. Die Quellenliste wird hier (Server, Buildzeit) zu reinen Daten gemacht,
 * damit der Engine-Code nicht im Client-Bundle landet.
 */
function buildConfig(): CheckerConfig {
  const withDefaults = new Set(STATIC_SOURCES.filter((s) => s.defaultEnabled).map((s) => s.namespace));
  return {
    namespaces: NAMESPACES.filter((ns) => ns === "domains" || withDefaults.has(ns)).map((id) => ({
      id,
      label: NAMESPACE_LABEL[id],
    })),
    defaultNamespaces: [...DEFAULT_NAMESPACES],
    tlds: [...DOMAIN_TLDS],
    defaultTlds: [...DEFAULT_DOMAIN_TLDS],
    maxTlds: MAX_TLDS,
    maxNames: MAX_NAMES,
    sources: STATIC_SOURCES.map((s) => ({
      id: s.id,
      label: s.label,
      namespace: s.namespace,
      description: s.description,
      defaultEnabled: s.defaultEnabled,
    })),
  };
}

export default function Home() {
  const config = buildConfig();
  return (
    <div className="pt-8 sm:pt-14">
      <div className="mb-8 max-w-2xl sm:mb-10">
        <h1 className="font-serif text-[2.1rem] leading-[1.1] tracking-[-0.02em] text-ink sm:text-5xl">
          Wo ist der Name schon vergeben?
        </h1>
        <p className="mt-4 text-base text-soft sm:text-lg">
          Domains, Pakete, App Stores und bekannte Namen in einem Durchgang, mit Link zu jeder Quelle. Marken prüft
          Markenfrei nicht, bereitet die Recherche aber vor.
        </p>
      </div>
      <Suspense fallback={<CheckerFallback config={config} />}>
        <CheckerFromUrl config={config} />
      </Suspense>
    </div>
  );
}
