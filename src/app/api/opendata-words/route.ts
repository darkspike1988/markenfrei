import { NextResponse } from "next/server";
import { guardRequest } from "@/lib/rate-limit";
import { discoverOpenDataWords } from "@/lib/opendata";

export async function POST(req: Request) {
  const limited = guardRequest(req);
  if (limited) return limited;
  try {
    const body = await req.json();
    const keywords = Array.isArray(body.keywords)
      ? body.keywords
      : String(body.keywords || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);

    const field = await discoverOpenDataWords({
      keywords,
      description: body.description || "",
      brandSeed: body.brandSeed || "",
      maxLen: Number(body.maxLen) || 11,
      avoid: Array.isArray(body.avoid) ? body.avoid : [],
    });

    return NextResponse.json(field);
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Open-Data Abfrage fehlgeschlagen",
      },
      { status: 500 },
    );
  }
}
