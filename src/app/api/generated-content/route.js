import { NextResponse } from "next/server";
import { query, tableExists } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

// GET /api/generated-content?status=&limit= — AI rewrites and publish status.
export async function GET(request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (
    !(await tableExists("generated_content")) ||
    !(await tableExists("viral_posts"))
  ) {
    return NextResponse.json({ items: [], pipelineReady: false });
  }

  const { searchParams } = new URL(request.url);
  const status = (searchParams.get("status") || "").trim();
  const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 500);

  const valid = ["pending", "posted", "failed", "skipped"];
  let rows;
  if (valid.includes(status)) {
    ({ rows } = await query(
      `SELECT g.id, g.status, g.model_used, g.fb_publish_id, g.posted_at,
              g.created_at, g.ai_generated_caption, v.page_name, v.post_url
         FROM generated_content g
         JOIN viral_posts v ON v.id = g.post_id
        WHERE g.status = $1
        ORDER BY g.created_at DESC
        LIMIT $2`,
      [status, limit]
    ));
  } else {
    ({ rows } = await query(
      `SELECT g.id, g.status, g.model_used, g.fb_publish_id, g.posted_at,
              g.created_at, g.ai_generated_caption, v.page_name, v.post_url
         FROM generated_content g
         JOIN viral_posts v ON v.id = g.post_id
        ORDER BY g.created_at DESC
        LIMIT $1`,
      [limit]
    ));
  }
  return NextResponse.json({ items: rows, pipelineReady: true });
}
