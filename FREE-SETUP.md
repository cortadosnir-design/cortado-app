# ההגדרה החינמית — שרת, AI ופרסום

שלושה חשבונות חינמיים, בלי כרטיס אשראי. אחרי זה הכל רץ מהאפליקציה.
סדר מומלץ: 1 → 2 → 3. בסך הכל כ-25 דקות.

---

## 1. השרת — Cloudflare Worker (10 דקות)

1. פותחים חשבון חינמי ב-**dash.cloudflare.com/sign-up** (מייל + סיסמה, בלי כרטיס).
2. בתפריט: **Workers & Pages ← Create ← Create Worker**.
3. שם: `cortado-api` ← **Deploy** (מתפרסם קוד ריק, זה בסדר).
4. **Edit code** ← מוחקים את כל מה שבעורך ← מדביקים את כל התוכן של `worker/src/index.js` ← **Deploy**.
5. חוזרים לעמוד ה-Worker ← **Settings ← Variables and Secrets ← Add**. מוסיפים:

   | Type | Name | Value |
   |---|---|---|
   | Text | `FIREBASE_PROJECT_ID` | `cortado-ops` |
   | Text | `GEMINI_MODEL` | `gemini-2.5-flash` |
   | Text | `ALLOWED_ORIGINS` | `https://cortadosnir-design.github.io` |
   | Secret | `GEMINI_API_KEY` | מהשלב הבא |
   | Secret | `FB_APP_ID` | מהשלב 3 |
   | Secret | `FB_APP_SECRET` | מהשלב 3 |
   | Secret | `FB_PAGE_ID` | מהשלב 3 |
   | Secret | `FB_PAGE_TOKEN` | מהשלב 3 |
   | Secret | `IG_USER_ID` | מהשלב 3 (אם יש אינסטגרם עסקי) |

6. הכתובת של ה-Worker מופיעה למעלה, בצורה `https://cortado-api.<שם>.workers.dev`.
   **מעתיקים אותה** לתוך `config.js` באפליקציה:
   `export const WORKER_URL = "https://cortado-api.<שם>.workers.dev";`
   ומעלים את `config.js` המעודכן ל-GitHub. הכפתורים החכמים יופיעו באפליקציה.

בדיקה: פותחים בדפדפן `https://cortado-api.<שם>.workers.dev/health` ← אמור להופיע `{"ok":true}`.

## 2. הכתיבה — מפתח Gemini (2 דקות)

1. **aistudio.google.com/app/apikey** ← Create API key ← בוחרים פרויקט (אפשר את `cortado-ops`).
2. מעתיקים את המפתח ← ב-Cloudflare מוסיפים אותו כ-Secret בשם `GEMINI_API_KEY`.

הרמה החינמית מספיקה לעשרות פוסטים ביום. לא צריך כרטיס.

## 3. פרסום — אפליקציית Meta (10 דקות)

זה נראה מפחיד, אבל זה רק חשבון מפתח על העמוד שלך. **אין צורך באישור מ-Meta** כשמפרסמים לעמוד שאתה מנהל.

1. **developers.facebook.com** ← מתחברים עם הפייסבוק שלך ← **My Apps ← Create App**.
2. סוג: **Other** ← **Business** ← שם `Cortado Ops` ← Create.
3. **App settings ← Basic**: מעתיקים **App ID** ו-**App Secret** (Show) ← ב-Cloudflare מוסיפים כ-Secrets `FB_APP_ID` ו-`FB_APP_SECRET`.
4. **Tools ← Graph API Explorer** ← למעלה מימין בוחרים את האפליקציה `Cortado Ops`.
5. ב-**Permissions** מוסיפים: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `pages_manage_metadata`, `instagram_basic`, `instagram_content_publish`, `business_management`.
6. **Generate Access Token** ← מאשרים בחלון של פייסבוק ← מעתיקים את הטוקן (הוא קצר, תקף לשעה).
7. באפליקציה שלך, בלשונית **פרסום**, יופיע כפתור **"חבר עמוד פייסבוק"** (מופיע כש-`WORKER_URL` מוגדר אבל עדיין אין עמוד). מדביקים בו את הטוקן ← האפליקציה מחזירה `FB_PAGE_ID`, `FB_PAGE_TOKEN` ו-`IG_USER_ID` **ארוכי טווח**.
8. מעתיקים אותם ל-Cloudflare כ-Secrets. זהו. הטוקן של העמוד לא פג.

אם אין כפתור כזה עדיין באפליקציה, אפשר לעשות את שלב 7 עם כל כלי שיודע לשלוח POST ל-`<WORKER_URL>/setup/pages` עם `{"userToken":"..."}` ועם טוקן הכניסה של האפליקציה — או לבקש מ-Claude.

## 4. שעות בגוגל (בקשה חינמית, לוקחת זמן)

עדכון שעות בפרופיל העסק בגוגל דורש אישור גישה ל-Business Profile API.
**הקוד כבר בנוי** — הנתיב `/hours/google` ב-Worker ו-"שגר" קורא לו אוטומטית. חסר רק האישור.

1. **לבדוק אם זה כבר מאושר:** Cloud Console ← APIs & Services ← Quotas על
   `mybusinessbusinessinformation.googleapis.com`. **0 QPM** = לא אושר, **300 QPM** = אושר.
2. אם לא: מפעילים ב-Library את `My Business Business Information API`,
   `My Business Account Management API` ו-`Google My Business API`, וממלאים את
   [טופס הבקשה](https://support.google.com/business/workflow/16726127).
   גוגל מצהירה על 7–10 ימי עסקים; בפועל 4 ימים עד 6 שבועות.
3. כשיאושר, מוסיפים ב-Cloudflare ארבעה משתנים ואין מה לשנות בקוד:

   | Type | Name | מאיפה |
   |---|---|---|
   | Text | `GB_LOCATION` | `locations/<id>` מ-Account Management API |
   | Secret | `GB_CLIENT_ID` | OAuth client ב-Cloud Console |
   | Secret | `GB_CLIENT_SECRET` | שם |
   | Secret | `GB_REFRESH_TOKEN` | מונפק פעם אחת בהסכמת הבעלים, לא פג |

עד אז "שגר" מציג "הדבקה ידנית" ונותן את הטקסט מוכן. זו לא תקלה.

---

## מה קורה אחרי ההגדרה

| כפתור באפליקציה | מה הוא עושה |
|---|---|
| ✨ כתוב לי פוסט | Gemini כותב לפי סוג התוכן, הרעיון, החג והשעות |
| ✨ בנה לי שבועיים | 6–8 פוסטים מוכנים נכנסים ללוח כטיוטות |
| פרסם בפייסבוק / באינסטגרם | מתפרסם ישירות מהאפליקציה |
| ✨ נתח לי את הנתונים | תובנות מיומן המשמרות |
| עדכן שעות בכל מקום | שדה השעות בפייסבוק + פוסט שעות + דף השעות הציבורי (`hours.html`) |

**דף השעות הציבורי:** `https://cortadosnir-design.github.io/cortado-app/hours.html` — אפשר לקשר אליו מדף הנחיתה או להטמיע אותו בתוכו (iframe). הוא מתעדכן לבד.
