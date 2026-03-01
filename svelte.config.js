const isServer = process.env.PUBLIC_STORAGE_MODE === 'server';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: isServer
			? (await import('@sveltejs/adapter-node')).default()
			: (await import('@sveltejs/adapter-static')).default({ fallback: 'index.html' })
	}
};

export default config;
