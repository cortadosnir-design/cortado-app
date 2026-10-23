# קורטדו — דף העגלה והשרת

הכול עובר דרך **בוט קורטדו** בוואטסאפ (מאגר `cortadosnir-design/cortado-whatsapp`):
שעות פתיחה, סידור משמרות, פוסטים, ריל, סטורי ורשימת הצוות. המאגר הזה מחזיק את מה שהבוט
נשען עליו, ואת מה שהלקוחות רואים.

| מה | איפה |
|---|---|
| דף העגלה ללקוחות | `cafe/` — <https://cortadosnir-design.github.io/cortado-app/cafe/> |
| השרת (cortado-api) | `worker/src/index.js` — מטא, גוגל, Gemini, Firestore. ראה `worker/README.md` |
| כללי הנתונים | `firestore.rules` |
| אפיית השעות ל-HTML | `.github/scripts/bake-hours.mjs`, פעם בשעה (`.github/workflows/hours.yml`) |
| הגדרות Firebase לדף העגלה | `config.js` |
| כתובות ישנות | `index.html`, `z.html`, `hours.html` — מפנים לדף העגלה |
| ניקוי התקנות ישנות | `sw.js` — מוחק מטמון ומסיר את עצמו. נשאר כאן |
| תצוגה מקדימה לעיצוב | `cafe-next/` |

## השרשרת

הבעלים כותב לבוט ← הבוט מכין טיוטה ← "כן" ← השרת מפרסם לדף העגלה, לפייסבוק, לאינסטגרם
ולגוגל ← קורא חזרה ורושם ב-Firestore ← הבוט שולח דוח. כל כשל חוזר לבוט.

## בדיקות

```bash
node tests/run.mjs
```

ראה `tests/README.md`. הפריסה (`.github/workflows/deploy.yml`) מריצה אותן לפני כל עלייה.

## היסטוריה

עד 23.10.2026 היה כאן גם ממשק ניהול בדפדפן. הקוד המלא שמור בענף `app-archive`.
