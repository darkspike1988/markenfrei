import { NextResponse } from "next/server";
import {
  checkAppleBundleId,
  checkGooglePlayPackage,
  inspectLocalAppBundle,
  type AppIdentity,
} from "@/lib/rea";
import { analyzeTrademarkSafety } from "@/lib/phonetics";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const appPath = typeof body.appPath === "string" ? body.appPath.trim() : "";
    const bundleId = typeof body.bundleId === "string" ? body.bundleId.trim() : "";

    let identity: AppIdentity | null = null;

    if (appPath) {
      try {
        identity = await inspectLocalAppBundle(appPath);
      } catch (err) {
        return NextResponse.json(
          { error: `App-Paket konnte nicht gelesen werden: ${(err as Error).message}` },
          { status: 400 },
        );
      }
    } else if (bundleId) {
      // Derive candidate display name from bundle ID (e.g. "de.firma.wachwerk" -> "wachwerk")
      const segments = bundleId.split(".").filter(Boolean);
      const lastSeg = segments[segments.length - 1] || "app";
      const derivedName = lastSeg === "app" && segments.length > 2
        ? segments[segments.length - 2]
        : lastSeg;

      identity = {
        bundleId,
        displayName: derivedName,
        bundleName: derivedName,
        sourceType: "manual-id",
      };
    } else {
      return NextResponse.json(
        { error: "Bitte entweder 'appPath' oder 'bundleId' angeben." },
        { status: 400 },
      );
    }

    const targetBundleId = identity.bundleId || "";
    const appName = identity.displayName || identity.bundleName || "Unbekannt";

    // Run parallel live checks against Apple App Store and Google Play
    const [appleCheck, playCheck] = await Promise.all([
      targetBundleId ? checkAppleBundleId(targetBundleId) : Promise.resolve({ status: "unknown" as const }),
      targetBundleId ? checkGooglePlayPackage(targetBundleId) : Promise.resolve({ status: "unknown" as const }),
    ]);

    // Run Trademark analysis on the extracted app name
    const trademark = analyzeTrademarkSafety(appName);

    return NextResponse.json({
      identity,
      stores: {
        appleAppStore: appleCheck,
        googlePlay: playCheck,
      },
      trademark,
      verdict:
        appleCheck.status === "taken" || playCheck.status === "taken"
          ? "kollision"
          : trademark.protectedCollisions.length > 0
            ? "markenkonflikt"
            : "frei",
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "Fehler bei der App-Inspektion" },
      { status: 500 },
    );
  }
}
