/**
 * Reverse Engineering & App Store Ecosystem Bridge (REA & Werktitelschutz § 5 Abs. 3 MarkenG)
 *
 * Implements bundle identifier and package namespace clearance for Apple App Store (iOS/macOS)
 * and Google Play (Android), local Info.plist extraction via macOS native plutil / XML,
 * and Werktitelschutz collision appraisal.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";

const execFileAsync = promisify(execFile);
const UA = "MarkenFrei/1.0 (+https://github.com/darkspike1988/markenfrei; App-Store-Checker)";

export type AppBundleCheckResult = {
  bundleId: string;
  appleStatus: "available" | "taken" | "unknown";
  googlePlayStatus: "available" | "taken" | "unknown";
  appleApp?: {
    trackName: string;
    artistName: string;
    version: string;
    trackViewUrl: string;
  };
  googlePlayUrl?: string;
};

export type AppIdentity = {
  bundleId?: string;
  displayName?: string;
  bundleName?: string;
  version?: string;
  shortVersion?: string;
  minOsVersion?: string;
  sourceType: "local-plist" | "manual-id";
  sourcePath?: string;
};

/**
 * Checks if a specific Bundle Identifier (e.g. "de.firma.app") is taken on Apple App Store
 */
export async function checkAppleBundleId(bundleId: string): Promise<{
  status: "available" | "taken" | "unknown";
  app?: {
    trackName: string;
    artistName: string;
    version: string;
    trackViewUrl: string;
  };
}> {
  try {
    const url = `https://itunes.apple.com/lookup?bundleId=${encodeURIComponent(bundleId)}&country=de`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(3500),
    });

    if (!res.ok) return { status: "unknown" };
    const data = await res.json();
    const results = Array.isArray(data?.results) ? data.results : [];

    if (results.length > 0) {
      const match = results[0];
      return {
        status: "taken",
        app: {
          trackName: String(match.trackName || ""),
          artistName: String(match.artistName || ""),
          version: String(match.version || ""),
          trackViewUrl: String(match.trackViewUrl || ""),
        },
      };
    }

    return { status: "available" };
  } catch {
    return { status: "unknown" };
  }
}

/**
 * Checks if a package name exists on Google Play Store
 */
export async function checkGooglePlayPackage(packageId: string): Promise<{
  status: "available" | "taken" | "unknown";
  playUrl?: string;
}> {
  try {
    const url = `https://play.google.com/store/apps/details?id=${encodeURIComponent(packageId)}&hl=de`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(3500),
      redirect: "follow",
    });

    if (res.status === 200) {
      return {
        status: "taken",
        playUrl: url,
      };
    }
    if (res.status === 404) {
      return {
        status: "available",
      };
    }
    return { status: "unknown" };
  } catch {
    return { status: "unknown" };
  }
}

/**
 * Generates canonical reverse-DNS Bundle Identifiers for a brand name
 * e.g. "wachwerk" -> ["de.wachwerk.app", "com.wachwerk.app", "io.wachwerk.app"]
 */
export function generateCandidateBundleIds(cleanName: string): string[] {
  const norm = cleanName.toLowerCase().replace(/[^a-z0-9]/g, "");
  return [
    `de.${norm}.app`,
    `com.${norm}.app`,
    `io.${norm}.app`,
  ];
}

/**
 * Verifies candidate bundle IDs on both stores in parallel
 */
export async function auditCandidateBundleIds(
  cleanName: string,
): Promise<AppBundleCheckResult[]> {
  const candidates = generateCandidateBundleIds(cleanName);

  return Promise.all(
    candidates.map(async (bundleId) => {
      const [apple, play] = await Promise.all([
        checkAppleBundleId(bundleId),
        checkGooglePlayPackage(bundleId),
      ]);

      return {
        bundleId,
        appleStatus: apple.status,
        googlePlayStatus: play.status,
        appleApp: apple.app,
        googlePlayUrl: play.playUrl,
      };
    }),
  );
}

/**
 * Inspects a local Info.plist or .app bundle using macOS plutil or XML parsing
 */
export async function inspectLocalAppBundle(targetPath: string): Promise<AppIdentity> {
  let plistPath = targetPath;

  try {
    const stat = await fs.stat(/*turbopackIgnore: true*/ targetPath);
    if (stat.isDirectory()) {
      if (targetPath.endsWith(".app")) {
        const macosPlist = path.join(targetPath, "Contents", "Info.plist");
        const iosPlist = path.join(targetPath, "Info.plist");
        try {
          await fs.access(/*turbopackIgnore: true*/ macosPlist);
          plistPath = macosPlist;
        } catch {
          plistPath = iosPlist;
        }
      }
    }
  } catch {
    throw new Error(`Pfad nicht erreichbar: ${targetPath}`);
  }

  // Attempt plutil -convert json on macOS
  try {
    const { stdout } = await execFileAsync("/usr/bin/plutil", [
      "-convert",
      "json",
      "-o",
      "-",
      "--",
      plistPath,
    ]);
    const json = JSON.parse(stdout);
    return {
      bundleId: json.CFBundleIdentifier,
      displayName: json.CFBundleDisplayName || json.CFBundleName,
      bundleName: json.CFBundleName,
      version: json.CFBundleVersion,
      shortVersion: json.CFBundleShortVersionString,
      minOsVersion: json.LSMinimumSystemVersion || json.MinimumOSVersion,
      sourceType: "local-plist",
      sourcePath: plistPath,
    };
  } catch {
    // Fallback: Read text and extract with regex
    const content = await fs.readFile(/*turbopackIgnore: true*/ plistPath, "utf-8");
    const getTag = (key: string) => {
      const regex = new RegExp(`<key>${key}</key>\\s*<string>([^<]+)</string>`, "i");
      const match = content.match(regex);
      return match ? match[1] : undefined;
    };

    return {
      bundleId: getTag("CFBundleIdentifier"),
      displayName: getTag("CFBundleDisplayName") || getTag("CFBundleName"),
      bundleName: getTag("CFBundleName"),
      version: getTag("CFBundleVersion"),
      shortVersion: getTag("CFBundleShortVersionString"),
      minOsVersion: getTag("LSMinimumSystemVersion") || getTag("MinimumOSVersion"),
      sourceType: "local-plist",
      sourcePath: plistPath,
    };
  }
}
