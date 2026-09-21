// ספר המשחק של קורטדו — נתוני בסיס מהמחקר על הגליל העליון (ספטמבר 2026).
// זה לא קוד שמשתנה: זה הידע שהאפליקציה מתחילה איתו. הלמידה מצטברת מעליו ב-Firestore.

export const BRAND = {
  name: "קפה קורטדו",
  place: "קיבוץ שניר",
  region: "גליל עליון · עמק החולה · אצבע הגליל",
  ig: "cortado_snir",
  bio: "קפה איכותי | מאפים | רוגע של הטבע",
  baseline: { followers: 658, following: 51, at: "2026-09" },
};

// מה שבאמת עובד באזור, מתוך ניתוח הפוסטים של המתחרים.
export const VOICE = [
  "מדברים בגוף ראשון רבים, בגובה העיניים, בלי סופרלטיבים שיווקיים.",
  "הסיפור לפני הקפה. הצילום של כוס קפה לבד לא מייצר כלום באזור הזה.",
  "המקום הוא הגיבור: הנוף, השקט, הדרך אליכם.",
  "משפט ראשון קצר שעוצר את הגלילה. לא 'שלום לכולם'.",
  "תמיד לסיים במשהו קונקרטי: שעות, מיקום, או שאלה.",
];


// פורמט: לפי המחקר, ריל מגיע ל-45–65% מהעוקבים מול 18–28% בפוסט סטטי (חשבון מתחת ל-10K).
export const FORMATS = [
  { key: "reel",     label: "ריל",        weight: 0.6, note: "פי 2.5 חשיפה. לפחות 60% מהתוכן." },
  { key: "carousel", label: "קרוסלה",     weight: 0.15, note: "ER 1.68% בקטגוריית מזון." },
  { key: "static",   label: "פוסט רגיל",  weight: 0.15, note: "ER 1.12%. לשירותי בלבד." },
  { key: "story",    label: "סטורי",      weight: 0.10, note: "70% completion. יומי, לא נספר בתוכנית." },
];

// שעות פתיחה: בנצ׳מרק ישראלי + התאמה לעסק של תכנון סופ״ש.
// המערכת מחליפה את אלה בנתונים אמיתיים ברגע שיש 8+ מדידות לרשת.
export const TIMING = {
  facebook: [
    { day: 4, time: "17:30", why: "חלון ההחלטה 'מה עושים בסופ״ש' — הכי חזק לעסק שלכם", tier: 1 },
    { day: 3, time: "12:00", why: "רביעי צהריים, שיא פייסבוק הכללי בישראל",            tier: 1 },
    { day: 5, time: "08:00", why: "מי שכבר בדרך צפונה או מחליט ברגע האחרון",           tier: 2 },
    { day: 2, time: "11:30", why: "שלישי בבוקר, טווח יציב",                            tier: 2 },
    { day: 0, time: "10:00", why: "פתיחת שבוע, קהל מקומי",                             tier: 3 },
  ],
  instagram: [
    { day: 4, time: "18:00", why: "חמישי ערב, גלילה של תכנון סופ״ש",                   tier: 1 },
    { day: 2, time: "10:30", why: "שלישי בוקר, שיא אינסטגרם בישראל",                   tier: 1 },
    { day: 4, time: "10:30", why: "חמישי בוקר",                                        tier: 2 },
    { day: 5, time: "07:30", why: "שישי מוקדם, קהל בדרך",                              tier: 2 },
    { day: 6, time: "09:00", why: "שבת בבוקר — רק אם אתם פתוחים",                      tier: 3 },
  ],
  dead: "23:00–03:00 מת בשתי הרשתות. אל תתזמנו לשם.",
};

// 8–15 תגיות, לא 30. תיוג מיקום חשוב יותר מהאשטג בעברית.
export const HASHTAGS = {
  core:   ["#עגלתקפה", "#קפה", "#צפון", "#גלילעליון"],
  geo:    ["#עמקהחולה", "#קיבוץשניר", "#אצבעהגליל", "#מבואותחרמון"],
  intent: ["#עגלתקפהבצפון", "#פתוחבשבת", "#טיולבצפון", "#מטיילים", "#עגלותקפהישראל"],
  food:   ["#קפהומאפה", "#מאפיםבעבודתיד", "#קולינריה_מקומית"],
};

