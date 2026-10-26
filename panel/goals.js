// יעדי הרשתות לשבוע, מתוך נתוני Meta שהבוט מחזיר (insights): שבוע = ראשון עד אתמול.
// היעדים נקבעו לפי הקצב של אוקטובר 2026; משנים כאן ובמקום אחד בלבד.
export const GOALS = [
  { id: "ig_follow", name: "עוקבים חדשים באינסטגרם", goal: 10 },
  { id: "reels", name: "רילים באינסטגרם", goal: 3 },
  { id: "ig_views", name: "צפיות באינסטגרם", goal: 7000 },
  { id: "ig_actions", name: "לייקים, תגובות ושמירות", goal: 80 },
  { id: "shares", name: "שיתופים", goal: 10 },
  { id: "fb_follow", name: "עוקבים חדשים בפייסבוק", goal: 3 },
];
export const MONTH = { id: "ig_total", name: "עוקבים באינסטגרם", goal: 750, by: "2026-11-30" };

const shift = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const dow = (d) => new Date(d + "T00:00:00Z").getUTCDay();

export function weekGoals(I, today) {
  const end = shift(today, -1), sunday = shift(end, -dow(end)), days = dow(end) + 1;
  const ig = (I?.ig?.rows || []).filter((r) => r.day <= end), fb = (I?.fb?.rows || []).filter((r) => r.day <= end);
  const sum = (rows, f, from) => rows.filter((r) => r.day >= from).reduce((s, r) => s + (r[f] || 0), 0);
  const posts = (I?.posts?.rows || []).filter((p) => { const d = String(p.at).slice(0, 10); return d >= sunday && d <= end; });
  const actual = {
    ig_follow: sum(ig, "follower_gain", sunday),
    reels: posts.filter((p) => p.network === "instagram" && p.kind === "reel").length,
    ig_views: sum(ig, "views", sunday),
    ig_actions: sum(ig, "interactions", sunday),
    shares: posts.reduce((s, p) => s + (p.shares || 0), 0),
    fb_follow: sum(fb, "follows", sunday) - sum(fb, "unfollows", sunday),
  };
  const rows = GOALS.map((g) => {
    const expected = Math.ceil((g.goal * days) / 7), a = actual[g.id];
    return { ...g, actual: a, expected, status: a >= g.goal ? "הושג" : a >= expected ? "בקצב" : "מאחור" };
  });
  // יעד החודש: הקצב של 14 הימים האחרונים מול מה שצריך כל יום עד התאריך
  const now = (I?.account?.rows || []).find((r) => r.network === "instagram")?.followers;
  const left = Math.max(1, Math.round((Date.parse(MONTH.by) - Date.parse(end)) / 864e5));
  const pace = Math.round((sum(ig, "follower_gain", shift(end, -13)) / 14) * 10) / 10;
  const need = now == null ? null : Math.round((Math.max(0, MONTH.goal - now) / left) * 10) / 10;
  const month = { ...MONTH, actual: now ?? null, pace, need, status: now == null ? "לא זמין" : now >= MONTH.goal ? "הושג" : pace >= need ? "בקצב" : "מאחור" };
  // שבעת הימים האחרונים
  const daysRows = [];
  for (let i = 6; i >= 0; i--) {
    const day = shift(end, -i), r = ig.find((x) => x.day === day) || {}, f = fb.find((x) => x.day === day) || {};
    const went = [...new Set((I?.posts?.rows || []).filter((p) => p.network === "instagram" && String(p.at).slice(0, 10) === day).map((p) => p.kind))];
    daysRows.push({ day, views: r.views ?? null, gained: r.follower_gain ?? null, fb: f.follows == null ? null : (f.follows || 0) - (f.unfollows || 0), went });
  }
  return { sunday, end, days, rows, month, daysRows };
}
