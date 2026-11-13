<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import type { Snippet } from 'svelte';
	import ConnectionPill from '#lib/components/ConnectionPill.svelte';
	import PwaNotice from '#lib/components/PwaNotice.svelte';
	import { startPwa } from '#lib/pwa/state.svelte';
	import { debug, initDebug, toggleDebug } from '#lib/ui/debug.svelte';

	let { children }: { children: Snippet } = $props();

	// Service worker, connection events and the install prompt only exist in the
	// browser; prerendering never reaches this.
	onMount(() => {
		initDebug();
		startPwa();
	});
</script>

<header class="topbar">
	<a class="brand" href={resolve('/')}>KrimiMap</a>
	<nav>
		<a href={resolve('cases/')}>Fälle</a>
		<a href={resolve('editor/')}>Editor</a>
		{#if debug()}
			<a href={resolve('spike/webllm/')}>AI-Spike</a>
		{/if}
		<ConnectionPill />
		<button
			type="button"
			class="debug-toggle"
			class:active={debug()}
			aria-pressed={debug()}
			aria-label="Debug-Ansicht umschalten"
			title="Debug-Ansicht: technische Details ein-/ausblenden"
			onclick={toggleDebug}
		>
			⚙
		</button>
	</nav>
</header>

<main>
	{@render children()}
</main>

<PwaNotice />

<style>
	.topbar {
		position: sticky;
		top: 0;
		z-index: 10;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.75rem 1.25rem;
		border-bottom: 1px solid var(--border);
		background: var(--bg-panel);
	}

	.brand {
		font-weight: 700;
		letter-spacing: 0.02em;
		color: var(--accent);
		text-decoration: none;
	}

	nav {
		display: flex;
		align-items: center;
		gap: 1rem;
		font-size: 0.9rem;
	}

	nav a {
		color: var(--text-dim);
		text-decoration: none;
	}

	nav a:hover {
		color: var(--text);
	}

	.debug-toggle {
		display: grid;
		place-items: center;
		width: 1.9rem;
		height: 1.9rem;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: 50%;
		background: transparent;
		color: var(--text-dim);
		font-size: 0.9rem;
		line-height: 1;
		cursor: pointer;
	}

	.debug-toggle:hover {
		color: var(--text);
	}

	.debug-toggle.active {
		color: #0f1218;
		background: var(--accent);
		border-color: var(--accent);
	}
</style>