// חשבונות הצבירה שמחלקים את הטראפיק. לתייג בכל פוסט.
export const AMPLIFIERS = [
  { handle: "@agalatcafe.coffeetrail", followers: "30K", note: "קופיטרייל. מפעילים comment-gate, 90–111 תגובות לריל." },
  { handle: "@coffeecarts.israel",     followers: "13.7K", note: "עגלות קפה ישראל." },
  { handle: "@galilgolan_travel_culture", followers: "—", note: "אצלם ריל = פי 10 מסטטי." },
  { handle: "@lametayel",  followers: "79K",  note: "למטייל בישראל." },
  { handle: "@ifatchencohen", followers: "158K", note: "Travel/food, מסקרת עגלות קפה." },
  { handle: "@or_avidor", followers: "69K", note: "Travel & Food." },
];

// דירקטוריות. קופיטרייל = הפער הכי דחוף.
export const DIRECTORIES = [
  { name: "CoffeeTrail", url: "https://coffeetrail.co.il/", status: "missing", note: "מדורג ראשון בגוגל ל'עגלת קפה גליל עליון'. 20 עגלות מהאזור רשומות, קורטדו לא. חצי שעה עבודה." },
  { name: "Where To Eat", url: "https://where-to-eat.co.il/", status: "check", note: "מחובר לקבוצת 'איפה אוכלים'." },
  { name: "עגלות קפה", url: "https://agalotcafe.co.il/", status: "check", note: "" },
  { name: "Tiuli", url: "https://www.tiuli.com/restaurants?dests=5&types=127", status: "check", note: "" },
  { name: "TravelEat", url: "https://traveleat.co.il/", status: "check", note: "" },
  { name: "FamilyTrips", url: "https://familytrips.co.il/", status: "check", note: "" },
  { name: "Google Business Profile", url: "https://business.google.com/", status: "critical", note: "הערוץ מספר 1 לחיפוש 'קפה ליד'. שעות מעודכנות + תמונות טריות כל שבוע + מענה לכל ביקורת." },
  { name: "Waze", url: "https://www.waze.com/", status: "check", note: "באזור כותבים 'בווייז: ...'. ודאו שהעגלה מופיעה בשם 'קפה קורטדו'." },
];

