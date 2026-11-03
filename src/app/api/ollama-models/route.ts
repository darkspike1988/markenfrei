import { NextResponse } from "next/server";

export async function GET() {
  try {
    const res = await fetch("http://localhost:11434/api/tags", {
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) {
      return NextResponse.json({ running: false, models: [] });
    }
    const data = await res.json();
    const models = Array.isArray(data?.models)
      ? data.models.map((m: { name?: string }) => String(m.name || "")).filter(Boolean)
      : [];
    return NextResponse.json({ running: true, models });
  } catch {
    return NextResponse.json({ running: false, models: [] });
  }
}
