import { json } from '@sveltejs/kit';

export function ok<T>(data: T) {
  return json(data);
}

export function err(msg: string, status = 400) {
  return json({ error: msg }, { status });
}

export function notFound(msg = 'Not found') {
  return err(msg, 404);
}

export function unauthorized(msg = 'Unauthorized') {
  return err(msg, 401);
}

export function forbidden(msg = 'Forbidden') {
  return err(msg, 403);
}
