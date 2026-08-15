import { describe, expect, it } from 'vitest';
import { attendanceCheckInSchema, attendanceCheckoutSchema } from '../schemas/attendance';
import { createNewsSchema, listNewsSchema } from '../schemas/news';

const isVitestEnv = typeof globalThis !== 'undefined';
if (!isVitestEnv) {
  throw new Error('vitest environment required');
}

describe('attendance schemas', () => {
  it('accepts a valid check-in payload', () => {
    const result = attendanceCheckInSchema.safeParse({ method: 'QR_CODE' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.method).toBe('QR_CODE');
    }
  });

  it('accepts a valid checkout payload', () => {
    const result = attendanceCheckoutSchema.safeParse({ checkOut: new Date().toISOString() });

    expect(result.success).toBe(true);
  });
});

describe('news schemas', () => {
  it('accepts a valid news creation payload', () => {
    const result = createNewsSchema.safeParse({
      title: 'Nouvelle ressource',
      content: 'Contenu de test',
      category: 'ANNOUNCEMENT',
      isPublished: true,
    });

    expect(result.success).toBe(true);
  });

  it('parses list query params with defaults', () => {
    const result = listNewsSchema.safeParse({});

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(10);
    }
  });
});
