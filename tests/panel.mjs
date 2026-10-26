// מרכז השליטה: מפענח הסידור שהודבק (panel/parse.js). node tests/panel.mjs
import assert from "node:assert/strict";
import { parseWeek } from "../panel/parse.js";

// ההודעה לבוט מ-24.10.2026, כמו שהיא
const bot = parseWeek(`סידור לשבוע הבא 25.10–31.10
ראשון סגור
שני 17:00–19:00 נוגה
שלישי 9:00–13:00 אלה, ליה
שלישי 15:00–19:00 אלה, אלונה, ליה. נגה סטנד ביי (לא שעת פתיחה)
רביעי סגור
חמישי 17:00–19:00 אלה, ליה
שישי 9:00–12:00 לימור, אלונה
שבת 9:00–14:00 אלה, ליה
שבת 16:00–19:00 אלה, אלונה`);
assert.deepEqual(bot.closed.sort(), [0, 3]);
assert.deepEqual(bot.shifts[0], { day: 1, start: "17:00", end: "19:00", people: ["נוגה"], open: true });
assert.deepEqual(bot.shifts[1].people, ["אלה", "ליה"]);
assert.deepEqual(bot.shifts[2], { day: 2, start: "15:00", end: "19:00", people: ["אלה", "אלונה", "ליה"], open: true });
assert.deepEqual(bot.shifts[3], { day: 2, start: "15:00", end: "19:00", people: ["נגה"], open: false }, "standby in the same line becomes its own shift");
assert.deepEqual(bot.shifts.map((s) => s.day), [1, 2, 2, 2, 4, 5, 6, 6]);
assert.equal(bot.skipped.length, 0, bot.skipped.join(" | "));

// הסידור לצוות, עם שעות אישיות בתוך השורה, וסטנד ביי בשורה משלו
const team = parseWeek(`שלישי 27.10 · 15:00–19:00 · אלה (מ־14:45), אלונה 15:30–18:00, ליה 16:00–19:00
נגה בסטנד ביי
שבת 31.10 · 9:00–14:00 · אלה (מ־8:00), ליה 8:30–13:00
ראשון ורביעי סגור`);
assert.deepEqual(team.shifts[0], { day: 2, start: "15:00", end: "19:00", people: ["אלה", "אלונה", "ליה"], open: true });
assert.deepEqual(team.shifts[1], { day: 2, start: "15:00", end: "19:00", people: ["נגה"], open: false });
assert.deepEqual(team.shifts[2].people, ["אלה", "ליה"]);
assert.deepEqual(team.closed.sort(), [0, 3]);

// קיצורים ושעות בלי דקות
const short = parseWeek("ה' 17-19 ליה\nיום שישי 9.00-12.00 לימור ואלונה");
assert.deepEqual(short.shifts[0], { day: 4, start: "17:00", end: "19:00", people: ["ליה"], open: true });
assert.deepEqual(short.shifts[1].people, ["לימור", "אלונה"]);

// שעה הפוכה לא נכנסת, והשורה מדווחת
assert.equal(parseWeek("שני 19:00–17:00 נוגה").shifts.length, 0);
assert.equal(parseWeek("שני 19:00–17:00 נוגה").skipped.length, 1);

// מקרי הסקירה (24.10.2026): שם שהוא גם יום, כמה טווחים, כמה ימים, סטנד ביי של אדם אחד, שעות של 12, "סגור" באמצע שורה
{
  const a = parseWeek("שלישי 9-13 אלה, שני\n17-19 שני");
  assert.deepEqual(a.shifts[0], { day: 2, start: "09:00", end: "13:00", people: ["אלה", "שני"], open: true }, "Shani is a name after the hours");
  assert.deepEqual(a.shifts[1], { day: 2, start: "17:00", end: "19:00", people: ["שני"], open: true }, "a continuation line stays on Tuesday");
  const b = parseWeek("שני 9-13, 17-19 נוגה");
  assert.deepEqual(b.shifts.map((s) => [s.day, s.start, s.end, s.people]), [[1, "09:00", "13:00", ["נוגה"]], [1, "17:00", "19:00", ["נוגה"]]]);
  const c = parseWeek("רביעי ושישי 17-19 ליה");
  assert.deepEqual(c.shifts.map((s) => s.day), [3, 5]);
  const d = parseWeek("שני 17-19 נוגה, אלה סטנד ביי");
  assert.deepEqual(d.shifts, [{ day: 1, start: "17:00", end: "19:00", people: ["נוגה"], open: true }, { day: 1, start: "17:00", end: "19:00", people: ["אלה"], open: false }]);
  const e = parseWeek("שני 5-7 נוגה");
  assert.deepEqual([e.shifts[0].start, e.shifts[0].end], ["17:00", "19:00"], "the cart never opens before 07:00, so 5-7 is evening");
  const f = parseWeek("שני סגור, שלישי 17-19 ליה");
  assert.deepEqual(f.closed, [1]);
  assert.deepEqual(f.shifts.map((s) => s.day), [2]);
  assert.deepEqual(parseWeek("שלישי לא סגור").closed, [], "not closed is not closed");
}

console.log("ok (panel parser)");

// יעדי הרשתות (panel/goals.js): שבוע = ראשון עד אתמול, מתוך insights של הבוט
{
  const { weekGoals } = await import("../panel/goals.js");
  const ig = { rows: [["2026-10-24", 775, 2, 4], ["2026-10-25", 2222, 20, 0], ["2026-10-26", 1630, 18, 9]].map(([day, views, interactions, follower_gain]) => ({ day, views, interactions, follower_gain })) };
  const I = { account: { rows: [{ network: "instagram", followers: 693 }] }, ig, fb: { rows: [{ day: "2026-10-25", follows: 1, unfollows: 0 }] },
    posts: { rows: [{ network: "instagram", kind: "carousel", at: "2026-10-25T17:31:11.000Z", shares: 2 }, { network: "instagram", kind: "reel", at: "2026-10-19T05:31:18.000Z", shares: 1 }] } };
  const g = weekGoals(I, "2026-10-26");
  assert.equal(g.sunday, "2026-10-25"); assert.equal(g.end, "2026-10-25"); assert.equal(g.days, 1);
  const by = Object.fromEntries(g.rows.map((r) => [r.id, r]));
  assert.equal(by.ig_views.actual, 2222, "today (partial) is not counted");
  assert.equal(by.ig_follow.actual, 0); assert.equal(by.ig_follow.expected, 2); assert.equal(by.ig_follow.status, "מאחור");
  assert.equal(by.shares.actual, 2); assert.equal(by.reels.actual, 0, "last week's reel is not this week's");
  assert.equal(by.fb_follow.actual, 1); assert.equal(by.ig_views.status, "בקצב");
  assert.equal(g.month.actual, 693); assert.equal(g.daysRows.length, 7); assert.equal(g.daysRows[6].day, "2026-10-25");
  assert.deepEqual(g.daysRows[6].went, ["carousel"]);
  // ביום ראשון השבוע הוא השבוע שהסתיים אתמול, שבת
  assert.equal(weekGoals(I, "2026-10-25").days, 7);
}
console.log("ok (panel goals)");
