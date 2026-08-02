import { describe, expect, it } from 'vitest';
import { parseClientMessage } from './messages.js';

describe('wire protocol validation', () => {
  it('accepts a finite direction-only Cast gesture', () => {
    expect(parseClientMessage(JSON.stringify({
      type: 'cast',
      direction: { x: 200, y: -80 },
    }), 32)).toEqual({ type: 'cast', direction: { x: 200, y: -80 } });
  });

  it('rejects non-finite Cast input', () => {
    expect(parseClientMessage('{"type":"cast","direction":{"x":1e999,"y":0}}', 32)).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: 'cast', direction: { x: 'left', y: 0 } }), 32)).toBeNull();
  });

  it('caps hostile stroke point floods at the boundary', () => {
    const points = Array.from({ length: 100 }, (_, index) => ({ x: index, y: 0 }));
    const parsed = parseClientMessage(JSON.stringify({ type: 'submit', points }), 12);
    expect(parsed?.type).toBe('submit');
    if (parsed?.type === 'submit') expect(parsed.points).toHaveLength(12);
  });
});
