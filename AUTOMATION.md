# עדכונים אוטומטיים

אחרי ההגדרה החד-פעמית הזו, כל שינוי בקוד מגיע לבד לאפליקציה: Claude דוחף ל-GitHub,
ו-GitHub מפרסם ל-Firebase (אתר + כללי אבטחה). אין יותר העלאת קבצים או הדבקת כללים.

## א. לתת ל-Claude גישה למאגר (פעם אחת)

1. ב-claude.ai: **הגדרות ← Integrations / Connectors ← GitHub ← Connect**, ומאשרים את היישום
   על החשבון `cortadosnir-design` (אפשר לבחור רק את המאגרים `cortado-app` ו-`cortado-ops`).
2. במשימת Cowork: מוסיפים את המאגר `cortadosnir-design/cortado-app` כמקור (Source) של המשימה.
   מרגע זה Claude יכול לדחוף קוד ישירות, בלי טוקנים.

## ב. לתת ל-GitHub הרשאה לפרסם ל-Firebase (פעם אחת)

1. Firebase Console ← גלגל שיניים ← **Project settings ← Service accounts**.
2. **Generate new private key** ← Generate key. יורד קובץ JSON. **זה סוד — לא שולחים אותו בצ'אט.**
3. GitHub ← המאגר `cortado-app` ← **Settings ← Secrets and variables ← Actions ← New repository secret**.
4. **Name:** `FIREBASE_SERVICE_ACCOUNT` · **Secret:** כל תוכן קובץ ה-JSON (פותחים ב-Notepad, Ctrl+A, Ctrl+C) ← **Add secret**.
5. מוחקים את קובץ ה-JSON מהמחשב.

## ג. בדיקה

לחיצה על **Actions** במאגר ← "Deploy to Firebase" ← **Run workflow**. אחרי כדקה:
- האתר זמין גם ב-`https://cortado-ops.web.app` (כתובת Firebase, מאושרת אוטומטית לכניסה).
- כללי Firestore מתעדכנים מהקובץ `firestore.rules` שבמאגר.

GitHub Pages ממשיך לעבוד במקביל, אז הכתובת הישנה לא נשברת.
