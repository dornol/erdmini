import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
  if (!locals.user || locals.user.role !== 'admin') {
    throw redirect(302, '/');
  }
  return { user: locals.user };
};
