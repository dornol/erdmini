import { env } from '$env/dynamic/public';

export const prerender = true;

export function GET() {
	const siteUrl = env.PUBLIC_SITE_URL || 'https://erdmini.dornol.dev';
	const lastmod = new Date().toISOString().split('T')[0];
	const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${siteUrl}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`;
	return new Response(body, {
		headers: { 'Content-Type': 'application/xml' }
	});
}
