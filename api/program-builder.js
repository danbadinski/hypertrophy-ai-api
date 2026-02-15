const OpenAI = require("openai");
const { zodToJsonSchema } = require("zod-to-json-schema");
const { ProgramBuilderInputSchema, ProgramSpecSchema } = require("../lib/schema");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

const programSpecJsonSchema = zodToJsonSchema(ProgramSpecSchema, "ProgramSpec");

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

  try {
    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      // 👇 THIS is the key: force the output to match your schema
      text: {
        format: {
          type: "json_schema",
          name: "ProgramSpec",
          schema: programSpecJsonSchema,
          strict: true,
        },
      },
      input: [
        {
          role: "system",
          content: "You are an expert hypertrophy coach. Output must match the provided JSON Schema exactly.",
        },
        {
          role: "user",
          content: JSON.stringify({ task: "Generate ProgramSpec JSON", input }),
        },
      ],
    });

    // When using json_schema format, output_text should be valid JSON matching schema
    const text = response.output_text && response.output_text.trim();
    if (!text) throw new Error("No output_text from model");

    const json = JSON.parse(text);

    // Optional: keep validation as a safety net (should pass now)
    const validated = ProgramSpecSchema.safeParse(json);
    if (!validated.success) {
      return res.status(500).json({
        error: "Schema validation failed (unexpected with json_schema)",
        details: validated.error.flatten(),
        raw: json,
      });
    }

    return res.status(200).json(validated.data);
  } catch (err) {
    return res.status(500).json({ error: "Server error", message: err?.message ?? String(err) });
  }
};
