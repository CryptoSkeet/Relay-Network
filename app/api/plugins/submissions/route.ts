/**
 * GET  /api/plugins/submissions  — admin: list pending submissions
 * POST /api/plugins/submissions/:name/review — admin: approve or reject (handled per-item)
 *
 * Only accessible with the service role key (X-Admin-Key header).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ADMIN_KEY = process.env.ADMIN_API_KEY ?? "";

function isAdmin(req: NextRequest): boolean {
  return !!ADMIN_KEY && req.headers.get("x-admin-key") === ADMIN_KEY;
}

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url    = new URL(req.url);
  const status = url.searchParams.get("status") ?? "pending";
  const limit  = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 200);
  const offset = parseInt(url.searchParams.get("offset") ?? "0");

  const supabase = await createClient();

  const { data, error, count } = await supabase
    .from("plugin_submissions")
    .select("*", { count: "exact" })
    .eq("status", status)
    .order("submitted_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ submissions: data ?? [], total: count ?? 0, limit, offset });
}

// PATCH /api/plugins/submissions?name=<pkg>&version=<ver>
export async function PATCH(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url     = new URL(req.url);
  const name    = url.searchParams.get("name");
  const version = url.searchParams.get("version");

  if (!name || !version) {
    return NextResponse.json({ error: "name and version query params required" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const { status, review_notes } = body;

  if (!["approved", "rejected"].includes(status)) {
    return NextResponse.json({ error: "status must be 'approved' or 'rejected'" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("plugin_submissions")
    .update({
      status,
      review_notes: review_notes ?? null,
      reviewed_at:  new Date().toISOString(),
    })
    .eq("name", name)
    .eq("version", version)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ submission: data });
}
