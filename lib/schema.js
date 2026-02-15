const { z } = require("zod");

const ProgramBuilderInputSchema = z.object({
  daysPerWeek: z.number().int().min(2).max(6),
  minutesPerSession: z.number().int().min(20).max(180),
  splitPreference: z.enum(["FULL_BODY", "UPPER_LOWER", "PPL", "CUSTOM"]),
  goal: z.enum(["HYPERTROPHY", "STRENGTH", "RECOMP"]),
  experience: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]),
  equipment: z.enum(["GYM", "HOME", "LIMITED"]),
  constraints: z.string().max(500).optional(),
});

const ProgramSpecSchema = z.object({
  planName: z.string().min(3).max(80),
  daysPerWeek: z.number().int().min(2).max(6),
  split: z.string().min(3).max(40),
  progression: z.object({
    method: z.enum(["DOUBLE_PROGRESSION", "TOP_SET_BACKOFF"]),
    rule: z.string().min(10).max(300),
  }),
  templates: z.array(
    z.object({
      day: z.number().int().min(1).max(7),
      title: z.string().min(3).max(40),
      estimatedMinutes: z.number().int().min(20).max(180),
      exercises: z.array(
        z.object({
          name: z.string().min(3).max(60),
          sets: z.number().int().min(1).max(8),
          reps: z.string().min(1).max(20),
          rpe: z.string().min(1).max(10),
          restSec: z.number().int().min(30).max(300),
          notes: z.string().max(200).optional(),
        })
      ).min(4).max(10),
    })
  ).min(2).max(6),
});

module.exports = {
  ProgramBuilderInputSchema,
  ProgramSpecSchema,
};
