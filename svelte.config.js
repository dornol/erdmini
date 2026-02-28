import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter({
			// SPA fallback: all unmatched routes serve index.html (nginx handles the rest)
			fallback: 'index.html'
		})
	}
};

export default config;
