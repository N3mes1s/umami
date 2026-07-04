import { describe, expect, it } from 'vitest';
import { API_KEY_PREFIX, generateApiKey, isApiKey } from './api-key';
import { hash } from './crypto';

describe('generateApiKey', () => {
  it('generates a prefixed key with matching hash and display prefix', () => {
    const { key, keyHash, keyPrefix } = generateApiKey();

    expect(key.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(key).toHaveLength(API_KEY_PREFIX.length + 40);
    expect(keyHash).toBe(hash(key));
    expect(keyPrefix).toBe(key.slice(0, API_KEY_PREFIX.length + 4));
  });

  it('generates unique keys', () => {
    expect(generateApiKey().key).not.toBe(generateApiKey().key);
  });
});

describe('isApiKey', () => {
  it('detects api keys and rejects other tokens', () => {
    expect(isApiKey(generateApiKey().key)).toBe(true);
    expect(isApiKey('eyJhbGciOi...')).toBe(false);
    expect(isApiKey(undefined)).toBe(false);
  });
});
