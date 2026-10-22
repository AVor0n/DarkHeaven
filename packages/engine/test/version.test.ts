import { describe, expect, it } from 'vitest';
import { ENGINE_VERSION } from '../src/index';

describe('engine', () => {
  it('exposes a version', () => {
    expect(ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
