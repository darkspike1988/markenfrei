import { NextResponse } from "next/server";
import { guardRequest } from "@/lib/rate-limit";
import {
  ClearanceInputError,
  performClearanceCheck,
  type ClearanceReport,
  type TldCheckResult,
  type AppStoreHit,
  type WikidataHit,
  type WikipediaHit,
  type DuckDuckGoHit,
  type GitHubRepoHit,
} from "@/lib/clearance";

export type {
  ClearanceReport,
  TldCheckResult,
  AppStoreHit,
  WikidataHit,
  WikipediaHit,
  DuckDuckGoHit,
  GitHubRepoHit,
};

export async function POST(req: Request) {
  const limited = guardRequest(req);
  if (limited) return limited;
  try {
    const body = await req.json();
    const report = await performClearanceCheck({
      name: body.name,
      tagline: body.tagline,
      category: body.category,
      description: body.description,
      keywords: body.keywords,
      tlds: body.tlds,
    });

    return NextResponse.json(report);
  } catch (err) {
    if (err instanceof ClearanceInputError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Fehler bei der Marken- & Domain-Prüfung",
      },
      { status: 500 },
    );
  }
}
