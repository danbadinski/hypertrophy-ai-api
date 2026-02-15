const OpenAI = require("openai");
const { ProgramBuilderInputSchema, ProgramSpecSchema } = require("../lib/schema");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

const ProgramSpecJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    planName: { type: "string" },
    daysPerWeek: { type: "integer", minimum: 1, maximum: 7 },
    split: { type: "string" },

    progression: {
      type: "object",
      additionalProperties: false,
      properties: {
        overview: { type: "string" },
        rules: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: ["overview", "rules"],
    },

    templates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          dayName: { type: "string" },
          focus: { type: "string" },
          blocks: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                blockName: { type: "string" },
                exercises: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      name: { type: "string" },
                      sets: { type: "integer", minimum: 1, maximum: 10 },
                      reps: { type: "string" },
                      rir: { type: "integer", minimum: 0, maximum: 5 },
                      restSec: { type: "integer", minimum: 0, maximum: 600 },
                      notes: { type: "string" }, // now required
                    },
                    required: [
                      "name",
                      "sets",
                      "reps",
                      "rir",
                      "restSec",
                      "notes"
                    ],
                  },
                },
              },
              required: ["blockName", "exercises"],
            },
          },
        },
        required: ["dayName", "focus", "blocks"],
      },
    },
  },
  required: ["planName", "daysPerWeek", "split", "progression", "templates"],
};

if (!ProgramSpecJsonSchema || ProgramSpecJsonSchema.type !== "object") {
  throw new Error("ProgramSpecJsonSchema root must be type: object");
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
    return res.status(400).json({
      error: "Invalid input",
      details: parsed.error.flatten(),
    });
  }

  const input = parsed.data;

  try {
    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      text: {
        format: {
          type: "json_schema",
          name: "ProgramSpec",
          schema: ProgramSpecJsonSchema,
          strict: true,
        },
      },
      input: [
        {
          role: "system",
          content:
            "You are an expert hypertrophy coach. Return ONLY valid JSON that matches the provided schema exactly. Do not include markdown.",
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Generate a hypertrophy program ProgramSpec JSON",
            input,
            constraintsReminder:
              "Respect constraints exactly (e.g., 'no barbell back squat').",
          }),
        },
      ],
    });

    const text = response.output_text && response.output_text.trim();
    if (!text) throw new Error("No output_text from model");

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      return res.status(500).json({
        error: "Model returned non-JSON output",
        raw: text,
      });
    }

    const validated = ProgramSpecSchema.safeParse(json);
    if (!validated.success) {
      return res.status(500).json({
        error: "Schema validation failed",
        details: validated.error.flatten(),
        raw: json,
      });
    }

    return res.status(200).json(validated.data);
  } catch (err) {
    return res.status(500).json({
      error: "Server error",
      message: err?.message ?? String(err),
    });
  }
};
