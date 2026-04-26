import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { isValidStepId, isValidWalkthroughId } from "@/lib/ids";
import { publicPath } from "@/lib/fs";

const REPO_ROOT = path.resolve(process.cwd(), "../..");
const MODEL = "gemini-2.5-flash-image"; // "Nano Banana" (production)

const PROMPT = `
You are compositing a single still frame for a product walkthrough video.

Place the attached screenshot on the screen of a clean, modern silver MacBook Pro,
shown three-quarter view, sitting on a soft pastel surface with soft natural shadows.
Studio lighting, gentle vignette, photorealistic. Keep the screenshot's content fully
legible — preserve text and UI as-is. The composition should fill a 16:9 frame.
No additional people, hands, or props. The laptop should be the visual focus.
`.trim();

export async function POST(req: NextRequest) {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        ok: false,
        error: "missing_api_key",
        missing_keys: ["GOOGLE_API_KEY"],
        message:
          "Google API key not set. Open /welcome#keys to paste a Gemini key — it powers Nano Banana laptop mockups + stylized transitions.",
      },
      { status: 412 },
    );
  }

  const { walkthrough_id = "v1", step_id } = (await req.json()) as {
    walkthrough_id?: string;
    step_id?: string;
  };
  if (!step_id) {
    return NextResponse.json({ error: "missing step_id" }, { status: 400 });
  }
  if (!isValidWalkthroughId(walkthrough_id)) {
    return NextResponse.json({ error: "invalid_walkthrough_id" }, { status: 400 });
  }
  if (!isValidStepId(step_id)) {
    return NextResponse.json({ error: "invalid_step_id" }, { status: 400 });
  }

  const framePath = path.join(
    REPO_ROOT,
    "walkthroughs",
    walkthrough_id,
    "steps",
    `${step_id}.png`,
  );
  let frameBytes: Buffer;
  try {
    frameBytes = await fs.readFile(framePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
      return NextResponse.json({ error: "step frame not found" }, { status: 404 });
    }
    throw err;
  }

  const ai = new GoogleGenAI({ apiKey });

  let response;
  try {
    response = await ai.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { text: PROMPT },
            { inlineData: { mimeType: "image/png", data: frameBytes.toString("base64") } },
          ],
        },
      ],
    });
  } catch (err) {
    const message = (err as Error)?.message ?? "Gemini call failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  // Find the first image part in the candidates.
  let imageBuf: Buffer | null = null;
  let imageMime = "image/png";
  for (const cand of response.candidates ?? []) {
    for (const part of cand.content?.parts ?? []) {
      const data = part.inlineData?.data;
      if (data) {
        imageBuf = Buffer.from(data, "base64");
        imageMime = part.inlineData?.mimeType ?? "image/png";
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
  const outPath = path.join(outDir, `${step_id}.laptop.${ext}`);
  await fs.writeFile(outPath, imageBuf);

  return NextResponse.json({
    ok: true,
    url: publicPath(walkthrough_id, "genai", `${step_id}.laptop.${ext}`),
    bytes: imageBuf.length,
  });
}
