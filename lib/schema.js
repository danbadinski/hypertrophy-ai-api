const { z } = require("zod");

const ProgramBuilderInputSchema = z.object({
  daysPerWeek: z.number().int().min(1).max(7),
  minutesPerSession: z.number().int().min(20).max(180),
  splitPreference: z.string().min(1), // e.g. "UPPER_LOWER"
  goal: z.string().min(1),            // e.g. "HYPERTROPHY"
  experience: z.string().min(1),      // e.g. "INTERMEDIATE"
  equipment: z.string().min(1),       // e.g. "GYM"
  constraints: z.string().optional().default(""),
});

const ExerciseSchema = z.object({
  name: z.string().min(1),
  sets: z.number().int().min(1).max(10),
  reps: z.string().min(1),
  rir: z.number().int().min(0).max(5),
  restSec: z.number().int().min(0).max(600),
  notes: z.string(), // required (can be "")
});

const BlockSchema = z.object({
  blockName: z.string().min(1),
  exercises: z.array(ExerciseSchema).min(1),
});

const TemplateSchema = z.object({
  dayName: z.string().min(1),
  focus: z.string().min(1),
  blocks: z.array(BlockSchema).min(1),
});

const ProgramSpecSchema = z.object({
  planName: z.string().min(1),
  daysPerWeek: z.number().int().min(1).max(7),
  split: z.string().min(1), // you can tighten later to enum if you want
  progression: z.object({
    overview: z.string().min(1),
    rules: z.array(z.string().min(1)).min(1),
  }),
  templates: z.array(TemplateSchema).min(1),
});

module.exports = {
  ProgramBuilderInputSchema,
  ProgramSpecSchema,
};
