import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { appPath } from '$lib/utils/paths';

export const load: PageServerLoad = async ({ locals, url }) => {
  // Already logged in — redirect to home
  if (locals.user) {
    throw redirect(302, appPath('/'));
  }

  const errorCode = url.searchParams.get('error') || '';

  return { errorCode };
};
