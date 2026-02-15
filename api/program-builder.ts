import type { VercelRequest, VercelResponse } from "@vercel/node";

const OpenAI = require("openai");
const { ProgramBuilderInputSchema, ProgramSpecSchema } = require("../lib/schema");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function setCors(res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "OPENAI_API_KEY not set" });
  }

  const parsed = ProgramBuilderInputSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
  }

  const input = parsed.data;

  const system = `
You are an expert hypertrophy coach.
Return ONLY valid JSON matching the required ProgramSpec schema.
No markdown. No commentary.
`.trim();

  const userPayload = { task: "Generate ProgramSpec JSON", input };

  async function generateOnce(extraInstruction?: string) {
    const msg = extraInstruction
      ? `${JSON.stringify(userPayload)}\n\nIMPORTANT: ${extraInstruction}`
      : JSON.stringify(userPayload);

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        { role: "system", content: system },
        { role: "user", content: msg },
      ],
    });

    const text = response.output_text?.trim();
    if (!text) throw new Error("No output_text from model");
    return text;
  }

  try {
    const text1 = await generateOnce();

    let json: any;
    try {
      json = JSON.parse(text1);
    } catch {
      const text2 = await generateOnce("Return ONLY valid JSON for ProgramSpec.");
      json = JSON.parse(text2);
    }

    const validated = ProgramSpecSchema.safeParse(json);
    if (!validated.success) {
      const text3 = await generateOnce("Fix JSON to match ProgramSpec exactly. Return ONLY JSON.");
      const json3 = JSON.parse(text3);
      const validated2 = ProgramSpecSchema.safeParse(json3);
      if (!validated2.success) {
        return res.status(500).json({ error: "Model returned invalid schema twice", details: validated2.error.flatten() });
      }
      return res.status(200).json(validated2.data);
    }

    return res.status(200).json(validated.data);
  } catch (err: any) {
    return res.status(500).json({ error: "Server error", message: err?.message ?? String(err) });
  }
}
