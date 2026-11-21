// Repository checks shared by both workflows: the manifest, the display
// resources a plugin directory reads, and the file list that decides what
// actually ships. Run it locally with `node scripts/check.mjs`.
//
// The storefront rules it enforces are the catalog's, not ours: a card tile has
// to be a raster image inside the package, and a screenshot path that stops
// resolving is invisible to everyone — the directory draws a blank card instead
// of reporting anything — so it is cheaper to fail here.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(join(root, file), "utf8");
const has = (file) => existsSync(join(root, file));
const fail = (message) => {
  throw new Error(message);
};

const pkg = JSON.parse(read("package.json"));

if (pkg.private) fail("package.json is private");
if (!pkg.dsh?.bundle?.patch) fail("no dsh.bundle.patch");

for (const file of [pkg.dsh.bundle.patch, "icon.svg"]) {
  if (!has(file)) fail("missing " + file);
}

for (const locale of ["locale/en.json", "locale/ru.json"]) {
  const meta = JSON.parse(read(locale)).meta ?? {};
  if (!meta.title || !meta.description) fail(locale + ": no title or description");
  if (meta.detail && !has(meta.detail)) {
    fail(locale + ": missing detail document " + meta.detail);
  }
}

const shipped = pkg.files ?? [];
for (const file of ["assets/icon.png", "screenshots.json"]) {
  if (!has(file)) fail("missing storefront asset " + file);
  if (!shipped.includes(file)) fail("files does not ship " + file);
}

// A name ending in .png is not evidence that the bytes are a PNG — the host
// rejects the icon only once it tries to draw it, and a directory then shows
// the default artwork with no explanation. The catalog's limit is 256 KiB.
const ICON_LIMIT = 256 * 1024;
const MAGIC = {
  ".png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  ".jpg": [0xff, 0xd8, 0xff],
  ".jpeg": [0xff, 0xd8, 0xff],
  ".webp": [0x52, 0x49, 0x46, 0x46],
};
const extension = (file) => file.slice(file.lastIndexOf(".")).toLowerCase();

function readImage(file) {
  const bytes = readFileSync(join(root, file));
  const ext = extension(file);
  const magic = MAGIC[ext];
  if (!magic) fail("not a raster image the catalog accepts: " + file);
  if (bytes.length < magic.length || !magic.every((b, i) => bytes[i] === b)) {
    fail(file + " does not start with the bytes of a " + ext.slice(1));
  }
  if (bytes.length > ICON_LIMIT) {
    fail(file + " is " + bytes.length + " bytes; the limit is " + ICON_LIMIT);
  }
  // PNG puts its dimensions at a fixed offset; the others are not parsed here.
  if (ext === ".png" && bytes.length > 24) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  return null;
}

const icon = readImage("assets/icon.png");
if (icon && icon.width !== icon.height) {
  fail(`assets/icon.png is ${icon.width}x${icon.height}; a square tile reads best at 96px`);
}

const declared = JSON.parse(read("screenshots.json"));
const shots = Array.isArray(declared) ? declared : declared.screenshots;
if (!Array.isArray(shots) || shots.length < 1 || shots.length > 8) {
  fail("screenshots.json must list 1 to 8 images");
}

// The catalog accepts an absolute URL only on GitHub's own hosting; anything
// else is refused there, so it is refused here as well.
const GITHUB_HOSTS =
  /^https:\/\/(raw\.githubusercontent\.com|user-images\.githubusercontent\.com|camo\.githubusercontent\.com|github\.com)\//;

for (const shot of shots) {
  if (typeof shot !== "string" || shot.length === 0) {
    fail("screenshots.json: not a path: " + String(shot));
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(shot)) {
    if (!GITHUB_HOSTS.test(shot)) {
      fail("screenshots.json: an absolute URL must be https on GitHub hosting: " + shot);
    }
    continue;
  }
  if (shot.startsWith("/") || shot.split("/").includes("..")) {
    fail("screenshots.json: path leaves the package: " + shot);
  }
  if (!has(shot)) fail("screenshots.json: missing image " + shot);
  readImage(shot);
}

const size = icon ? `${icon.width}x${icon.height}` : "unparsed";
console.log(`${pkg.name}@${pkg.version} — icon ${size}, ${shots.length} screenshot(s)`);
