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

export const PILLARS = [
  { key: "event",    label: "אירוע או דוכן אורח", note: "הנכס הכי חזק שלכם. יש לזה סיבה לשיתוף." },
  { key: "weekend",  label: "מה פתוח בסופ״ש",     note: "'פתוח בשבת' הוא מונח החיפוש החזק באזור." },
  { key: "drink",    label: "משקה או מאפה",        note: "רק אם יש זווית — עונתי, חדש, מתכון." },
  { key: "place",    label: "המקום והנוף",         note: "ריל של 7–15 שניות. קיטור, מזיגה, נוף." },
  { key: "people",   label: "אנשים",               note: "צוות, לקוחות קבועים, סיפור אישי." },
  { key: "holiday",  label: "חג או מועד",          note: "מתוכנן מראש, לא ביום עצמו." },
  { key: "hours",    label: "שעות ועדכונים",       note: "שירותי. לא סופרים אותו כתוכן." },
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
