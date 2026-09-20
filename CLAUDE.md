# CLAUDE.md — כללי עבודה קבועים במאגר הזה

קובץ זה נועד לכל סשן עתידי של Claude במאגר `cortadosnir-design/cortado-app`.
קרא אותו לפני כל שינוי.

---

## 0. ההקשר הקבוע — הכול עובר דרך הפרויקט הזה

כל בקשה בסשן הזה ובסשנים הבאים שייכת לפרויקט **עגלת הקפה קורטדו**
ומתבצעת בתוך המאגר הזה (`cortadosnir-design/cortado-app`) — גם כשלא אומרים
את זה במפורש. "האפליקציה", "האתר", "השרת", "הכללים", "השיבוץ" — הכול כאן.

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
git push -u origin main
```

הסיבה: הפריסה האוטומטית (GitHub Actions) מגיבה רק לדחיפות ל-`main`.
שינוי שיושב בענף צדדי או ב-PR פתוח פשוט לא מגיע לאוויר.

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

## 3. רשימת הבעלים — חייבת להיות זהה בארבעה מקומות

הבעלים הם:

```
cortado.snir@gmail.com
limormelman@gmail.com
```

הרשימה הזו חייבת להופיע **זהה לחלוטין** בארבעת הקבצים האלה:

| קובץ | מה לעדכן |
|---|---|
| `config.js` | `OWNER_EMAILS` — מה שהדפדפן מציג |
| `firestore.rules` | `isOwner()` — מה שנאכף בפועל על הנתונים |
| `storage.rules` | `isOwner()` — נשמר לתיעוד גם אם Storage כבוי |
| `worker/src/index.js` | `DEFAULT_OWNERS` — או משתנה `OWNER_EMAILS` בלוח של Cloudflare |

**להוספה או הסרה של מנהל/ת: לעדכן את כל ארבעת המקומות באותו commit.**
עדכון חלקי יוצר מצב שבו הממשק מראה דבר אחד והכללים אוכפים דבר אחר.

---

## 4. פריסה אוטומטית

שני workflows, שניהם רצים על push ל-`main` (וגם ידנית ב-`workflow_dispatch`):

- **`.github/workflows/deploy.yml`** — "Deploy to Firebase".
  פורס hosting + Firestore rules לפרויקט `cortado-ops`.
  רץ על כל דחיפה ל-`main`.
- **`.github/workflows/worker.yml`** — "Deploy Worker".
  פורס את ה-Cloudflare Worker דרך `wrangler`.
  רץ רק כששינית קבצים תחת `worker/src/**`, את `worker/wrangler.toml`,
  או את ה-workflow עצמו.

אחרי כל דחיפה — לוודא ב-GitHub Actions ששתי הפריסות הרלוונטיות ירוקות.

**אין עותקים כפולים בשורש.** ה-workflows יושבים רק תחת
`.github/workflows/`, וקוד השרת יושב רק ב-`worker/src/index.js`.
אל תיצור `deploy.yml` או `index.js` בשורש המאגר — GitHub לא קורא אותם,
והם רק מתבלבלים עם המקור האמיתי ונשארים מאחור.