// קבוצות פייסבוק. אי אפשר לפרסם אליהן ב-API (מטא סגרה את publish_to_groups),
// אז זה תור עבודה ידני שבועי עם טקסט מוכן — לא אוטומציה.
export const GROUPS = [
  { name: "איפה אוכלים — המלצות לעגלות קפה, פודטראק, בתי קפה", url: "https://www.facebook.com/groups/maps.eating.away/", members: "~24K", verified: false, tier: 1,
    play: "הכי רלוונטית שקיימת. שואלים שם מילולית 'עגלת קפה פתוחה בשבת בגליל עליון?'. קורטדו כבר הוזכרה שם. תענו, אל תפרסמו." },
  { name: "טיולון — מבלים עם הילדים ומדווחים מהשטח", url: "https://www.facebook.com/groups/476205015843307/", members: "309K", verified: true, tier: 1,
    play: "הכי גדולה. קהל משפחות — בדיוק קהל של עגלה בקיבוץ. שאלות על מקומות ידידותיים לילדים בגליל עליון." },
  { name: "המדריך לצפון", url: "https://www.facebook.com/groups/255929025426637/", members: "—", verified: false, tier: 1,
    play: "האדמין מעלה כל שבוע לוח אירועים עם חשיפה חינמית לעסקים שפתוחים בסופ״ש ובחג. להיכנס ללוח הזה כל שבוע. קורטדו כבר פורסמה שם." },
  { name: "לוח פרסום חינם גליל עליון עמק החולה רמת הגולן", url: "https://www.facebook.com/groups/1446487525659236/", members: "15K", verified: true, tier: 1,
    play: "פרסום מסחרי מותר במפורש. בארקה מפרסמים שם. קבוצה רועשת — צריך תדירות." },
  { name: "ראש פינה, חצור הגלילית והסביבה", url: "https://www.facebook.com/groups/1419251281705348/", members: "—", verified: false, tier: 2,
    play: "התיאור מזמין פרסום אירועים. גולדי וריטריט מפרסמים שם פוסטים שיווקיים מלאים." },
  { name: "הצפון שלנו ❤️", url: "https://www.facebook.com/groups/457455763841552/", members: "—", verified: false, tier: 2,
    play: "תרבות של 'נתמוך בעסקים בצפון'. הקהל שם רוצה לפרגן." },
  { name: "מבואות החרמון", url: "https://www.facebook.com/groups/419370904913785/", members: "—", verified: false, tier: 2,
    play: "המועצה האזורית שלכם. הקהילה הכי קרובה גאוגרפית." },
  { name: "דברים שקורים בתל חי והאיזור", url: "https://www.facebook.com/groups/369104519777335/", members: "—", verified: false, tier: 2,
    play: "סטודנטים ותושבים. קהל בסיס לימי חול." },
  { name: "לוח תרבות ופנאי בגליל העליון", url: "https://www.facebook.com/groups/188880924628536/", members: "—", verified: false, tier: 2,
    play: "מיועדת לפרסום עסקים, אירועים ופעילויות." },
  { name: "ראש פינה והצפון", url: "https://www.facebook.com/groups/1231606513553521/", members: "—", verified: false, tier: 2, play: "פעילה מאוד." },
  { name: "לוח פרסום גליל עליון ורמת הגולן", url: "https://www.facebook.com/groups/1940544549454456/", members: "—", verified: false, tier: 3, play: "פרסום חופשי." },
  { name: "לוח תושבי רמת הגולן", url: "https://www.facebook.com/groups/1140926885942049/", members: "—", verified: false, tier: 3, play: "קהל גולן, 20 דקות נסיעה." },
  { name: "מעודכנים בצפון", url: "https://www.facebook.com/groups/177650002578979/", members: "—", verified: false, tier: 3, play: "המלצות לטיולים ובתי קפה." },
  { name: "חולתה ויסוד המעלה — הקבוצה הרשמית", url: "https://www.facebook.com/groups/285319712573372/", members: "—", verified: false, tier: 3, play: "ישובים סמוכים." },
  { name: "פרסום עסקים בקרית שמונה והסביבה", url: "https://www.facebook.com/groups/380746132119487/", members: "—", verified: false, tier: 3, play: "העיר הקרובה." },
  { name: "פודטראק+ — עגלות קפה ופודטראק'ס", url: "https://www.facebook.com/groups/foodtrack.plus/", members: "—", verified: false, tier: 3, play: "B2B: ספקים, ציוד, ידע. לא להפצה." },
];

export const COMPETITORS = [
  { name: "פתפותים", place: "עמיעד", ig: "@pitputim_bakery", followers: 4200, posts: 706, note: "תקרת האזור. נישה חדה: 100% כוסמין." },
  { name: "גליקי", place: "יפתח", ig: "@galiki.cafe", followers: 2016, following: 2804, note: "מנפחים דרך follow-back. תוכן רגשי חזק." },
  { name: "בארקה", place: "מעיין ברוך", ig: "@baraka___coffee", followers: 1708, following: 1942, note: "אותה טקטיקה." },
  { name: "דוידק'ה", place: "איילת השחר", ig: "@davidka.truck", followers: 1200, posts: 51, note: "יחס עוקבים/פוסט הכי גבוה באזור." },
  { name: "סימני דרך", place: "כפר סאלד", ig: "@simaney_dereh", followers: 1208, following: 74, note: "גדילה אורגנית אמיתית. נפתחה 2025." },
  { name: "ריטריט קפה", place: "ראש פינה", ig: "@retreat.cafe.and.being", followers: 1100, posts: 216, note: "מיצוב 'מרחב' — מוזיקה חיה, מפגשים." },
  { name: "קפה בלה", place: "מטולה", ig: "@cafe_bela_metulla", followers: 661, posts: 78, note: "מבנה אבן בן 130 שנה." },
  { name: "קורטדו", place: "שניר", ig: "@cortado_snir", followers: 658, following: 51, me: true, note: "אתם. קהל נקי, בלי ניפוח." },
  { name: "בית של קפה", place: "ראש פינה", ig: "@bait.shel.cafe", followers: 112, posts: 15, note: "חדש." },
  { name: "קפה גולדי", place: "מטולה", ig: "@cafe.goldie", followers: null, note: "ריל טיפוסי 49 לייקים. פעילים מאוד בקבוצות." },
  { name: "זהבה קפה", place: "פארק הזהב, ק״ש", ig: "@zehavacoffee_k8", followers: null, note: "ריל טיפוסי 18 לייקים. סיפור רגשי חזק." },
  { name: "מאיולה", place: "קרית שמונה", ig: null, followers: null, note: "'עגלת הקפה הראשונה בק״ש' — זווית PR שעובדת." },
];

