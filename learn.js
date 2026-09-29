// הלמידה מהפוסטים, ברקע. פעם בשעה (כשפותחים את קריאייטיב) מושכים ממטא את
// המספרים של פוסטים שפורסמו דרך האפליקציה, ומהם לומדים מתי הכי כדאי לפרסם.
// המספרים מזינים גם את "מה עובד" ואת הטיוטות של ה-AI. אין לזה מסך: היה ב"הפצה",
// שהוסר ב-29.9.2026, והלמידה נשארה.
import { S, db, fromYmd, api, WORKER_URL, doc, setDoc, serverTimestamp } from "./core.js";

const pullable = () => S.posts.filter(p => (p.fbPostId || p.igPostId) && p.date && fromYmd(p.date) <= new Date());
let pulledAt = 0;

async function pullNumbers(){
  const rows = pullable();
  if (!rows.length) return;
  try {
    const r = await api("/insights/posts", {
      posts: rows.slice(0, 30).map(p => ({ id: p.id, fbPostId: p.fbPostId || "", igPostId: p.igPostId || "" })),
    });
    let n = 0;
    for (const x of (r.posts || [])){
      if (x.error) continue;
      const was = S.posts.find(p => p.id === x.id);
      const old = (was && was.performance) || {};
      // לא דורסים מספר גבוה יותר שכבר נשמר: מטא מעדכנת באיחור, וירידה
      // פתאומית לאפס הייתה מרעילה את הלמידה.
      const v = { reach: Math.max(old.reach || 0, x.reach || 0),
                  likes: Math.max(old.likes || 0, x.likes || 0),
                  saves: Math.max(old.saves || 0, x.saves || 0), auto: true };
      if (v.reach === (old.reach || 0) && v.likes === (old.likes || 0) && v.saves === (old.saves || 0)) continue;
      await setDoc(doc(db, "posts", x.id), { performance: v }, { merge: true });
      n++;
    }
    pulledAt = Date.now();
    if (n) await relearnTiming();
  } catch {}
}

// השעות הכי טובות לכל רשת, מתוך 8 פוסטים לפחות. creative.bestTimes קורא את זה.
async function relearnTiming(){
  const out = {};
  for (const net of ["instagram","facebook"]){
    const rows = S.posts.filter(p => (p.network || []).includes(net) && p.performance && p.performance.reach > 0 && p.date && p.time);
    if (rows.length < 8) continue;
    const buckets = {};
    rows.forEach(p => {
      const k = fromYmd(p.date).getDay() + "|" + p.time.slice(0,2);
      (buckets[k] ||= []).push((p.performance.reach || 0) + ((p.performance.likes || 0) + (p.performance.saves || 0)) * 10);
    });
    const slots = Object.entries(buckets)
      .map(([k, vals]) => {
        const [d, hh] = k.split("|");
        return { day: +d, time: hh + ":00", score: vals.reduce((a,b) => a+b, 0) / vals.length, n: vals.length };
      })
      .sort((a,b) => b.score - a.score).slice(0, 5)
      .map((s, i) => ({ day: s.day, time: s.time, tier: i + 1, why: `${s.n} פוסטים, ביצוע ממוצע ${Math.round(s.score)}` }));
    out[net] = { slots, samples: rows.length };
  }
  if (Object.keys(out).length){
    try { await setDoc(doc(db, "brand", "timing"), { ...out, at: serverTimestamp() }, { merge: true }); } catch {}
  }
}

export function autoPull(){
  if (!S.isOwner || !WORKER_URL) return;
  if (Date.now() - pulledAt < 3600e3) return;
  pullNumbers();
}
