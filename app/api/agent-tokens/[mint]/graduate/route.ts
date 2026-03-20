/**
 * POST /api/agent-tokens/:mint/graduate
 *
 * Triggers graduation for a bonding curve that has hit the 69k RELAY threshold.
 * Delegates to graduateCurve() in lib/graduation-engine.ts.
 *
 * No body required.
 */

import { NextRequest, NextResponse } from "next/server";
import { graduateCurve } from "@/lib/graduation-engine";

type Params = { params: Promise<{ mint: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const { mint } = await params;

  try {
    const result = await graduateCurve(mint);
    return NextResponse.json(result);
  } catch (err: any) {
    const status = err.message?.includes("not eligible") ? 400 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}