export const MILESTONES = [
  { to: 1200, label: "להשתוות לסימני דרך וריטריט", months: "4–6 חודשים" },
  { to: 2000, label: "לעקוף את גליקי ובארקה", months: "9–12 חודשים" },
  { to: 4500, label: "מספר 1 באזור — לעקוף את פתפותים", months: "18–24 חודשים" },
];

export const BENCHMARKS = {
  erTarget: [3, 5],          // אחוז. מתחת ל-2% = התוכן לא עובד.
  reelLikes: [50, 120],      // ריל טוב של עגלה מקומית באזור.
  weeklyPosts: 4,            // 4–5 בשבוע, מזה 3 רילס.
  weeklyReels: 3,
  nonFollowerReach: 40,      // אחוז מינימלי בריל. מתחת לזה מדברים לעצמכם.
};

// שלוש הפעולות עם ההחזר הגבוה ביותר, מהמחקר.
export const BIG_MOVES = [
  { title: "להירשם ל-CoffeeTrail ולתייג אותם בכל פוסט", why: "קטלוג עם 30K עוקבים ודירוג גוגל ראשון. אתם לא שם. פער קונקרטי ומיידי.", url: "https://coffeetrail.co.il/" },
  { title: "לעבור ל-60% רילס", why: "בגודל החשבון שלכם ריל מגיע לפי 2.5 יותר עוקבים מפוסט סטטי. השינוי עם ההחזר הכי גבוה על המאמץ.", url: "" },
  { title: "להיות התגובה, לא הפוסט", why: "מדי שבוע נשאלות בקבוצות שאלות 'עגלת קפה פתוחה בשבת בגליל עליון?'. כמעט אף עגלה לא עונה שם שיטתית. 15 דקות ביום שוות יותר מכל לוח תוכן.", url: "https://www.facebook.com/groups/maps.eating.away/" },
];

/* עוגן יחיד לכל החגים באפליקציה: הלוח, דף העובד (z.js), חלונות הביקוש
   (season.js) ו-CLOSED_ON ב-shifts.js — כולם קוראים מכאן ורק מכאן.
   ראש השנה נדרש במיוחד: הוא מופיע ב-DAY_OFF ב-season.js, וכל עוד הוא
   לא היה כאן, longWeekend לא יכול היה לירות עליו — חלון הטיולים העמוס
   ביותר בסתיו פשוט לא היה קיים בשביל האפליקציה.
   ⚠️ כשמוסיפים שנה: להוסיף אותה כאן בלבד. tests/version.mjs מתריע
   כשנשארו פחות משלושה חודשים של חגים קדימה. */
export const HOLIDAYS = [
  ["2026-09-12","ראש השנה","ערב החג 11.9"],
  ["2026-09-21","יום כיפור","ערב החג 20.9"],
  ["2026-09-26","סוכות","ערב החג 25.9"],
  ["2026-10-01","יום הקפה הבינלאומי",""],
  ["2026-10-03","שמחת תורה","ערב החג 2.10"],
  ["2026-12-04","חנוכה – נר ראשון","בערב"],
  ["2027-01-23","ט״ו בשבט","ערב 22.1"],
  ["2027-02-14","ולנטיין",""],
  ["2027-03-23","פורים","ערב 22.3"],
  ["2027-04-22","פסח","ערב החג 21.4"],
  ["2027-05-12","יום העצמאות","ערב 11.5"],
  ["2027-05-25","ל״ג בעומר","ערב 24.5"],
  ["2027-06-11","שבועות","ערב החג 10.6"],
  ["2027-10-02","ראש השנה","ערב החג 1.10"],
  ["2027-10-11","יום כיפור","ערב החג 10.10"],
  ["2027-10-16","סוכות","ערב החג 15.10"],
  ["2027-10-23","שמחת תורה","ערב החג 22.10"],
  ["2027-12-25","חנוכה – נר ראשון","בערב"],
];

