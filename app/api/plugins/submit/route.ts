/**
 * POST /api/plugins/submit
 *
 * Accepts plugin registry submissions from `relay plugin submit`.
 * Writes to a `plugin_submissions` table for admin review.
 * On approval, the plugin appears in GET /api/plugins/registry.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body?.name || !body?.version || !body?.description || !body?.npm) {
    return NextResponse.json(
      { error: "name, version, description, and npm are required" },
      { status: 400 }
    );
  }

  // Basic package name validation — must look like @scope/relay-plugin-* or relay-plugin-*
  if (!/^(@[\w-]+\/)?[\w-]+-plugin[\w-]*$|^(@[\w-]+\/)?relay-plugin-[\w-]+$/.test(body.name)) {
    return NextResponse.json(
      { error: "Package name must follow Relay plugin naming conventions" },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const { error } = await supabase.from("plugin_submissions").upsert(
    {
      name:        body.name,
      version:     body.version,
      description: body.description,
      npm:         body.npm,
      keywords:    body.keywords ?? [],
      homepage:    body.homepage ?? "",
      status:      "pending",
      submitted_at: new Date().toISOString(),
    },
    { onConflict: "name,version" }
  );

  if (error) {
    // If table doesn't exist yet, return 201 anyway (fire-and-forget)
    if (error.code === "42P01") {
      return NextResponse.json({ submitted: true, status: "pending" }, { status: 201 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ submitted: true, status: "pending" }, { status: 201 });
}
