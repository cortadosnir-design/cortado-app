# CLAUDE.md — כללי עבודה קבועים במאגר הזה

קובץ זה נועד לכל סשן עתידי של Claude במאגר `cortadosnir-design/cortado-app`.
קרא אותו לפני כל שינוי.

@AGENTS.md

---

## 0. ההקשר הקבוע — הכול עובר דרך הפרויקט הזה

כל בקשה בסשן הזה ובסשנים הבאים שייכת לפרויקט **עגלת הקפה קורטדו**
ומתבצעת בתוך המאגר הזה (`cortadosnir-design/cortado-app`) — גם כשלא אומרים
את זה במפורש. "האתר", "דף העגלה", "השרת", "הכללים" — הכול כאן. הבוט עצמו יושב במאגר
`cortadosnir-design/cortado-whatsapp`.

- ברירת המחדל: לעבוד בתוך המאגר ולפי הכללים בקובץ הזה, בלי לשאול מחדש מה ההקשר.
- לא לפתוח מאגר אחר, לא ליצור פרויקט צדדי ולא להעביר עבודה לכלים חיצוניים
  אלא אם התבקש במפורש.
- אם בקשה באמת לא קשורה למאגר — לוודא לפני שמתחילים, לא להניח.

---

## 1. דוחפים ישירות ל-main

כל שינוי נדחף **ישירות לענף `main`** — בלי pull request ובלי ענף צדדי.

```bash
git add -A
git commit -m "..."
git pull --rebase origin main
git push -u origin main
```

הסיבה: הפריסה האוטומטית (GitHub Actions) מגיבה רק לדחיפות ל-`main`.
שינוי שיושב בענף צדדי או ב-PR פתוח פשוט לא מגיע לאוויר.

ה-`pull --rebase` שלפני הדחיפה אינו רשות: גם הרובוט של שעות הפתיחה דוחף ל-`main`
(ראה §4), ודחיפה בלי למשוך קודם תידחה אם הוא הספיק לעדכן את השעות בינתיים.

---

## 2. אין Firebase Storage — הפרויקט על תוכנית Spark

פרויקט Firebase `cortado-ops` נמצא בתוכנית **Spark (חינמית)**, ובה
Cloud Storage **לא זמין**. לכן:

- **אסור** להשתמש ב-`uploadBytes`, `getDownloadURL`, `ref` של Storage,
  או בכל פונקציה אחרת מ-`firebase-storage.js`. קוד כזה ייכשל בזמן ריצה.
- **תמונות נשלחות ל-AI כ-data URL**: הדפדפן קורא את הקובץ
  (`FileReader.readAsDataURL`) ושולח את המחרוזת `data:image/...;base64,...`
  ישירות ל-Worker. ה-Worker ממיר אותה ל-`inlineData` עבור Gemini —
  ראה `imageParts()` ב-`worker/src/index.js`.
- לא מעלים שום קובץ לאחסון ולא שומרים כתובות הורדה.
- `storage.rules` נשאר במאגר לתיעוד ולעתיד, אבל **לא נפרס**:
  `.github/workflows/deploy.yml` פורס רק `hosting,firestore:rules`.
  אל תוסיף `storage` לפקודת הפריסה — זה יכשיל את ה-workflow.

---

## 3. שתי דרגות הרשאה: מייסד ומנהל

**מייסד** — רשימה קבועה בקוד. זו רצפת גישה שאי אפשר להסיר דרך הממשק:
גם אם מסמכי ה-members יימחקו או ישתבשו, שני החשבונות האלה נכנסים.
רק מייסדים ממנים ומסירים מנהלים.

```
cortado.snir@gmail.com
limormelman@gmail.com
```

הרשימה הזו חייבת להופיע **זהה לחלוטין** בארבעת המקומות האלה:

| קובץ | מה לעדכן |
|---|---|
| `config.js` | `FOUNDER_EMAILS` — רשימת המקור |
| `firestore.rules` | `isFounder()` — מה שנאכף בפועל על הנתונים |
| `storage.rules` | `isOwner()` — נשמר לתיעוד גם אם Storage כבוי |
| `worker/src/index.js` | `DEFAULT_OWNERS` — או `OWNER_EMAILS` בלוח של Cloudflare |

`tests/admins.mjs` נופל אם אחד מהם סוטה, אז אי אפשר לשכוח מקום.

**מנהל** — `admin: true` במסמך `members` שלו. `firestore.rules` (`adminOf`) ו-`worker/src/index.js`
(`isAdminUid`) מכירים בדגל הזה, ורק מייסדים יכולים לשנות אותו. אין היום מסך לזה: שינוי נעשה
ב-Firebase Console. בלי `FIREBASE_SA` השרת נכשל סגור ומכיר רק במייסדים.

---

## 4. פריסה אוטומטית

שני workflows רצים על push ל-`main` (וגם ידנית ב-`workflow_dispatch`):