/* ===== תבניות הקריאייטיב =====
   עמוד הוא נושא, לא מבנה. עד היום ה-AI המציא מבנה חדש בכל שבוע, ולכן
   הכיוונים יצאו גנריים ולא היה מה לצבור. תבנית היא מבנה קבוע: פתיחה,
   גוף, סיום וכרטיס. זורקים נושא — התבנית אומרת איך הוא נראה.

   occasion = מתי התבנית רלוונטית. ריק = תמיד.
     weekend | holiday | rain | hot | closed | first | quiet
   why      = מה המחקר אומר. זה מה שמוצג ליד התבנית עד שיש מספיק נתונים,
              ואז הנתונים שלנו גוברים עליו (ראה templateStats ב-analyze.js). */
export const TEMPLATES = [
  /* ☕ הקפה בתהליך */
  { key: "steam", name: "הקיטור", pillar: "process", format: "reel", sec: [7, 12], occasion: [],
    card: "photo", cta: "hours",
    open: "פתח בקלוז־אפ על הקיטור. בלי כותרת, בלי 'שלום'. הצליל הוא ההוק.",
    body: "שלוש שניות קיטור, היד מסובבת, המזיגה. בלי דיבור, בלי מוזיקה שמכסה.",
    shots: ["מאקרו על פיית הקיטור", "היד מסובבת את הכד", "המזיגה — סיום על הכוס"],
    why: "תוכן תהליך הוא הפורמט מספר 1 במזון ומשקאות. הצפייה בבנייה מאפס היא מה שמחזיק." },

  { key: "bean2cup", name: "מהשק לכוס", pillar: "process", format: "reel", sec: [10, 15], occasion: [],
    card: "photo", cta: "question",
    open: "קאט ראשון על השק הפתוח. המסע מתחיל מיד.",
    body: "ארבעה קאטים: שק, טחינה, מיצוי, כוס מוכנה. קצב מהיר, בלי אוויר מת.",
    shots: ["השק הפתוח מלמעלה", "הטחנה בעבודה", "המיצוי מהפילטר", "הכוס על הדלפק"],
    why: "jump cuts בלי אוויר מת מחזיקים רטנשן. אינסטגרם מתמחרת את השניות הראשונות." },

  { key: "firstcup", name: "ההזמנה הראשונה של הבוקר", pillar: "process", format: "reel", sec: [8, 12], occasion: ["first"],
    card: "photo", cta: "hours",
    open: "העגלה נפתחת. הרגע שלפני הלקוח הראשון.",
    body: "רצף אחד, בלי חיתוך. יד אחת עושה הכול.",
    shots: ["פתיחת התריס", "המכונה נדלקת", "הכוס הראשונה יוצאת"],
    why: "'יום בחיים' ופתיחת היום הם מהפורמטים היציבים ביותר לעסק מקומי." },

  /* 📍 המקום והאנשים */
  { key: "view", name: "הנוף מאחורי הכתף", pillar: "place", format: "reel", sec: [7, 10], occasion: [],
    card: "photo", cta: "waze",
    open: "מתחילים צמוד על הכוס, ואז פאן איטי החוצה אל הנוף.",
    body: "תנועה אחת רציפה. הנוף הוא הפאנץ', לא הרקע.",
    shots: ["קלוז־אפ על הכוס ביד", "פאן איטי אל החרמון", "עצירה על הנוף המלא"],
    why: "הפורמט שנשלח ב-DM. שיתוף בהודעה הוא סיגנל האיכות המוביל של רילס — 'בוא נעצור פה'." },

  { key: "regular", name: "הלקוח הקבוע", pillar: "place", format: "reel", sec: [10, 15], occasion: [],
    card: "quote", cta: "question",
    open: "שם פרטי ומה הוא מזמין. משפט אחד, בלי הקדמה.",
    body: "עשר שניות איתו. מה הוא מזמין כבר שנה ולמה. פנים, לא קפה.",
    shots: ["הוא מגיע לדלפק", "ההזמנה נעשית", "הוא לוקח ויוצא"],
    why: "הפנים מאחורי הדלפק והלקוחות הם מה שעובד לעסק מקומי — לא הפקה." },

  { key: "today", name: "מה קרה היום", pillar: "place", format: "static", occasion: ["quiet"],
    card: "photo", cta: "question",
    open: "אירוע אמיתי אחד מהיום. משפט קצר שעוצר גלילה.",
    body: "הסיפור לפני הקפה. פרט קונקרטי אחד — שם, שעה, מה נאמר.",
    shots: ["הרגע עצמו, גם אם הצילום לא מושלם"],
    why: "אותנטיות מנצחת ליטוש בקהל מקומי. פרט אמיתי אחד שווה יותר מתיאור כללי." },

  { key: "rain", name: "הגשם הראשון", pillar: "place", format: "reel", sec: [7, 12], occasion: ["rain", "hot"],
    card: "photo", cta: "hours",
    open: "מזג האוויר הוא ההוק. טיפות על הגג, או האדים מול הקור.",
    body: "מה שמזג האוויר עושה לעגלה היום. קצר, חושי.",
    shots: ["טיפות/אדים", "הכוס החמה בידיים", "הנוף המעורפל"],
    why: "תוכן שקשור לרגע הנוכחי מקבל עדיפות. מזג אוויר הוא הטריגר הכי מיידי שיש." },

  /* 🕒 מתי ואיפה */
  { key: "weekend", name: "הסופ״ש", pillar: "when", format: "static", occasion: ["weekend"],
    card: "week", cta: "hours",
    open: "משפט אחד: מתי פתוחים בסופ״ש. בלי 'שלום לכולם'.",
    body: "השעות הן התוכן. שתי שורות, לא פסקה.",
    shots: ["העגלה פתוחה, זווית רחבה"],
    why: "חלון ההחלטה 'מה עושים בסופ״ש' — הפוסט שמביא אנשים בפועל, לא לייקים." },

  { key: "waze", name: "בווייז: קפה קורטדו", pillar: "when", format: "static", occasion: [],
    card: "hours", cta: "waze",
    open: "איך מגיעים. המרחק מנקודת ציון שכולם מכירים.",
    body: "שורה אחת של ניווט. 'בווייז: קפה קורטדו'.",
    shots: ["צילום מסך של הניווט", "העגלה מהכביש"],
    why: "באזור מחפשים 'קפה ליד'. ניווט מפורש מסיר את החיכוך האחרון לפני נסיעה." },

  { key: "onroad", name: "עצירה בדרך צפונה", pillar: "when", format: "reel", sec: [8, 12], occasion: ["weekend"],
    card: "photo", cta: "waze",
    open: "'בדרך צפונה?' — פנייה ישירה למטייל, בשנייה הראשונה.",
    body: "כמה דקות סטייה מהכביש, ומה מחכה שם. ממוקד במטיילים.",
    shots: ["הכביש צפונה", "הפנייה אל הקיבוץ", "העגלה והנוף"],
    why: "פנייה לקהל ספציפי מכפילה את שיעור ההוק. 'מטייל בדרך צפונה' חד יותר מ'כולם'." },

  { key: "daily", name: "מתי פתוח היום", pillar: "when", format: "static", occasion: [],
    card: "today", cta: "waze",
    open: "היום ומה השעות. שורה אחת, בלי הקדמה.",
    body: "אם סגור — לומר מתי חוזרים. זה כל הפוסט.",
    shots: ["לא צריך צילום — הלוח הוא התמונה"],
    why: "הפוסט היומי שרץ בעגלה כבר היום. 'מתי פתוח' היא השאלה שהכי נשאלת, והתשובה חייבת להיות במבט אחד." },

  { key: "weekboard", name: "לוח השבוע", pillar: "when", format: "static", occasion: ["weekend", "first"],
    card: "week", cta: "hours",
    open: "כל השבוע במבט אחד, היום של הפוסט מוקף.",
    body: "הרשימה היא התוכן. יום סגור נשאר בה ואומר 'סגור' — זה מה שמונע נסיעת סרק.",
    shots: ["לא צריך צילום"],
    why: "הפורמט שכבר עובד בעגלה. רשימה מלאה עונה גם למי ששואל על יום אחר." },

  { key: "holiday", name: "מועד", pillar: "when", format: "static", occasion: ["holiday"],
    card: "hours", cta: "hours",
    open: "המועד בשם שלו, ומיד מה זה אומר לגבי השעות.",
    body: "פתוח/סגור, ומתי חוזרים. בלי ברכות ארוכות.",
    shots: ["העגלה עם משהו מהמועד"],
    why: "בחגים החיפוש הוא 'מי פתוח'. תשובה ישירה מנצחת ברכה." },

  { key: "closed", name: "סגור היום", pillar: "when", format: "static", occasion: ["closed"],
    card: "today", cta: "hours",
    open: "סגור — נאמר בשורה הראשונה, בלי התנצלות ארוכה.",
    body: "מתי חוזרים. זה כל הפוסט.",
    shots: ["העגלה סגורה, או ארכיון"],
    why: "פוסט 'סגור' מונע נסיעת סרק, וזה מה שמשמר לקוח חוזר." },
];

