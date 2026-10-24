# בדיקות

```bash
node tests/run.mjs
```

צריך `playwright` ו-`http-server` (גלובלית זה בסדר) בשביל `hours.mjs`.

| קובץ | מה |
|---|---|
| `worker.mjs` | השרת על הקוד האמיתי: תרגום שגיאות, נתיבי הבוט (שעות, פוסט, ריל, סטורי, צוות, תור), החלון המתגלגל של פייסבוק וגוגל |
| `admins.mjs` | רשימת המייסדים זהה ב-`config.js`, `firestore.rules`, `storage.rules` והשרת, וכללי המנהלים |
| `hours.mjs` | דף העגלה: מה שהוא מצייר מ-`public/hours`, האפייה ל-HTML, הגופנים, הכתובות הישנות ו-`sw.js` |
