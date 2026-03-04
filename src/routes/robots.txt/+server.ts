import { env } from '$env/dynamic/public';

export const prerender = true;

export function GET() {
	const siteUrl = env.PUBLIC_SITE_URL || 'https://erdmini.dornol.dev';
	const body = `User-agent: *
Disallow:

Sitemap: ${siteUrl}/sitemap.xml
`;
	return new Response(body, {
		headers: { 'Content-Type': 'text/plain' }
	});
}
