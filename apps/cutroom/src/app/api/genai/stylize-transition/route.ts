import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import type { TransitionSpec } from "@/lib/transitions";

const REPO_ROOT = path.resolve(process.cwd(), "../..");
const MODEL = "gemini-2.5-flash-image";

function buildPrompt(spec: TransitionSpec, screenshotCount: number): string {
  const layoutHint: Record<string, string> = {
    "centered": "screenshots scattered around the perimeter, the headline anchored in the centre",
    "hero-left": "screenshots stacked on the left third, the headline reading on the right",
    "hero-right": "screenshots stacked on the right third, the headline reading on the left",
    "grid": "screenshots arranged as a tidy 2×2 grid behind the headline",
  };
  const bgHint: Record<string, string> = {
    "gradient-purple": "deep purple-to-black radial gradient with subtle nebula texture",
    "gradient-amber": "warm amber-to-burnt-sienna radial gradient with soft grain",
    "gradient-graphite": "graphite black gradient with a soft cool light from above",
    "dark": "near-black solid background, slight vignette",
    "light": "off-white solid background with very soft shadows",
  };

  return `
Compose a single 16:9 transition slide for a product walkthrough video.

Headline (set as bold display type, ${spec.font} feel):
"${spec.text}"
${spec.subtext ? `Subhead (smaller, looser tracking): "${spec.subtext}"` : ""}

Background: ${bgHint[spec.bg] ?? "dark gradient"}.
Layout: ${layoutHint[spec.layout] ?? "screenshots floating around the headline"}.
${screenshotCount > 0
  ? `${screenshotCount} product screenshots are attached. Place them on the slide as floating cards with subtle drop shadows and slight perspective tilts. Preserve their content; do not add captions or chrome.`
  : "No screenshots; keep the slide focused on the headline."}

Style: editorial, photorealistic, polished. Soft cinematic lighting. The headline should be perfectly legible.
No watermarks, no extra UI, no people, no hands. Output one image only.
`.trim();
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GOOGLE_API_KEY not set" }, { status: 500 });
  }

  const body = (await req.json()) as {
    walkthrough_id?: string;
    transition?: TransitionSpec;
    screenshot_step_ids?: string[];
  };
  const { walkthrough_id = "v1", transition, screenshot_step_ids = [] } = body;
  if (!transition) {
    return NextResponse.json({ error: "missing transition spec" }, { status: 400 });
  }

  // Load the picked screenshots inline.
  const inlineImages: { mimeType: string; data: string }[] = [];
  for (const sid of screenshot_step_ids) {
    const p = path.join(REPO_ROOT, "walkthroughs", walkthrough_id, "steps", `${sid}.png`);
    try {
      const buf = await fs.readFile(p);
      inlineImages.push({ mimeType: "image/png", data: buf.toString("base64") });
    } catch { /* skip missing */ }
  }

  const ai = new GoogleGenAI({ apiKey });
  const prompt = buildPrompt(transition, inlineImages.length);

  let response;
  try {
    response = await ai.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            ...inlineImages.map((img) => ({ inlineData: img })),
          ],
        },
      ],
    });
  } catch (err) {
    const message = (err as Error)?.message ?? "Gemini call failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  let imageBuf: Buffer | null = null;
  let imageMime = "image/png";
  for (const cand of response.candidates ?? []) {
    for (const part of cand.content?.parts ?? []) {
      if (part.inlineData?.data) {
        imageBuf = Buffer.from(part.inlineData.data, "base64");
        imageMime = part.inlineData.mimeType ?? "image/png";
        break;
      }
    }
    if (imageBuf) break;
  }

  if (!imageBuf) {
    return NextResponse.json(
      { error: "Gemini returned no image", text: response.text ?? null },
      { status: 502 },
    );
  }

  const ext = imageMime.includes("jpeg") ? "jpg" : "png";
  const outDir = path.join(REPO_ROOT, "walkthroughs", walkthrough_id, "genai");
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `transition-${transition.id}.${ext}`);
  await fs.writeFile(outPath, imageBuf);

  return NextResponse.json({
    ok: true,
    url: `/walkthroughs/${walkthrough_id}/genai/transition-${transition.id}.${ext}`,
    bytes: imageBuf.length,
  });
}
