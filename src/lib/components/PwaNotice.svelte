<script lang="ts">
	import {
		applyUpdate,
		dismissInstall,
		dismissNotice,
		pwa,
		promptInstall
	} from '#lib/pwa/state.svelte';
	import { t } from '#lib/i18n/index.svelte';

	const notice = $derived(pwa().state);
	const canInstall = $derived(pwa().canInstall);
</script>

{#if notice.phase === 'offline-ready'}
	<div class="notice" role="status" data-testid="pwa-banner" data-phase="offline-ready">
		<span>{t('pwa.offlineReady')}</span>
		<button type="button" onclick={dismissNotice}>{t('pwa.ok')}</button>
	</div>
{:else if notice.phase === 'update-available'}
	<div class="notice" role="status" data-testid="pwa-banner" data-phase="update-available">
		<span>{t('pwa.update')}</span>
		<button type="button" class="primary" onclick={applyUpdate}>{t('pwa.reload')}</button>
		<button type="button" onclick={dismissNotice}>{t('pwa.later')}</button>
	</div>
{:else if notice.phase === 'error'}
	<div class="notice error" role="alert" data-testid="pwa-banner" data-phase="error">
		<span>{t('pwa.cacheError', { message: notice.error ?? '' })}</span>
		<button type="button" onclick={dismissNotice}>{t('pwa.ok')}</button>
	</div>
{/if}

{#if canInstall}
	<div class="notice install" role="status" data-testid="install-banner">
		<span>{t('pwa.install.question')}</span>
		<button type="button" class="primary" onclick={promptInstall}>{t('pwa.install.button')}</button>
		<button
			type="button"
			class="close"
			aria-label={t('pwa.install.close')}
			title={t('pwa.install.closeTitle')}
			onclick={dismissInstall}>×</button
		>
	</div>
{/if}

<style>
	.notice {
		position: fixed;
		/* Bottom-left: the editor HUD sits top-left and its zoom toolbar
		   bottom-right, so this corner cannot cover a control. */
		left: 0.75rem;
		bottom: 0.75rem;
		z-index: 20;
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
		/* Never reach the editor's zoom toolbar in the opposite corner. */
		max-width: min(24rem, calc(55vw - 1rem));
		/* Only the buttons are interactive: a passive notice must never swallow a
		   click meant for the map or its controls. */
		pointer-events: none;
		padding: 0.65rem 0.85rem;
		border: 1px solid var(--border);
		border-radius: 12px;
		background: rgba(18, 21, 27, 0.96);
		box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
		font-size: 0.85rem;
	}

	.notice span {
		flex: 1 1 14rem;
	}

	.notice.error {
		border-color: color-mix(in srgb, var(--error) 55%, transparent);
	}

	.notice.install {
		bottom: 4.5rem;
	}

	button {
		pointer-events: auto;
		padding: 0.3rem 0.7rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--bg-panel);
		color: var(--text);
		font: inherit;
		cursor: pointer;
	}

	button.primary {
		border-color: var(--accent);
		background: var(--accent);
		color: #0f1218;
		font-weight: 600;
	}

	button.close {
		padding: 0.15rem 0.45rem;
		border-color: transparent;
		background: transparent;
		color: var(--text-dim);
		font-size: 1.1rem;
		line-height: 1;
	}

	button.close:hover {
		color: var(--text);
	}
</style>
