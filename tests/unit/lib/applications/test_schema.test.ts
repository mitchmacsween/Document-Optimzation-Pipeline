import { submitJobSchema } from '@/lib/applications/schema';

const validSession = '11111111-1111-4111-8111-111111111111';

describe('submitJobSchema', () => {
  it('accepts a valid one-off submission', () => {
    const result = submitJobSchema.safeParse({
      jd: 'We are hiring a Senior Product Manager to lead payments.',
      toggles: { research: true, resume: true, cover: false },
      sessionId: validSession,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a job description shorter than 20 characters', () => {
    const result = submitJobSchema.safeParse({
      jd: 'too short',
      toggles: { research: true, resume: false, cover: false },
      sessionId: validSession,
    });
    expect(result.success).toBe(false);
  });

  it('rejects when no toggle is selected', () => {
    const result = submitJobSchema.safeParse({
      jd: 'A sufficiently long job description for a PM role here.',
      toggles: { research: false, resume: false, cover: false },
      sessionId: validSession,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-uuid sessionId', () => {
    const result = submitJobSchema.safeParse({
      jd: 'A sufficiently long job description for a PM role here.',
      toggles: { research: true, resume: false, cover: false },
      sessionId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });
});
