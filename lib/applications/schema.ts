import { z } from 'zod';

/** The three actions a job submission can request. At least one must be true. */
export const togglesSchema = z.object({
  research: z.boolean(),
  resume: z.boolean(),
  cover: z.boolean(),
});

/** Body of POST /api/applications (one-off submission). */
export const submitJobSchema = z
  .object({
    jd: z
      .string()
      .trim()
      .min(20, 'Job description must be at least 20 characters'),
    toggles: togglesSchema,
    sessionId: z.string().uuid(),
  })
  .refine((d) => d.toggles.research || d.toggles.resume || d.toggles.cover, {
    message: 'Select at least one action',
    path: ['toggles'],
  });

export type Toggles = z.infer<typeof togglesSchema>;
export type SubmitJobInput = z.infer<typeof submitJobSchema>;
