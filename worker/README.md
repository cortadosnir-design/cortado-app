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
| `PLACES_API_KEY` | secret | **"משוך מגוגל"** — קריאת השעות מהפרופיל בגוגל. ראה למטה |
| `GB_*` (ארבעה) | secret | כתיבת שעות לגוגל, אחרי אישור ה-API (לא נחוץ כשגוגל היא המקור) |
| `BOT_KEY` | secret | **שעות מהבוט** — המפתח המשותף עם שולה, בוט הוואטסאפ של הבעלים (`agala-shula`). אותו ערך בשני ה-Workers. בלי הסוד הנתיב סגור |

## תזמון פוסטים (`/publish/schedule` + הקרון)

"תזמן" באפליקציה שולח את הפוסט והתמונה לשרת. השרת:

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

"משוך מגוגל" קורא את שעות הפתיחה מהפרופיל בגוגל (Places API) ומפיץ לדף
הנחיתה ולפייסבוק. קריאה לא צריכה את האישור של Business Profile, רק מפתח.
מכסה חינמית: 1,000 קריאות בחודש. לחיצה פעם בשבוע רחוקה מזה.

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
| `/publish/schedule` | פוסט + תמונה + זמן → פייסבוק מתוזמן, אינסטגרם בתור |
| `/publish/state` | מה מחובר: פייסבוק, אינסטגרם, התור |
| `/hours/facebook` `/hours/google` | שעות פתיחה: כתיבה |
| `/hours/fromgoogle` | שעות פתיחה: קריאה מהפרופיל בגוגל (`PLACES_API_KEY`) |
| `/hours/bot` | שעות פתיחה משולה: שבוע שלם, אחרי "כן" של הבעלים בוואטסאפ. מזדהה ב-`BOT_KEY` (כותרת `x-bot-key`), לא במשתמש. כותב `hoursOverride` לשבוע ומפרסם לדף הנחיתה ולפייסבוק, כמו `hoursync.js` |
| `/status` `/setup/pages` | חיבור העמוד |
