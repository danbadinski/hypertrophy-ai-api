import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";
import { ProgramBuilderInputSchema, ProgramSpecSchema } from "../lib/schema";

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
    return res
      .status(400)
      .json({ error: "Invalid input", details: parsed.error.flatten() });
  }

  const input = parsed.data;

  const system = `
You are an expert hypertrophy coach.
Generate a weekly training program as STRICT JSON matching the required schema.

Hard rules:
- Fit daysPerWeek and minutesPerSession.
- Limit exercise count by time:
  - 30m: 4-5 exercises
  - 45m: 5-6 exercises
  - 60m: 6-8 exercises
  - 75m: 7-9 exercises
- Equipment rules:
  - GYM: machines/cables/DB/BB ok
  - HOME: DB/bodyweight/bands only
  - LIMITED: bodyweight + minimal equipment; keep it simple
- Goal defaults:
  - HYPERTROPHY: compounds 6-12 reps, accessories 10-20 reps, RPE 7-9
  - STRENGTH: compounds 3-6 reps, some 6-10 backoff, RPE 7-9
  - RECOMP: mix 6-12 compounds + 10-15 accessories, RPE 7-9
- Include a clear progression rule.
- Output ONLY valid JSON. No markdown. No extra text.
`.trim();

  const userPayload = {
    task: "Generate ProgramSpec JSON",
    input,
  };

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
    // Attempt 1: generate
    const text1 = await generateOnce();

    // Parse JSON (attempt 2 if needed)
    let json: unknown;
    try {
      json = JSON.parse(text1);
    } catch {
      const text2 = await generateOnce(
        "Your last output was not valid JSON. Return ONLY valid JSON for ProgramSpec."
      );
      json = JSON.parse(text2);
    }

    // Validate schema (attempt 3 if needed)
    const validated = ProgramSpecSchema.safeParse(json);
    if (!validated.success) {
      const text3 = await generateOnce(
        "Your JSON did not match the schema. Fix missing/incorrect fields and return ONLY JSON matching ProgramSpec exactly."
      );
      const json3 = JSON.parse(text3);
      const validated2 = ProgramSpecSchema.safeParse(json3);

      if (!validated2.success) {
        return res.status(500).json({
          error: "Model returned invalid schema twice",
          details: validated2.error.flatten(),
        });
      }

      return res.status(200).json(validated2.data);
    }

    return res.status(200).json(validated.data);
  } catch (err: any) {
    return res.status(500).json({
      error: "Server error",
      message: err?.message ?? String(err),
    });
  }
}
