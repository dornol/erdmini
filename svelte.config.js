const isServer = process.env.PUBLIC_STORAGE_MODE === 'server';
const basePath = process.env.BASE_PATH || '';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: isServer
			? (await import('@sveltejs/adapter-node')).default()
			: (await import('@sveltejs/adapter-static')).default({ fallback: '404.html' }),
		paths: {
			base: basePath,
		},
	}
};

export default config;
