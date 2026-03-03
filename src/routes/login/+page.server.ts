import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
  // Already logged in — redirect to home
  if (locals.user) {
    throw redirect(302, '/');
  }

  const errorCode = url.searchParams.get('error') || '';

  return { errorCode };
};
