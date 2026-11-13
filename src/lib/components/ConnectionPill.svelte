<script lang="ts">
	import { pwa } from '#lib/pwa/state.svelte';

	const status = $derived(pwa().status);
	const connection = $derived(pwa().connection);
</script>

<span
	class="pill"
	class:offline={connection === 'offline'}
	class:ready={status.offlineReady && connection === 'online'}
	data-testid="connection-status"
	data-connection={connection}
	data-offline-ready={status.offlineReady}
	title={status.title}
>
	<span class="dot" aria-hidden="true"></span>
	{status.label}
	{#if status.offlineReady}
		<span class="ready-note">· offline bereit</span>
	{/if}
</span>

<style>
	.pill {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.2rem 0.55rem;
		border: 1px solid var(--border);
		border-radius: 999px;
		font-size: 0.75rem;
		color: var(--text-dim);
		white-space: nowrap;
	}

	.dot {
		width: 0.45rem;
		height: 0.45rem;
		border-radius: 50%;
		background: var(--accent);
	}

	.pill.offline .dot {
		background: var(--error);
	}

	.pill.offline {
		color: var(--error);
		border-color: color-mix(in srgb, var(--error) 45%, transparent);
	}

	.ready-note {
		opacity: 0.75;
	}

	@media (max-width: 30rem) {
		.ready-note {
			display: none;
		}
	}
</style>
