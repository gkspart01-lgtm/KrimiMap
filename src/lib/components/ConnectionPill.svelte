<script lang="ts">
	import { pwa } from '#lib/pwa/state.svelte';
	import { t } from '#lib/i18n/index.svelte';

	const status = $derived(pwa().status);
	const connection = $derived(pwa().connection);
	const label = $derived(connection === 'offline' ? t('pill.offline') : t('pill.online'));
	const hint = $derived(
		connection === 'offline'
			? status.offlineReady
				? t('pill.offline.title')
				: t('pill.offline.nocache')
			: status.offlineReady
				? t('pill.online.title')
				: t('pill.online.nocache')
	);
</script>

<span
	class="pill"
	class:offline={connection === 'offline'}
	class:ready={status.offlineReady && connection === 'online'}
	data-testid="connection-status"
	data-connection={connection}
	data-offline-ready={status.offlineReady}
	title={hint}
>
	<span class="dot" aria-hidden="true"></span>
	{label}
	{#if status.offlineReady}
		<span class="ready-note">{t('pill.ready')}</span>
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
