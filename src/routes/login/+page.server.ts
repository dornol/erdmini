import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  // Already logged in — redirect to home
  if (locals.user) {
    throw redirect(302, '/');
  }
};
