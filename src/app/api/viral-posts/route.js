import { NextResponse } from "next/server";
import { query, tableExists } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

// GET /api/viral-posts?q=&limit= — scraped source posts.
export async function GET(request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await tableExists("viral_posts"))) {
    return NextResponse.json({ posts: [], pipelineReady: false });
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 500);

  let rows;
  if (q) {
    ({ rows } = await query(
      `SELECT id, fb_post_id, page_name, post_url, caption, likes_count,
              shares_count, media_type, created_at
         FROM viral_posts
        WHERE caption ILIKE $1 OR page_name ILIKE $1
        ORDER BY created_at DESC
        LIMIT $2`,
      [`%${q}%`, limit]
    ));
  } else {
    ({ rows } = await query(
      `SELECT id, fb_post_id, page_name, post_url, caption, likes_count,
              shares_count, media_type, created_at
         FROM viral_posts
        ORDER BY created_at DESC
        LIMIT $1`,
      [limit]
    ));
  }
  return NextResponse.json({ posts: rows, pipelineReady: true });
}
