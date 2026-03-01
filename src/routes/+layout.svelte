<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { languageStore } from '$lib/store/language.svelte';
	import { authStore } from '$lib/store/auth.svelte';

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
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
{#key languageStore.current}
  {@render children()}
{/key}