export const templateOf = (key) => TEMPLATES.find(t => t.key === key) || null;
// התבניות שמתאימות לעמוד ולנסיבות היום. תבנית בלי occasion מתאימה תמיד.
export const templatesFor = (pillar, occasions = []) => TEMPLATES
  .filter(t => (!pillar || t.pillar === pillar))
  .filter(t => !t.occasion.length || t.occasion.some(o => occasions.includes(o)))
  .sort((a, b) => (b.occasion.length ? 1 : 0) - (a.occasion.length ? 1 : 0));

/* ===== היעדים =====
   אותו כרטיס לא מתאים לכל מקום. לכל שיבוץ יש מידה משלו ואזור בטוח משלו —
   השטח שה-UI של הרשת לא דורס ושהחיתוך לא בולע. המספרים באחוזים כדי
   שיישארו נכונים גם אם המידה תשתנה.

   מה שחשוב לדעת (מפרטי 2026):
   · פיד: אין דריסת UI, רק חיתוך קל בקצוות. הסכנה היא הגריד — הפרופיל
     חותך לריבוע מרכזי, ומה שבחוץ נעלם.
   · סטורי: 14% עליונים ו-20% תחתונים תפוסים.
   · ריל: ה-35% התחתונים נבלעים בערימת לייק/תגובה/שיתוף/אודיו/כיתוב,
     וצד ימין תפוס יותר מצד שמאל. */
