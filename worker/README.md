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
| `FB_PAGE_ID`, `FB_PAGE_TOKEN` | var, secret | פרסום ושעות בפייסבוק |
| `IG_USER_ID` | var | פרסום לאינסטגרם |
| `FIREBASE_SA` | secret | **התור של אינסטגרם** — ראה למטה |
| `GB_*` (ארבעה) | secret | שעות בגוגל, אחרי אישור ה-API |

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

## נקודות קצה

| נתיב | מה |
|---|---|
| `/health` | `{ok:true}` בלי אימות |
| `/ai/post` `/ai/week` `/ai/brief` `/ai/angle` `/ai/insights` | Gemini |
| `/publish/schedule` | פוסט + תמונה + זמן → פייסבוק מתוזמן, אינסטגרם בתור |
| `/publish/state` | מה מחובר: פייסבוק, אינסטגרם, התור |
| `/publish/facebook` `/publish/instagram` | פרסום מיידי עם כתובת תמונה חיצונית |
| `/hours/facebook` `/hours/google` | שעות פתיחה |
| `/status` `/setup/pages` | חיבור העמוד |
