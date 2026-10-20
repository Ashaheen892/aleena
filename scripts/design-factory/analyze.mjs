import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const twilight = JSON.parse(fs.readFileSync(path.join(root, "twilight.json"), "utf8"));
const scss = fs.readFileSync(
  path.join(root, "src/assets/styles/01-settings/global.scss"),
  "utf8",
);

function cssVars(source) {
  const found = new Map();
  const re = /--([a-z0-9-]+)\s*:\s*([^;]+);/gi;
  for (const match of source.matchAll(re)) {
    found.set(match[1], match[2].trim());
  }
  return Object.fromEntries(found);
}

function linkTitles(component, collectionId) {
  const field = (component.fields || []).find((item) => item.id === collectionId);
  const values = Array.isArray(field?.value) ? field.value : [];
  const titles = [];
  for (const row of values) {
    const title = row?.[`${collectionId}.title`];
    if (typeof title === "string" && title.trim()) titles.push(title.trim());
  }
  return titles;
}

function emptyCategoryPicker(component) {
  return (component.fields || [])
    .filter((item) => item.source === "categories" || item.id?.includes("categor"))
    .map((item) => ({
      id: item.id,
      label: item.label || null,
      selected: item.selected || [],
      options: item.options || [],
    }));
}

const vars = cssVars(scss);
const components = Array.isArray(twilight.components) ? twilight.components : [];
const square = components.find((item) => item.path === "home.main-links");
const circular = components.find((item) => item.path === "home.circular-links");
const squareTitles = square ? linkTitles(square, "links") : [];
const circularTitles = circular ? linkTitles(circular, "circular_links") : [];
const uniqueTitles = [...new Set([...squareTitles, ...circularTitles])];

const analysis = {
  storeName: twilight.name ?? null,
  repository: twilight.repository ?? null,
  themeDescription: twilight.description ?? null,
  activity: null,
  activityNote:
    "لا يوجد نشاط تجاري في twilight.json أو ملفات اللغة أو القوالب. حقل description فارغ. لم يُخترع نشاط.",
  colors: {
    primary: vars["color-primary"] || null,
    primaryDark: vars["color-primary-d"] || null,
    primaryLight: vars["color-primary-l"] || null,
    accent: vars["color-primary-reverse"] || null,
    text: vars["color-text"] || null,
    heading: vars["main-text-color"] || null,
    infinite: vars["infinte-color"] || null,
    grey: vars["color-grey"] || null,
    squareCategoryBackground: "#1D1F1F",
    squareCategoryText: "#ffffff",
    circularCategoryBackground: "#ffffff",
    circularCategoryText: "#1D1F1F",
    headerPanel: "#0e0f0f",
    note: "المتغير --color-primary مُعرّف مرتين في global.scss. القيمة الفعالة هي الأخيرة #414042، والقيمة السابقة #5cd5c4 غير مستخدمة.",
  },
  logo: {
    originalFile: null,
    note: "الشعار في القالب يُقرأ وقت التشغيل من store.logo ولا يوجد ملف شعار داخل المستودع.",
  },
  categories: uniqueTitles.map((title, index) => ({
    index: index + 1,
    title,
    source: "عناوين روابط home.main-links و home.circular-links في twilight.json",
    liveCategory: false,
  })),
  duplicateLinkTitles: squareTitles.filter(
    (title, index) => squareTitles.indexOf(title) !== index,
  ),
  categoryPickers: components.flatMap((component) =>
    emptyCategoryPicker(component).map((picker) => ({
      component: component.path,
      ...picker,
    })),
  ),
  subcategories: [],
  subcategoryNote:
    "لا توجد تصنيفات فرعية في بيانات المشروع. حقول التصنيفات الحية selected و options فارغة، لذلك لا تُصنع صور المرحلة 6.",
  bannerCopy: [],
  bannerCopyNote:
    "نصوص السلايدر الافتراضية نصوص تجريبية لسلة وليست شعارات حملة للمتجر، لذلك البنرات تُصنع بلا نصوص.",
  visualDirection:
    "هوية فحمية فاخرة محايدة مبنية على ألوان الثيم. كل عنوان رابط يأخذ مشهداً مختلفاً لأن القائمة متعددة الأنواع، دون افتراض نشاط واحد غير موجود.",
};

const requestPath = path.join(import.meta.dirname, "request.json");
if (fs.existsSync(requestPath)) {
  const request = JSON.parse(fs.readFileSync(requestPath, "utf8"));
  analysis.themeLinkTitles = analysis.categories;
  if (request.activity) {
    analysis.activity = request.activity;
    analysis.activityNote = request.activityNote;
  }
  if (request.visualDirection) analysis.visualDirection = request.visualDirection;
  if (Array.isArray(request.categories) && request.categories.length > 0) {
    analysis.categories = request.categories;
  }
  if (Array.isArray(request.subcategories)) {
    analysis.subcategories = request.subcategories;
    if (request.subcategoryNote) analysis.subcategoryNote = request.subcategoryNote;
  }
}

const folders = [
  "store-design-assets/01-الشعار",
  "store-design-assets/02-صور-التصنيفات-المربعة",
  "store-design-assets/03-بنرات-مستطيلة-بالعرض",
  "store-design-assets/04-خلفيات-التصنيفات-المستطيلة",
  "store-design-assets/05-خلفيات-بدون-نصوص",
  "store-design-assets/06-أيقونة-المتصفح",
  "store-design-assets/07-تقارير-التصميم",
  "store-design-assets/_inbox",
];
for (const folder of folders) fs.mkdirSync(path.join(root, folder), { recursive: true });
fs.writeFileSync(
  path.join(root, "store-design-assets/04-خلفيات-التصنيفات-المستطيلة/.gitkeep"),
  "",
);
const outDir = path.join(root, "store-design-assets/07-تقارير-التصميم");
const outFile = path.join(outDir, "analysis.json");
fs.writeFileSync(outFile, JSON.stringify(analysis, null, 2));
console.log(outFile);
console.log(
  JSON.stringify(
    {
      store: analysis.storeName,
      categories: analysis.categories.map((item) => item.title),
      subcategories: analysis.subcategories.length,
      primary: analysis.colors.primary,
    },
    null,
    2,
  ),
);
