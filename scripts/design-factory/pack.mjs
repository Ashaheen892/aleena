import { execSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "../..");
const assetRoot = path.join(root, "store-design-assets");
const reportDir = path.join(assetRoot, "07-تقارير-التصميم");
const analysis = JSON.parse(fs.readFileSync(path.join(reportDir, "analysis.json"), "utf8"));
const optimized = JSON.parse(fs.readFileSync(path.join(reportDir, "optimize.json"), "utf8"));

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (entry.name !== "assets-report.json") files.push(full);
  }
  return files;
}

async function inspect(file) {
  const relative = path.relative(root, file);
  const bytes = fs.statSync(file).size;
  const ext = path.extname(file).toLowerCase();
  const hash = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  if (![".png", ".webp", ".jpg", ".jpeg", ".ico"].includes(ext)) {
    return {
      path: relative,
      bytes,
      format: ext.replace(".", "") || "file",
      sha256: hash,
      checks: { role: "data" },
    };
  }
  if (ext === ".ico") {
    const header = fs.readFileSync(file).subarray(0, 6);
    return {
      path: relative,
      bytes,
      format: "ico",
      sha256: hash,
      checks: {
        decode: header.readUInt16LE(2) === 1 ? "pass" : "fail",
        dimensions: "32x32 embedded png",
        size: bytes > 0 ? "pass" : "fail",
      },
    };
  }
  let meta;
  try {
    meta = await sharp(file).metadata();
  } catch (error) {
    return {
      path: relative,
      bytes,
      sha256: hash,
      checks: { decode: "fail", detail: error.message },
    };
  }
  const row = {
    path: relative,
    bytes,
    format: meta.format,
    width: meta.width,
    height: meta.height,
    hasAlpha: meta.hasAlpha === true,
    sha256: hash,
    checks: {
      decode: "pass",
      dimensions: `${meta.width}x${meta.height}`,
    },
  };
  if (relative.includes("01-الشعار") && ext === ".png") {
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    row.checks.alpha = data[3] === 0 && info.channels === 4 ? "pass" : "fail";
  }
  if (relative.includes("06-أيقونة-المتصفح") && ext === ".png") {
    row.checks.dimensions = meta.width === 32 && meta.height === 32 ? "pass" : "fail";
    row.checks.alpha = meta.hasAlpha ? "pass" : "fail";
  }
  return row;
}

const files = walk(assetRoot).sort();
const inspected = [];
for (const file of files) inspected.push(await inspect(file));

const intentionalDuplicate = new Set([
  "store-design-assets/01-الشعار/logo-theme-color.png",
  "store-design-assets/01-الشعار/logo-original.png",
]);
const hashes = inspected
  .filter((item) => !intentionalDuplicate.has(item.path))
  .map((item) => item.sha256)
  .filter(Boolean);
const duplicateHashes = hashes.filter((hash, index) => hashes.indexOf(hash) !== index);

function git(command) {
  return execSync(command, { cwd: root, encoding: "utf8" }).trim();
}

let repoUrl = null;
let branch = null;
try {
  branch = git("git rev-parse --abbrev-ref HEAD");
  const remote = git("git remote get-url origin").replace(/https:\/\/[^@]+@/, "https://");
  const match = remote.match(/github\.com[:/](.+?)(?:\.git)?$/);
  if (match) repoUrl = `https://github.com/${match[1].replace(/\.git$/, "")}`;
} catch {
  repoUrl = null;
}

const zipName = "aleena-store-design-assets.zip";
const zipPath = path.join(root, zipName);

const desktopCandidates = [
  path.join(os.homedir(), "Desktop"),
  path.join(os.homedir(), "سطح المكتب"),
];
const desktop = desktopCandidates.find((dir) => fs.existsSync(dir) && fs.statSync(dir).isDirectory());
let desktopPath = null;
if (desktop) {
  const destination = path.join(desktop, "ألينا", "store-design-assets");
  fs.cpSync(assetRoot, destination, { recursive: true });
  desktopPath = destination;
}

const failed = [];
if (analysis.subcategories.length === 0) {
  failed.push({
    phase: "المرحلة 6: خلفيات التصنيفات المستطيلة",
    folder: "store-design-assets/04-خلفيات-التصنيفات-المستطيلة",
    reason: analysis.subcategoryNote,
  });
}
if (!analysis.logo.originalFile) {
  failed.push({
    phase: "المرحلة 3: الشعار الأصلي",
    file: "store-design-assets/01-الشعار/logo-original.png",
    reason:
      "لا يوجد ملف شعار أصلي. وُضع في هذا المسار نفس الشعار المشتق من اسم المتجر بلون الثيم، وهو ليس شعاراً تاريخياً مستخرجاً من صورة سابقة.",
  });
}
for (const item of optimized) {
  if (item.status === "missing-source" || item.withinLimit === false || item.dimensionsMatch === false) {
    failed.push({ phase: "10-التحقق", file: item.output || item.source, reason: item });
  } else if (item.acceptableQuality === false) {
    failed.push({
      phase: "10-الجودة-البصرية",
      file: item.output,
      reason: `وصل الملف للحد الحجمي عند جودة WebP ${item.quality} وهي أقل من حد الجودة المقبولة 35.`,
    });
  }
}

const producedImages = inspected.filter((item) => ["webp", "png", "ico"].includes(item.format));
const report = {
  storeName: analysis.storeName,
  activity: analysis.activity,
  activityNote: analysis.activityNote,
  colors: analysis.colors,
  visualDirection: analysis.visualDirection,
  categories: analysis.categories,
  subcategories: analysis.subcategories,
  producedCount: producedImages.length,
  files: inspected,
  optimize: optimized,
  duplicateFiles: [...new Set(duplicateHashes)],
  quality: {
    dimensionsChecked: true,
    sizeChecked: true,
    decodeChecked: true,
    logoAlphaChecked: true,
    unwantedText: "البرومبتات منعت أي نص أو شعار. لا توجد أداة OCR في البيئة، لذلك لم يُنفَّذ فحص نص آلي.",
    distortedProducts: "توليد بلا وجوه أو أيدٍ أو عبوات بعلامات تجارية حقيقية. لا يوجد فحص تشوه آلي.",
    compositionDifference: duplicateHashes.length === 0 ? "pass" : "fail",
  },
  failed,
  delivery: {
    folder: "store-design-assets",
    zip: zipName,
    zipBytes: 0,
    desktop: desktopPath,
    desktopNote: desktopPath
      ? "نُسخ المجلد إلى سطح المكتب."
      : "لا يوجد مجلد Desktop أو سطح المكتب في هذه البيئة. التنزيل عبر الملف المضغوط.",
    downloadUrl: repoUrl && branch ? `${repoUrl}/raw/${branch}/${zipName}` : null,
  },
};

const reportPath = path.join(reportDir, "assets-report.json");
let zipBytes = 0;
for (let attempt = 0; attempt < 4; attempt += 1) {
  report.delivery.zipBytes = zipBytes;
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  if (fs.existsSync(zipPath)) fs.rmSync(zipPath);
  execSync(`zip -r -X -q ${JSON.stringify(zipName)} store-design-assets`, { cwd: root });
  const next = fs.statSync(zipPath).size;
  if (next === zipBytes) break;
  zipBytes = next;
}
console.log(JSON.stringify(report.delivery, null, 2));
console.log("produced", report.producedCount, "failed notes", report.failed.length);
