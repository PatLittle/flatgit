import fs from "node:fs";
import PptxGenJS from "pptxgenjs";

const dataPath = process.argv[2];
if (!dataPath) throw new Error("Pass presentation-data.json as the first argument");
const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));

const pptx = new PptxGenJS();
pptx.layout = "LAYOUT_WIDE";
pptx.author = "FlatGit";
pptx.subject = "FlatGit feature demonstration";
pptx.title = "FlatGit GitHub data and document viewer";
pptx.company = "FlatGit";
pptx.lang = "en-CA";
pptx.theme = {
  headFontFace: "Aptos Display",
  bodyFontFace: "Aptos",
  lang: "en-CA",
};
pptx.defineSlideMaster({
  title: "LIGHT",
  background: { color: "F6F8FA" },
  objects: [
    { text: { text: "FlatGit", options: { x: 0.55, y: 0.2, w: 1.4, h: 0.3, fontFace: "Aptos", fontSize: 11, bold: true, color: "0969DA", margin: 0 } } },
    { text: { text: "patlittle.github.io/flatgit", options: { x: 10.25, y: 7.1, w: 2.5, h: 0.2, fontFace: "Aptos", fontSize: 8, color: "656D76", align: "right", margin: 0 } } },
  ],
  slideNumber: { x: 12.85, y: 7.1, w: 0.2, h: 0.2, fontFace: "Aptos", fontSize: 8, color: "656D76", align: "right" },
});

function addTitle(slide, title, subtitle = "") {
  slide.addText(title, { x: 0.65, y: 0.62, w: 12, h: 0.55, fontFace: "Aptos Display", fontSize: 28, bold: true, color: "1F2328", margin: 0, breakLine: false, fit: "shrink" });
  if (subtitle) slide.addText(subtitle, { x: 0.67, y: 1.18, w: 11.8, h: 0.45, fontFace: "Aptos", fontSize: 13, color: "656D76", margin: 0.02, fit: "shrink" });
}

function addImage(slide, path, x, y, w, h) {
  slide.addImage({ path, x, y, w, h, sizing: "crop" });
}

function addBullets(slide, items, x, y, w, h, color = "1F2328") {
  const runs = items.flatMap((item, index) => [
    { text: item, options: { bullet: { indent: 18 }, hanging: 4, breakLine: index < items.length - 1 } },
  ]);
  slide.addText(runs, { x, y, w, h, fontFace: "Aptos", fontSize: 18, color, breakLine: false, margin: 0.08, paraSpaceAfterPt: 12, valign: "mid", fit: "shrink" });
}

{
  const slide = pptx.addSlide();
  slide.background = { color: "0D1117" };
  addImage(slide, data.darkScreenshot, 0, 0, 13.333, 7.5);
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 5.35, h: 7.5, line: { color: "0D1117", transparency: 100 }, fill: { color: "0D1117", transparency: 4 } });
  slide.addShape(pptx.ShapeType.rect, { x: 0.72, y: 1.05, w: 0.65, h: 0.08, line: { color: "58A6FF", transparency: 100 }, fill: { color: "58A6FF" } });
  slide.addText("FlatGit", { x: 0.72, y: 1.35, w: 4.05, h: 0.8, fontFace: "Aptos Display", fontSize: 44, bold: true, color: "FFFFFF", margin: 0 });
  slide.addText("GitHub data and\ndocument viewer", { x: 0.75, y: 2.35, w: 4.0, h: 1.25, fontFace: "Aptos Display", fontSize: 26, bold: true, color: "E6EDF3", margin: 0.01, breakLine: false, fit: "shrink" });
  slide.addText("Browse public repositories, structured data, documents and source files—entirely in the browser.", { x: 0.75, y: 4.05, w: 3.85, h: 1.25, fontFace: "Aptos", fontSize: 17, color: "B1BAC4", margin: 0, breakLine: false, fit: "shrink" });
  slide.addText("patlittle.github.io/flatgit", { x: 0.75, y: 6.55, w: 3.85, h: 0.3, fontFace: "Aptos", fontSize: 11, bold: true, color: "58A6FF", margin: 0 });
}

{
  const slide = pptx.addSlide("LIGHT");
  addTitle(slide, data.title, data.lede);
  addImage(slide, data.lightScreenshot, 0.65, 1.8, 8.15, 4.9);
  addBullets(slide, data.features.map((feature) => `${feature.title}: ${feature.description}`), 9.2, 1.9, 3.45, 4.75);
}

{
  const slide = pptx.addSlide("LIGHT");
  addTitle(slide, "Interactive data inspection", "FlatGit turns common repository data formats into a browser-based work surface.");
  addBullets(slide, [
    "Search across every column and filter individual fields",
    "Sort, resize, reorder, hide and reveal columns",
    "Jump between pages and change the number of visible rows",
    "Export the filtered visible data as CSV",
    "Run read-only queries against SQLite files",
  ], 0.75, 1.75, 5.1, 4.8);
  addImage(slide, data.darkScreenshot, 6.2, 1.7, 6.5, 4.95);
}

{
  const slide = pptx.addSlide("LIGHT");
  addTitle(slide, "Supported preview families", "The landing page describes each recognized extension and the viewer used for it.");
  const midpoint = Math.ceil(data.formats.length / 2);
  addBullets(slide, data.formats.slice(0, midpoint), 0.9, 1.55, 5.55, 5.2);
  addBullets(slide, data.formats.slice(midpoint), 6.85, 1.55, 5.55, 5.2);
}

{
  const slide = pptx.addSlide();
  slide.background = { color: "0D1117" };
  slide.addText("Two layouts for different jobs", { x: 0.75, y: 0.75, w: 8.5, h: 0.65, fontFace: "Aptos Display", fontSize: 34, bold: true, color: "FFFFFF", margin: 0 });
  slide.addText("Full view", { x: 0.8, y: 1.8, w: 2.5, h: 0.45, fontFace: "Aptos Display", fontSize: 24, bold: true, color: "58A6FF", margin: 0 });
  slide.addText("Repository, branch, folder and file navigation with history and comparison tools", { x: 0.8, y: 2.35, w: 5.2, h: 1.1, fontFace: "Aptos", fontSize: 20, color: "E6EDF3", margin: 0, fit: "shrink" });
  slide.addText("Minimal view", { x: 6.9, y: 1.8, w: 2.5, h: 0.45, fontFace: "Aptos Display", fontSize: 24, bold: true, color: "58A6FF", margin: 0 });
  slide.addText("A focused, shareable file preview that keeps the main content at full width", { x: 6.9, y: 2.35, w: 5.2, h: 1.1, fontFace: "Aptos", fontSize: 20, color: "E6EDF3", margin: 0, fit: "shrink" });
  slide.addText("https://patlittle.github.io/flatgit/", { x: 0.8, y: 5.8, w: 11.75, h: 0.55, fontFace: "Aptos", fontSize: 23, bold: true, color: "FFFFFF", align: "center", margin: 0 });
  slide.addText("Client-side HTML, CSS and JavaScript", { x: 0.8, y: 6.48, w: 11.75, h: 0.35, fontFace: "Aptos", fontSize: 14, color: "8B949E", align: "center", margin: 0 });
}

await pptx.writeFile({ fileName: data.output });