- **`.github/workflows/deploy.yml`** — "Deploy to Firebase".
  פורס hosting + Firestore rules לפרויקט `cortado-ops`.
  רץ על כל דחיפה ל-`main`.
- **`.github/workflows/worker.yml`** — "Deploy Worker".
  פורס את ה-Cloudflare Worker דרך `wrangler`.
  רץ רק כששינית קבצים תחת `worker/src/**`, את `worker/wrangler.toml`,
  או את ה-workflow עצמו.

אחרי כל דחיפה — לוודא ב-GitHub Actions ששתי הפריסות הרלוונטיות ירוקות.

ושלישי רץ לבד, פעם בשעה:

- **`.github/workflows/hours.yml`** — "Bake opening hours".
  מריץ את `.github/scripts/bake-hours.mjs`, שקורא את `public/hours` וכותב את
  שעות השבוע הנוכחי לתוך `cafe/index.html`: לתאי הטבלה, לתווית "השעות לשבוע…"
  ול-JSON-LD. זה בשביל מי שקורא את הדף בלי JavaScript — מנועי חיפוש ועוזרי AI.
  כשהשעות השתנו הוא יוצר commit ל-`main` בשם `github-actions[bot]`.
  - **לא עורכים ביד** את תאי הטבלה `#hours`, את התווית שבתחילת `#hours-note`
    ואת `openingHoursSpecification`. הריצה הבאה תדרוס אותם.
  - מה שנאפה תמיד מתוארך (`data-week`, `validFrom`/`validThrough`), ו-`cafe.js`
    מוחק בדפדפן שעות של שבוע שעבר. שעות בלי תאריך ב-HTML מפילות את `tests/hours.mjs`.
  - commit של הרובוט לא מפעיל את `deploy.yml` לבד, ולכן `hours.yml` מפעיל אותו
    במפורש (`gh workflow run`) אחרי כל commit. כך גם העותק ב-Firebase מקבל את השעות
    האפויות תוך דקות. הכתובת הקנונית היא GitHub Pages.

**אין עותקים כפולים בשורש.** ה-workflows יושבים רק תחת
`.github/workflows/`, וקוד השרת יושב רק ב-`worker/src/index.js`.
אל תיצור `deploy.yml` או `index.js` בשורש המאגר — GitHub לא קורא אותם,
והם רק מתבלבלים עם המקור האמיתי ונשארים מאחור.

---

## 5. כותרות אבטחה — ה-CSP עדיין במצב דיווח

`firebase.json` מגדיר ארבע כותרות. שלוש נאכפות (`X-Frame-Options: DENY`,
`X-Content-Type-Options`, `Referrer-Policy`) — הן לא יכולות לשבור כלום.

הרביעית, **`Content-Security-Policy-Report-Only`**, מדווחת בלבד. היא נכתבה
בלי שאפשר היה לאמת אותה מול Firebase החי, ו-CSP שגוי שובר דף לגמרי — בלי שגיאה
שהמשתמש מבין. היא חלה רק על העותק ב-Firebase; GitHub Pages לא שולח כותרות.

**לפני שהופכים אותה ל-`Content-Security-Policy` (אכיפה):**

1. לפרוס ולפתוח את `https://cortado-ops.web.app/` (מפנה ל-`cafe/`) ואת `cafe-next/`.
2. לפתוח קונסולה ולחפש `Content Security Policy`.
3. אם הקונסולה נקייה — לשנות את שם המפתח ל-`Content-Security-Policy` ולדחוף.
4. אם יש הפרות — להוסיף את המקור שהיא מציינת, ולחזור לשלב 1.

הדבר שהכי סביר שיצוץ: `connect-src` ל-Firestore REST, שממנו דף העגלה קורא את `public/hours`.

**אין סקריפטים inline באף דף.** (`index.html`, `z.html` ו-`hours.html` הם רק הפניות לדף העגלה,
בלי סקריפט.) אם מוסיפים סקריפט inline — ה-CSP ייחסם אותו ביום שיאכף.

---

## 6. אין ממשק ניהול בדפדפן

מאז 23.10.2026 הכול עובר דרך בוט קורטדו בוואטסאפ: שעות, סידור, פוסטים, ריל, סטורי ורשימת
הצוות (`/team/bot/set`). המאגר הזה מחזיק את דף העגלה, את השרת, את כללי הנתונים ואת האפייה.

- **לא מוחקים את `sw.js`.** מכשיר שהתקין פעם את הממשק הישן מוריד אותו, מוחק את המטמון ומסיר
  את עצמו. בלי הקובץ, מכשיר כזה ממשיך להציג גרסה ישנה מהמטמון.
- הקוד המלא של הממשק שמור בהיסטוריה של `main`, ב-commit `1c53ba1` (`git show 1c53ba1:<קובץ>`). לא מחזירים ממנו קבצים בלי בקשה מפורשת.
- שינוי מבנה נתונים שהבוט כותב דרך השרת (`weeks`, `botpeople`, `botqueue`, `roster`,
  `public/hours`) נבדק מול `cortado-whatsapp` — שם הכותב.
