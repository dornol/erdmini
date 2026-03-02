import { PUBLIC_SITE_URL } from '$env/static/public';

const siteUrl = PUBLIC_SITE_URL || 'https://erdmini.dornol.dev';

export const prerender = true;

export function GET() {
	const body = `User-agent: *
Disallow:

Sitemap: ${siteUrl}/sitemap.xml
`;
	return new Response(body, {
		headers: { 'Content-Type': 'text/plain' }
	});
}