export const TARGETS = [
  { key: "ig_feed",   label: "אינסטגרם — פיד",        net: "instagram", w: 1080, h: 1350,
    safe: { top: .04, bottom: .04, left: .04, right: .04 }, grid: true,
    note: "4:5. הכי הרבה שטח בפיד. הגריד יחתוך לריבוע — מה שחשוב במרכז." },
  { key: "ig_square", label: "אינסטגרם — ריבוע",      net: "instagram", w: 1080, h: 1080,
    safe: { top: .04, bottom: .04, left: .04, right: .04 }, grid: false,
    note: "1:1. מה שנראה בגריד בדיוק כמו בפיד." },
  { key: "ig_story",  label: "אינסטגרם — סטורי",      net: "instagram", w: 1080, h: 1920,
    safe: { top: .14, bottom: .20, left: .06, right: .06 }, grid: false,
    note: "9:16. 14% עליונים ו-20% תחתונים תפוסים ב-UI." },
  { key: "ig_reel",   label: "אינסטגרם — כיסוי ריל",  net: "instagram", w: 1080, h: 1920,
    safe: { top: .14, bottom: .35, left: .06, right: .11 }, grid: true,
    note: "9:16. השליש התחתון נבלע בערימת הכפתורים. הכיסוי נחתך לריבוע בפרופיל." },
  { key: "fb_feed",   label: "פייסבוק — פיד",         net: "facebook",  w: 1080, h: 1350,
    safe: { top: .04, bottom: .04, left: .04, right: .04 }, grid: false,
    note: "4:5. פייסבוק לא חותך לגריד, אז אפשר למלא." },
  { key: "fb_story",  label: "פייסבוק — סטורי",       net: "facebook",  w: 1080, h: 1920,
    safe: { top: .14, bottom: .20, left: .06, right: .06 }, grid: false,
    note: "9:16, כמו סטורי באינסטגרם." },
];
export const targetOf = (key) => TARGETS.find(t => t.key === key) || TARGETS[0];

