<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { languageStore } from '$lib/store/language.svelte';

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
{#key languageStore.current}
  {@render children()}
{/key}
