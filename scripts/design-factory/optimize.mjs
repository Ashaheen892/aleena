import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "../..");
const jobsPath = path.join(import.meta.dirname, "jobs.json");
const jobs = JSON.parse(fs.readFileSync(jobsPath, "utf8"));

async function encode(source, job, quality) {
  return sharp(source)
    .rotate()
    .resize(job.width, job.height, {
      fit: "cover",
      position: "centre",
    })
    .webp({
      quality,
      alphaQuality: quality,
      effort: 6,
      smartSubsample: true,
    })
    .toBuffer();
}

const results = [];

for (const job of jobs) {
  const sourcePath = path.join(root, job.source);
  if (!fs.existsSync(sourcePath)) {
    results.push({ ...job, status: "missing-source" });
    console.error("MISSING", job.source);
    continue;
  }
  const source = fs.readFileSync(sourcePath);
  let chosen = null;
  let chosenQuality = null;
  for (let quality = 78; quality >= 24; quality -= 2) {
    const buffer = await encode(source, job, quality);
    chosen = buffer;
    chosenQuality = quality;
    if (buffer.length <= job.maxBytes) break;
  }

  const target = path.join(root, job.output);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, chosen);
  const meta = await sharp(chosen).metadata();
  const row = {
    output: job.output,
    width: meta.width,
    height: meta.height,
    bytes: chosen.length,
    maxBytes: job.maxBytes,
    quality: chosenQuality,
    withinLimit: chosen.length <= job.maxBytes,
    acceptableQuality: chosenQuality >= 35,
    dimensionsMatch: meta.width === job.width && meta.height === job.height,
  };
  results.push(row);
  console.log(
    `${row.withinLimit ? "OK" : "OVER"} ${row.bytes}b q${row.quality} ${row.width}x${row.height} ${job.output}`,
  );
}

const reportPath = path.join(root, "store-design-assets/07-تقارير-التصميم/optimize.json");
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));

if (results.some((item) => item.status === "missing-source" || item.dimensionsMatch === false)) {
  process.exitCode = 1;
}