/* ===== ערכות עיצוב =====
   נקודות פתיחה, לא כלא. כל ערך כאן ניתן לדריסה ב-brand/card או לפוסט בודד,
   דרך פאנל העיצוב באפליקציה. ערכה = חבילת ברירות מחדל שנראית שלמה. */
export const THEMES = {
  clean:   { label: "נקי",        scrimStyle: "gradient", scrim: .55, block: false, frame: false,
             headlinePos: "top",    align: "right", accentBar: true,  shadow: true },
  band:    { label: "פס תחתון",   scrimStyle: "band",     scrim: .72, block: false, frame: false,
             headlinePos: "top",    align: "right", accentBar: false, shadow: true },
  block:   { label: "בלוק כותרת", scrimStyle: "none",     scrim: 0,   block: true,  frame: false,
             headlinePos: "bottom", align: "right", accentBar: false, shadow: false },
  frame:   { label: "מסגרת",      scrimStyle: "uniform",  scrim: .38, block: false, frame: true,
             headlinePos: "center", align: "center", accentBar: false, shadow: true },
  board:   { label: "לוח שעות",   scrimStyle: "none",     scrim: 0,   block: false, frame: false,
             headlinePos: "none",   align: "right", accentBar: false, shadow: false,
             ink: "#f7eaca", accent: "#a74218", boardBg: "#596d92" },
  minimal: { label: "מינימלי",    scrimStyle: "gradient", scrim: .40, block: false, frame: false,
             headlinePos: "none",   align: "right", accentBar: true,  shadow: true },
};

/* ===== הכרטיס =====
   ברירות המחדל בלבד. מה שנשמור ב-brand/card גובר על כל שדה כאן, ומה
   שנבחר לפוסט בודד גובר על שניהם. הסדר: CARD ← THEMES[theme] ← brand/card ← הפוסט. */
export const CARD = {
  theme: "clean",
  target: "ig_feed",
  targets: ["ig_feed"],          // מה נבנה בלחיצה אחת
  ink: "#ffffff",
  accent: "#2d5a87",
  bg: "#22303c",                 // כשאין צילום
  // צבעי הלוח, מתוך הפוסטר שרץ בעגלה היום. הכחול הוא הרקע, השמנת היא
  // הטקסט, והחלודה זהה לטבעת שבלוגו — אותו מותג בדיוק.
  boardBg: "#596d92",
  display: "Secular One",
  body: "Assistant",
  pad: .074,                     // שוליים נוספים מעבר לאזור הבטוח
  align: "right",
  headlinePos: "top",            // top | center | bottom | none
  headlineSize: .078,            // יחסית לרוחב
  headlineMax: 3,
  // הסמל של העגלה — הסבתא. יושב במאגר ולא בספרייה, כדי שכל כרטיס ייצא
  // איתו מהרגע הראשון, גם לפני שמישהו העלה משהו. סמל שמועלה לספרייה
  // ונבחר בעיצוב גובר עליו.
  markFile: "./logo.png",
  logoCorner: "bottom-left",     // top/bottom × right/center/left
  logoSize: .2,                  // הסבתא היא איור עם פרטים, לא סימן פשוט —
                                 // מתחת לזה היא נקראת ככתם ולא כפנים.
  scrimStyle: "gradient",        // gradient | uniform | band | none
  scrim: .55,
  tint: "",                      // גוון צבעוני מעל הצילום, ריק = בלי
  tintAlpha: .18,
  frame: false,
  frameWidth: .008,
  block: false,                  // בלוק אטום מאחורי הכותרת
  accentBar: true,
  shadow: true,
  showHours: true,
  hoursSize: .046,
  showWaze: true,
  waze: "בווייז: קפה קורטדו",
  showGuides: false,             // קווי האזור הבטוח — לכיוונון בלבד, לא בפרסום
};
