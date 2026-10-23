# cortado-api — ה-Worker

נפרס אוטומטית מ-`.github/workflows/worker.yml` בכל דחיפה שנוגעת ב-`worker/`.
המשתנים והסודות יושבים בלוח של Cloudflare (Workers → cortado-api → Settings → Variables)
ולא בקוד. הפריסה מחליפה קוד בלבד (`keep_vars = true`).

## מה צריך להיות מוגדר

| שם | סוג | בשביל |
|---|---|---|
| `FIREBASE_PROJECT_ID` | var | אימות המשתמש (`cortado-ops`) |
| `ALLOWED_ORIGINS` | var | מאיזה אתרים מותר לקרוא |
| `GEMINI_API_KEY` | secret | כתיבה עם AI |
| `FB_APP_ID`, `FB_APP_SECRET` | secret | "חבר עמוד" — החלפת טוקן זמני בטוקן עמוד ארוך |
| `FB_PAGE_ID`, `FB_PAGE_TOKEN`, `IG_USER_ID` | (לא חובה) | "חבר עמוד" שומר אותם לבד ב-Firestore (`secrets/meta`). מה שמוגדר כאן מנצח |
| `FIREBASE_SA` | secret | **התור של אינסטגרם** — ראה למטה |
| `PLACES_API_KEY` | secret | `/hours/fromgoogle` — קריאת השעות מהפרופיל בגוגל. האפליקציה כבר לא קוראת לו. ראה למטה |
| `GB_*` | (לא חובה) | גוגל: שעות לפי תאריך, וביקורות ותשובות (דרך המחבר `/mcp/`). מתחברים פעם אחת ב-`/google/connect`, והשרת שומר ב-Firestore (`secrets/google`) את ה-client, ה-refresh token, החשבון והמיקום. נשמר רק אם מייסד אישר בגוגל, ומנצח את מה שמוגדר כאן |
| `BOT_KEY` | secret | **שעות מהבוט** — המפתח המשותף עם בוט קורטדו, בוט הוואטסאפ של הבעלים (`agala-bot`). אותו ערך בשני ה-Workers. בלי הסוד הנתיב סגור |

## תזמון פוסטים (`/publish/schedule` + הקרון)

> **סגור (410) מ-9.10.2026.** פוסטים יוצאים רק דרך בוט קורטדו (`/post/bot`). הקרון עדיין מפרסם לאינסטגרם את מה שכבר בתור.

"תזמן" באפליקציה שלח את הפוסט והתמונה לשרת. השרת:

1. מעלה את התמונה לעמוד הפייסבוק כפוסט מתוזמן — פייסבוק מפרסם לבד בזמן.
2. רושם על מסמך הפוסט ב-Firestore שאינסטגרם ממתין (`igPending`).
3. **הקרון** (`*/10 * * * *`) קורא את התור, ולכל פוסט שהגיע זמנו שולף
   מפייסבוק כתובת CDN טרייה של התמונה ומפרסם לאינסטגרם.

לאינסטגרם אין תזמון ב-API. כל "תזמון לאינסטגרם" בכל כלי בעולם הוא תור כזה.

### הסוד `FIREBASE_SA` — פעם אחת, ידנית

הקרון קורא וכותב ב-Firestore בלי משתמש מחובר, ולכן צריך חשבון שירות.
זה **אותו קובץ JSON** שכבר יושב ב-GitHub כ-`FIREBASE_SERVICE_ACCOUNT` (פורס את האתר).

1. Firebase Console → Project settings → Service accounts → **Generate new private key**
   (או להשתמש בקובץ הקיים אם שמרת אותו).
2. Cloudflare → Workers & Pages → cortado-api → Settings → Variables and Secrets →
   **Add** → Type: *Secret*, name: `FIREBASE_SA`, value: תוכן ה-JSON כולו.
3. Deploy (או פשוט לחכות לדחיפה הבאה).

בלי הסוד: פייסבוק מתוזמן כרגיל; אינסטגרם מתפרסם רק כשלוחצים "תזמן" על
פוסט שזמנו כבר הגיע (פרסום מיידי). האפליקציה אומרת את זה במפורש.

### הסוד `PLACES_API_KEY` — פעם אחת, ידנית

