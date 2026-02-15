const OpenAI = require("openai");
const { ProgramBuilderInputSchema, ProgramSpecSchema } = require("../lib/schema");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

module.exports = async (req, res) => {
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

  // IMPORTANT: Force the model into the exact top-level ProgramSpec shape
  const requiredShape = {
    planName: "string",
    daysPerWeek: 4,
    split: "string (e.g. UPPER_LOWER, PPL, FULL_BODY)",
    progression: {
      overview: "string",
      rules: ["string"]
    },
    templates: [
      {
        dayName: "string",
        focus: "string",
        blocks: [
          {
            blockName: "string",
            exercises: [
              {
                name: "string",
                sets: "number",
                reps: "string (e.g. 6-10)",
                rir: "string or number",
                restSec: "number",
                notes: "string (optional)"
              }
            ]
          }
        ]
      }
    ]
  };

  const system = `
You are an expert hypertrophy coach AND a strict JSON generator.

You MUST return ONE JSON object ONLY.
No markdown. No commentary. No extra keys.

Your output MUST match this exact top-level shape:
${JSON.stringify(requiredShape, null, 2)}

Hard rules:
- Include ALL required top-level keys: planName, daysPerWeek, split, progression, templates
- daysPerWeek MUST be a number
- templates MUST be an array with length exactly equal to daysPerWeek
- Return only valid JSON
`.trim();

  async function generateOnce(extraInstruction) {
    const userMsg = {
      task: "Generate a ProgramSpec JSON object that matches the exact required shape.",
      input,
      reminder: extraInstruction || null
    };

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      // Lower randomness = more schema compliance
      temperature: 0.2,
      input: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(userMsg) },
      ],
    });

    const text = response.output_text && response.output_text.trim();
    if (!text) throw new Error("No output_text from model");
    return text;
  }

  try {
    const raw1 = await generateOnce();

    let json;
    let rawUsed = raw1;

    try {
      json = JSON.parse(raw1);
    } catch {
      const raw2 = await generateOnce("Return ONLY the JSON object. No backticks, no prose.");
      rawUsed = raw2;
      json = JSON.parse(raw2);
    }

    const validated = ProgramSpecSchema.safeParse(json);
    if (!validated.success) {
      const raw3 = await generateOnce(
        "Your last JSON did NOT match the required shape. Fix it. Include ALL required top-level keys and correct types."
      );

      let json3;
      try {
        json3 = JSON.parse(raw3);
      } catch {
        return res.status(500).json({
          error: "Model returned non-JSON on schema fix attempt",
          raw: raw3,
        });
      }

      const validated2 = ProgramSpecSchema.safeParse(json3);
      if (!validated2.success) {
        return res.status(500).json({
          error: "Model returned invalid schema twice",
          details: validated2.error.flatten(),
          raw_last: raw3,
          raw_first: raw1,
        });
      }

      return res.status(200).json(validated2.data);
    }

    return res.status(200).json(validated.data);
  } catch (err) {
    return res.status(500).json({ error: "Server error", message: err?.message ?? String(err) });
  }
};
