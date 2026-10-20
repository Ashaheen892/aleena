import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "../..");
const logoDir = path.join(root, "store-design-assets/01-الشعار");
const iconDir = path.join(root, "store-design-assets/06-أيقونة-المتصفح");
const font = "Noto Sans Arabic Bold";

function pango(text, fill, size) {
  const file = path.join(os.tmpdir(), `aleena-logo-${fill.replace("#", "")}-${size}.png`);
  execFileSync("pango-view", [
    "--no-display",
    "--rtl",
    "--background=transparent",
    `--foreground=${fill}`,
    `--font=${font} ${size}`,
    "--margin=4",
    `--text=${text}`,
    `--output=${file}`,
  ]);
  return file;
}

async function trimPad(file) {
  const trimmed = await sharp(file).trim({ threshold: 10 }).png().toBuffer();
  const meta = await sharp(trimmed).metadata();
  if (!meta.width || !meta.height || meta.width < 20) {
    throw new Error("فشل رسم الشعار العربي.");
  }
  const pad = Math.round(Math.max(meta.width, meta.height) * 0.1);
  return sharp(trimmed)
    .extend({
      top: pad,
      bottom: pad,
      left: pad,
      right: pad,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

function pngToIco(png) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry[0] = 32;
  entry[1] = 32;
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(22, 12);
  return Buffer.concat([header, entry, png]);
}

async function cornerAlpha(png) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const last = (info.width * info.height - 1) * info.channels;
  let opaque = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 16) opaque += 1;
  return { topLeft: data[3], bottomRight: data[last + 3], opaque };
}

fs.mkdirSync(logoDir, { recursive: true });
fs.mkdirSync(iconDir, { recursive: true });

const variants = {
  "logo-theme-color.png": "#414042",
  "logo-black.png": "#000000",
  "logo-white.png": "#ffffff",
};

for (const [name, fill] of Object.entries(variants)) {
  const buffer = await trimPad(pango("ألينا", fill, 220));
  fs.writeFileSync(path.join(logoDir, name), buffer);
  console.log(name, buffer.length, await cornerAlpha(buffer));
}
fs.copyFileSync(path.join(logoDir, "logo-theme-color.png"), path.join(logoDir, "logo-original.png"));

const mark = await sharp(pango("أ", "#414042", 400)).trim({ threshold: 10 }).png().toBuffer();
const favicon = await sharp(mark)
  .resize(26, 26, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .extend({
    top: 3,
    bottom: 3,
    left: 3,
    right: 3,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .png()
  .toBuffer();
const faviconMeta = await sharp(favicon).metadata();
if (faviconMeta.width !== 32 || faviconMeta.height !== 32 || !faviconMeta.hasAlpha) {
  throw new Error(`أيقونة غير مطابقة: ${faviconMeta.width}x${faviconMeta.height}`);
}
fs.writeFileSync(path.join(iconDir, "favicon-32x32.png"), favicon);
fs.writeFileSync(path.join(iconDir, "favicon.ico"), pngToIco(favicon));
await sharp(favicon)
  .resize(256, 256, { kernel: "nearest" })
  .flatten({ background: "#f4f1ec" })
  .png()
  .toFile("/tmp/favicon-preview.png");
console.log("favicon", favicon.length, faviconMeta, await cornerAlpha(favicon));
