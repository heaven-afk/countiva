import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { brandSvg } from "../src/lib/brand-assets.ts";

await mkdir("public/brand", { recursive: true });
for (const [name, options] of [
  ["public/favicon.svg", { adaptive: true }],
  ["public/favicon-light.svg", {}],
  ["public/favicon-dark.svg", { dark: true }],
  ["public/icon.svg", { adaptive: true }],
  ["public/countiva-mark.svg", { adaptive: true }],
])
  await writeFile(name, brandSvg(options));
const install = Buffer.from(brandSvg({ dark: true, tile: true }));
for (const size of [192, 512])
  await sharp(install)
    .resize(size, size)
    .png()
    .toFile(`public/brand/countiva-${size}.png`);
await sharp(install)
  .resize(180, 180)
  .png()
  .toFile("public/brand/apple-touch-icon.png");
const sizes = [16, 32, 48];
const images = await Promise.all(
  sizes.map((size) => sharp(install).resize(size, size).png().toBuffer()),
);
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
images.forEach((image, index) => {
  const entry = 6 + index * 16;
  header[entry] = header[entry + 1] = sizes[index];
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(image.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += image.length;
});
await writeFile("src/app/favicon.ico", Buffer.concat([header, ...images]));
console.log(
  "Generated adaptive favicons, ICO, Apple touch icon and install icons.",
);
