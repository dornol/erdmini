import { describe, it, expect, vi } from 'vitest';

vi.mock('@sveltejs/kit', () => ({
  json: (data: unknown, init?: { status?: number }) => {
    return new Response(JSON.stringify(data), {
      status: init?.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    });
  },
}));

import { ok, err, notFound, unauthorized, forbidden } from '$lib/server/api-helpers';

describe('ok', () => {
  it('returns 200 with the provided data', async () => {
    const response = ok({ id: 1, name: 'test' });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ id: 1, name: 'test' });
  });

  it('returns 200 with a string', async () => {
    const response = ok('hello');
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toBe('hello');
  });

  it('returns 200 with an array', async () => {
    const response = ok([1, 2, 3]);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual([1, 2, 3]);
  });

  it('returns 200 with null', async () => {
    const response = ok(null);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toBeNull();
  });
});

describe('err', () => {
  it('returns 400 by default', async () => {
    const response = err('Bad request');
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual({ error: 'Bad request' });
  });

  it('returns custom status code', async () => {
    const response = err('Conflict', 409);
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body).toEqual({ error: 'Conflict' });
  });

  it('returns 500 for server errors', async () => {
    const response = err('Internal error', 500);
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: 'Internal error' });
  });
});

describe('notFound', () => {
  it('returns 404 with default message', async () => {
    const response = notFound();
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toEqual({ error: 'Not found' });
  });

  it('returns 404 with custom message', async () => {
    const response = notFound('Table not found');
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toEqual({ error: 'Table not found' });
  });
});

describe('unauthorized', () => {
  it('returns 401 with default message', async () => {
    const response = unauthorized();
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 with custom message', async () => {
    const response = unauthorized('Token expired');
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({ error: 'Token expired' });
  });
});

describe('forbidden', () => {
  it('returns 403 with default message', async () => {
    const response = forbidden();
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body).toEqual({ error: 'Forbidden' });
  });

  it('returns 403 with custom message', async () => {
    const response = forbidden('Insufficient permissions');
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body).toEqual({ error: 'Insufficient permissions' });
  });
});