`/hours/fromgoogle` קורא את שעות הפתיחה מהפרופיל בגוגל (Places API). כפתור "משוך מגוגל"
באפליקציה הוסר (22.10.2026) — הנתיב נשאר בשרת. קריאה לא צריכה את האישור של Business Profile, רק מפתח.
מכסה חינמית: 1,000 קריאות בחודש.

1. https://console.cloud.google.com → למעלה: **New project** (פרויקט נפרד, **לא** `cortado-ops`).
   שתי סיבות: Firebase נשאר בתוכנית החינמית, ובעיקר — המפתח של Firebase (ב-`config.js`)
   גלוי לכל מבקר באתר ואין עליו הגבלת API (נבדק 29.9: הוא מגיע עד Places ונעצר רק כי
   השירות כבוי בפרויקט). הפעלת Places ב-`cortado-ops` הייתה נותנת לכל אחד להשתמש בו על חשבונך.
2. **Billing** → לחבר חשבון חיוב. גוגל דורשת כרטיס גם לשימוש חינמי.
3. APIs & Services → Library → **Places API (New)** → Enable.
4. APIs & Services → Credentials → **Create credentials → API key**.
   אחר כך: Edit → API restrictions → Restrict key → לסמן רק **Places API (New)**.
5. בטיחות, כדי שלא יהיה חיוב אף פעם: APIs & Services → Places API (New) → **Quotas** →
   להגביל ל-50 בקשות ביום.
6. Cloudflare → Workers & Pages → cortado-api → Settings → Variables and Secrets →
   **Add** → Type: *Secret*, name: `PLACES_API_KEY`, value: המפתח.

מזהה המקום של העגלה כבר בקוד. עסק אחר: משתנה `GOOGLE_PLACE_ID`.

## נקודות קצה

| נתיב | מה |
|---|---|
| `/health` | `{ok:true}` בלי אימות |
| `/ai/post` `/ai/week` `/ai/brief` `/ai/angle` `/ai/insights` | Gemini: כתיבה, תכנון שבוע, תחקיר, כיוון, תובנות |
| `/ai/analyze` `/ai/zreport` | Gemini: שאלה חופשית על טבלה, וקריאת דוח Z מצילום |
| `/insights/posts` | מושך חשיפה, לייקים ושיתופים ממטא לפוסטים שפורסמו |
| `/publish/schedule` | **סגור (410).** פוסטים — רק דרך `/post/bot` |
| `/publish/state` | מה מחובר: פייסבוק, אינסטגרם, התור |
| `/hours/facebook` `/hours/google` | **סגורים (410).** שעות יוצאות רק דרך `/hours/bot` ו-`/hours/refresh` |
| `/hours/fromgoogle` | שעות פתיחה: קריאה מהפרופיל בגוגל (`PLACES_API_KEY`) |
| `/hours/bot` | שעות פתיחה מבוט קורטדו: שבוע שלם, אחרי "כן" של הבעלים בוואטסאפ. מזדהה ב-`BOT_KEY` (כותרת `x-bot-key`), לא במשתמש. כותב `hoursOverride` לשבוע ומפרסם לדף הנחיתה, לפייסבוק ולגוגל. עם `shifts` גם הסידור: שעות ב-`weeks.botShifts` (נקרא לכולם), שמות ב-`botpeople/{wid}` (מנהלים בלבד). זה הכותב היחיד: גם כרטיס "היום" באפליקציה פותח הודעה מוכנה לבוט (`BOT_WA` ב-config.js) |
| `/hours/refresh` | הבוט קורא אחרי חצות: מפרסם מחדש מ-`public/hours` את השבוע המתגלגל לפייסבוק. מזדהה ב-`BOT_KEY` |
| `/queue/bot` | מה מחכה לצאת בבוט (סטורי, ריל, פרסום אוטומטי, לו״ז מתוזמן). הבוט שולח רק כשהתור משתנה, השרת שומר ב-`botqueue/now`, וכרטיס השעות באפליקציה מציג. מזדהה ב-`BOT_KEY` |
| `/status` `/setup/pages` | חיבור העמוד |
| `/mcp/<מפתח>` | מחבר ל-Claude (MCP, קריאה בלבד): `account`, `facebook_daily`, `instagram_daily`, `posts` ישירות מ-Graph API. בקוד רק ה-SHA-256 של המפתח (`MCP_KEY_SHA256`); המפתח עצמו אצל הבעלים, בהגדרת המחבר ב-Claude. מזין את דשבורד הפרסום |
