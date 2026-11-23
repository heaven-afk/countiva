import { writeFile } from "node:fs/promises";
import sharp from "sharp";
import { brandPath } from "../src/lib/brand-assets.ts";
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="100" fill="#242424"/><g transform="translate(127 65) scale(2.58)"><path d="${brandPath}" fill="none" stroke="#eeede9" stroke-width="16"/><circle cx="50" cy="50" r="13" fill="#eeede9"/></g><text x="256" y="411" text-anchor="middle" font-family="Arial,sans-serif" font-size="49" font-weight="600" letter-spacing="8" fill="#eeede9">ADMIN</text></svg>`;
await writeFile("public/brand/admin-icon.svg", svg);
for (const size of [180, 192, 512])
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(`public/brand/admin-${size}.png`);
console.log("Generated Countiva Admin install icons.");
