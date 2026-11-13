<script lang="ts">
	import '../app.css';
	import { resolve } from '$app/paths';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<header class="topbar">
	<a class="brand" href={resolve('/')}>KrimiMap</a>
	<nav>
		<a href={resolve('editor/')}>Editor</a>
		<a href={resolve('spike/webllm/')}>AI-Spike</a>
	</nav>
</header>

<main>
	{@render children()}
</main>

<style>
	.topbar {
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
</style>
