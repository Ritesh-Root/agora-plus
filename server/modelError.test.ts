import { describe, expect, it } from 'vitest';
import { publicModelError } from './modelError';

describe('publicModelError', () => {
  it('names a rejected key without the provider body', () => {
    const secret = 'sk-secret-value';
    const text = publicModelError(new Error(`Inference API error (401): {"message":"bad","echo":"${secret}"}`));
    expect(text).toBe('The API key was rejected.');
    expect(text).not.toContain(secret);
  });

  it('names a missing model', () => {
    expect(publicModelError(new Error('Inference API error (404): model not found'))).toBe('That model is not available.');
    expect(publicModelError(new Error('Inference API error (403): AccessDenied.Unpurchased'))).toBe('That model is not available.');
  });

  it('names a throttle without the provider body', () => {
    const secret = 'sk-secret-value';
    const text = publicModelError(new Error(`ThrottlingException (429): {"echo":"${secret}"}`));
    expect(text).toBe('The model is busy right now. Try again in a moment.');
    expect(text).not.toContain(secret);
    expect(publicModelError(new Error('Too many requests'))).toBe('The model is busy right now. Try again in a moment.');
    expect(publicModelError(new Error('ThrottlingException'))).toBe('The model is busy right now. Try again in a moment.');
  });

  it('names an unreachable service', () => {
    expect(publicModelError(new Error('getaddrinfo ENOTFOUND invalid.example'))).toBe('The model service could not be reached.');
    expect(publicModelError(Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' }))).toBe('The model service could not be reached.');
    expect(publicModelError(new Error('Only https targets are allowed'))).toBe('The model service could not be reached.');
  });

  it('keeps the missing-key instruction and hides other failures', () => {
    expect(publicModelError(new Error('Add an API key in the app, or set DASHSCOPE_API_KEY on the server.'))).toMatch(/^Add an API key/);
    expect(publicModelError(new Error('something unexpected'))).toBe('The model could not answer just now.');
    expect(publicModelError(new Error('The run finished without a document.'))).toBe('The run finished without a document.');
  });
});
