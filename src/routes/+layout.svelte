<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { languageStore } from '$lib/store/language.svelte';
	import { authStore } from '$lib/store/auth.svelte';

	const SITE_TITLE = 'erdmini — Free Browser-Based ERD Tool';
	const SITE_DESCRIPTION = 'Free browser-based ERD tool. Design database schemas visually with drag-and-drop, export DDL for MySQL, PostgreSQL, MariaDB, and MSSQL.';

	let { data, children } = $props();

	// Hydrate auth store from server data
	$effect(() => {
		if (data.user) {
			authStore.set(data.user);
		}
		if (data.oidcProviders) {
			authStore.setProviders(data.oidcProviders);
		}
	});

	// Sync document lang attribute with language store
	$effect(() => {
		document.documentElement.lang = languageStore.current;
	});

	// Sanitize JSON-LD to prevent script injection
	function safeJsonLd(obj: Record<string, unknown>): string {
		return JSON.stringify(obj).replace(/<\//g, '<\\/');
	}

	const jsonLd = $derived(safeJsonLd({
		'@context': 'https://schema.org',
		'@type': 'SoftwareApplication',
		name: 'erdmini',
		url: data.siteUrl,
		description: SITE_DESCRIPTION,
		applicationCategory: 'DeveloperApplication',
		applicationSubCategory: 'Database Design Tool',
		operatingSystem: 'Any',
		availableOnDevice: 'Web Browser',
		permissions: 'none',
		isAccessibleForFree: true,
		offers: {
			'@type': 'Offer',
			price: '0',
			priceCurrency: 'USD'
		},
		featureList: 'Visual ERD Designer, DDL Export/Import, MySQL, PostgreSQL, MariaDB, MSSQL, Auto-Layout, Schema Linting, Real-time Collaboration, URL Sharing',
		screenshot: `${data.siteUrl}/og-image.png`,
		inLanguage: ['en', 'ko', 'ja', 'zh']
	}));

	const faqJsonLd = $derived(safeJsonLd({
		'@context': 'https://schema.org',
		'@type': 'FAQPage',
		mainEntity: [
			{
				'@type': 'Question',
				name: 'Is erdmini free?',
				acceptedAnswer: {
					'@type': 'Answer',
					text: 'Yes. erdmini is completely free and open-source. No sign-up or payment required.'
				}
			},
			{
				'@type': 'Question',
				name: 'What databases does erdmini support?',
				acceptedAnswer: {
					'@type': 'Answer',
					text: 'erdmini exports DDL for MySQL, PostgreSQL, MariaDB, and Microsoft SQL Server (MSSQL).'
				}
			},
			{
				'@type': 'Question',
				name: 'Does erdmini require a server?',
				acceptedAnswer: {
					'@type': 'Answer',
					text: 'No. erdmini runs entirely in the browser using local storage. An optional server mode with SQLite, Docker, and real-time collaboration is also available.'
				}
			},
			{
				'@type': 'Question',
				name: 'Can I share my ERD with others?',
				acceptedAnswer: {
					'@type': 'Answer',
					text: 'Yes. You can share schemas via URL (compressed, no server needed) or export as DDL, Mermaid, PlantUML, SVG, or PNG.'
				}
			}
		]
	}));
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="canonical" href={data.siteUrl} />

	<!-- Open Graph -->
	<meta property="og:type" content="website" />
	<meta property="og:title" content={SITE_TITLE} />
	<meta property="og:description" content={SITE_DESCRIPTION} />
	<meta property="og:url" content={data.siteUrl} />
	<meta property="og:image" content="{data.siteUrl}/og-image.png" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:site_name" content="erdmini" />

	<!-- Twitter Card -->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={SITE_TITLE} />
	<meta name="twitter:description" content={SITE_DESCRIPTION} />
	<meta name="twitter:image" content="{data.siteUrl}/og-image.png" />

	<!-- hreflang -->
	<link rel="alternate" hreflang="en" href={data.siteUrl} />
	<link rel="alternate" hreflang="ko" href={data.siteUrl} />
	<link rel="alternate" hreflang="ja" href={data.siteUrl} />
	<link rel="alternate" hreflang="zh" href={data.siteUrl} />
	<link rel="alternate" hreflang="x-default" href={data.siteUrl} />

	<!-- Structured Data -->
	{@html `<script type="application/ld+json">${jsonLd}</script>`}
	{@html `<script type="application/ld+json">${faqJsonLd}</script>`}
</svelte:head>
{#key languageStore.current}
  {@render children()}
{/key}
