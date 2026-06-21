import { afterEach, describe, expect, it, vi } from 'vitest';
import { logDevError } from './logDevError';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('logDevError', () => {
  it('logs useful error context outside production', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('Command failed');

    logDevError('Editor command failed:', error);

    expect(consoleError).toHaveBeenCalledWith('Editor command failed:', error);
  });

  it('does not log errors in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    logDevError('Editor command failed:', new Error('Command failed'));

    expect(consoleError).not.toHaveBeenCalled();
  });
});
