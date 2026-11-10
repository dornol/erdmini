import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { appPath } from '$lib/utils/paths';

export const load: LayoutServerLoad = async ({ locals }) => {
  if (!locals.user || locals.user.role !== 'admin') {
    throw redirect(302, appPath('/'));
  }
  return { user: locals.user };
};
