import { NextResponse } from "next/server";
import { query, one, tableExists } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

// GET /api/dashboard — headline metrics from the pipeline + admin tables.
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const hasPosts = await tableExists("viral_posts");
  const hasGen = await tableExists("generated_content");

  const data = {
    pipelineReady: hasPosts && hasGen,
    totalPosts: 0,
    totalGenerated: 0,
    postsLast7: 0,
    statusCounts: { posted: 0, pending: 0, failed: 0, skipped: 0 },
    publishRate: 0,
    topPages: [],
    recent: [],
    userCount: 0,
    roleCount: 0,
  };

  try {
    const u = await one(`SELECT COUNT(*)::int c FROM admin_users`);
    data.userCount = u.c;
    const r = await one(`SELECT COUNT(*)::int c FROM roles`);
    data.roleCount = r.c;

    if (hasPosts) {
      const tp = await one(`SELECT COUNT(*)::int c FROM viral_posts`);
      data.totalPosts = tp.c;
      const l7 = await one(
        `SELECT COUNT(*)::int c FROM viral_posts
          WHERE created_at >= NOW() - INTERVAL '7 days'`
      );
      data.postsLast7 = l7.c;
      const { rows: pages } = await query(
        `SELECT COALESCE(page_name,'(unknown)') AS page_name,
                COUNT(*)::int AS posts,
                COALESCE(SUM(likes_count),0)::bigint AS likes
           FROM viral_posts
          GROUP BY page_name
          ORDER BY posts DESC
          LIMIT 5`
      );
      data.topPages = pages.map((p) => ({
        page_name: p.page_name,
        posts: p.posts,
        likes: Number(p.likes),
      }));
    }

    if (hasGen) {
      const tg = await one(`SELECT COUNT(*)::int c FROM generated_content`);
      data.totalGenerated = tg.c;
      const { rows: sc } = await query(
        `SELECT status, COUNT(*)::int c FROM generated_content GROUP BY status`
      );
      for (const row of sc) {
        if (row.status in data.statusCounts) data.statusCounts[row.status] = row.c;
      }
      const posted = data.statusCounts.posted;
      data.publishRate =
        data.totalGenerated > 0
          ? Math.round((posted / data.totalGenerated) * 100)
          : 0;
    }

    if (hasPosts && hasGen) {
      const { rows: recent } = await query(
        `SELECT g.id, g.status, g.model_used, g.posted_at, g.created_at,
                g.ai_generated_caption, v.page_name, v.likes_count, v.shares_count
           FROM generated_content g
           JOIN viral_posts v ON v.id = g.post_id
          ORDER BY g.created_at DESC
          LIMIT 8`
      );
      data.recent = recent;
    }
  } catch (err) {
    console.error("dashboard error", err);
  }

  return NextResponse.json(data);
}
