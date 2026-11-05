// Renders the desktop app icons from the brand source, assets/brand/icon.svg.
//
//   node scripts/create-desktop-icon.mjs
//
// Writes desktop/assets/: icon.svg (copy), icon.png (1024), icon.icns (macOS,
// drawn on Apple's 824 px grid inside the 1024 canvas), icon.ico (Windows,
// 16-256) and icons/<n>x<n>.png (Linux, 16-1024). Re-run after editing the SVG.
import { Resvg } from "@resvg/resvg-js";
import png2icons from "png2icons";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";

const source = "assets/brand/icon.svg";
const out = "desktop/assets";
const svg = await readFile(source, "utf8");
const render = (markup, size) =>
  new Resvg(markup, { fitTo: { mode: "width", value: size } }).render().asPng();
// macOS icons leave a margin round the tile (824 of 1024 px); other platforms
// use the full canvas so 16 px favicons and taskbar icons stay legible.
const padded = svg
  .replace('viewBox="0 0 1024 1024"', 'viewBox="-100 -100 1224 1224"')
  .replace(/<svg /, '<svg width="1024" height="1024" ');

await mkdir(`${out}/icons`, { recursive: true });
await copyFile(source, `${out}/icon.svg`);
const full = render(svg, 1024);
await writeFile(`${out}/icon.png`, full);
for (const size of [16, 24, 32, 48, 64, 128, 256, 512, 1024])
  await writeFile(`${out}/icons/${size}x${size}.png`, render(svg, size));
const icns = png2icons.createICNS(render(padded, 1024), png2icons.BICUBIC2, 0);
const ico = png2icons.createICO(full, png2icons.BICUBIC2, 0, true, true);
if (!icns || !ico) throw new Error("Icon conversion failed");
await writeFile(`${out}/icon.icns`, icns);
await writeFile(`${out}/icon.ico`, ico);
console.log(`Icons written to ${out}/ from ${source}`);
