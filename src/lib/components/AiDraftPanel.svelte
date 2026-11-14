<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import {
		aiSessionBusy,
		canRequestDraft,
		INITIAL_AI_SESSION,
		reduceAiSession
	} from '#lib/ai/session';
	import type { DraftProvider } from '#lib/ai/local/provider';
	import type { CaseDraft } from '#lib/ai/contracts/case-draft';
	import { t } from '#lib/i18n/index.svelte';

	let { onapply, onclose }: { onapply: (draft: CaseDraft) => void; onclose: () => void } = $props();

	let session = $state({ ...INITIAL_AI_SESSION });
	let topic = $state('');
	let provider: DraftProvider | null = null;
	let dialog = $state<HTMLDialogElement | null>(null);

	const busy = $derived(aiSessionBusy(session));
	const canGenerate = $derived(canRequestDraft(session, topic) && Boolean(provider));

	function dispatch(event: Parameters<typeof reduceAiSession>[1]) {
		session = reduceAiSession(session, event);
	}

	onMount(() => {
		dialog?.showModal();
		void (async () => {
			const { createLocalDraftProvider } = await import('#lib/ai/local/provider');
			provider = await createLocalDraftProvider();
			const support = await provider.support();
			dispatch(
				support.ok
					? { type: 'ready' }
					: { type: 'unavailable', reason: support.reason ?? t('ai.unavailable') }
			);
		})().catch((cause: unknown) => {
			dispatch({
				type: 'unavailable',
				reason: cause instanceof Error ? cause.message : String(cause)
			});
		});
	});

	onDestroy(() => provider?.cancel());

	async function generate() {
		if (!provider || !canGenerate) return;
		dispatch({ type: 'preparing', message: t('ai.checking') });
		try {
			await provider.prepare((progress) => dispatch({ type: 'preparing', message: progress.text }));
			dispatch({ type: 'generating', message: t('ai.working') });
			const { draft, repairs } = await provider.generate(topic, (progress) =>
				dispatch({ type: 'generating', message: progress.text })
			);
			dispatch({ type: 'draft', draft, repairs });
		} catch (cause) {
			dispatch({
				type: 'failed',
				message: cause instanceof Error ? cause.message : String(cause)
			});
		}
	}

	function cancel() {
		provider?.cancel();
		dispatch({ type: 'reset' });
	}

	function apply() {
		if (!session.draft) return;
		onapply(session.draft);
	}
</script>

<dialog bind:this={dialog} class="ai-dialog" aria-labelledby="ai-title" {onclose}>
	<header>
		<h2 id="ai-title">{t('ai.title')}</h2>
		<button type="button" class="close" onclick={onclose} aria-label={t('ai.close')}>×</button>
	</header>

	<p class="muted small">{t('ai.intro')}</p>

	<label class="topic">
		<span>{t('ai.topic.label')}</span>
		<textarea bind:value={topic} rows="2" placeholder={t('ai.topic.placeholder')} disabled={busy}
		></textarea>
	</label>

	<div class="actions">
		<button type="button" class="primary" onclick={generate} disabled={!canGenerate}>
			{t('ai.generate')}
		</button>
		{#if busy}
			<button type="button" onclick={cancel}>{t('ai.cancel')}</button>
		{/if}
	</div>

	<p class="status" role="status" aria-live="polite" data-testid="ai-status">
		{#if session.status === 'checking'}{t('ai.checking')}
		{:else if session.status === 'unavailable'}{t('ai.unavailable')}: {session.error}
		{:else if session.error && session.status === 'failed'}{session.error}
		{:else}{session.message}{/if}
	</p>

	{#if session.status === 'unavailable'}
		<p class="muted small">{t('ai.not.applied')}</p>
	{/if}

	{#if session.draft}
		<section class="preview" data-testid="ai-preview">
			<h3>{t('ai.preview.title')}</h3>
			<strong>{session.draft.title}</strong>
			<p>{session.draft.premise}</p>
			<p class="small">
				<b>{t('ai.preview.characters')}:</b>
				{session.draft.characters.map((character) => character.name).join(', ')}
			</p>
			<p class="small">
				<b>{t('ai.preview.clues')}:</b>
				{session.draft.clues.map((clue) => clue.title).join(', ')}
			</p>
			<p class="small">
				<b>{t('ai.preview.solution')}:</b>
				{session.draft.characters.find((character) => character.id === session.draft?.solution)
					?.name ?? '—'}
			</p>
			{#if session.repairs.length > 0}
				<details>
					<summary>{t('ai.repairs')} ({session.repairs.length})</summary>
					<ul>
						{#each session.repairs as repair (repair)}<li>{repair}</li>{/each}
					</ul>
				</details>
			{/if}
			<p class="muted small">{t('ai.not.applied')}</p>
			<div class="actions">
				<button type="button" class="primary" onclick={apply}>{t('ai.apply')}</button>
				<button type="button" onclick={() => dispatch({ type: 'reset' })}>{t('ai.discard')}</button>
			</div>
		</section>
	{/if}
</dialog>

<style>
	.ai-dialog {
		width: min(34rem, calc(100vw - 1.5rem));
		max-height: min(38rem, calc(100dvh - 2rem));
		overflow-y: auto;
		padding: 1rem;
		border: 1px solid var(--border);
		border-radius: 14px;
		background: var(--bg-panel);
		color: var(--text);
	}
	.ai-dialog::backdrop {
		background: rgba(8, 10, 14, 0.66);
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
	}
	h2 {
		margin: 0;
		font-size: 1.05rem;
	}
	.topic {
		display: grid;
		gap: 0.3rem;
		font-size: 0.85rem;
	}
	textarea {
		width: 100%;
		padding: 0.5rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--bg-raised);
		color: var(--text);
		font: inherit;
		resize: vertical;
	}
	.actions {
		display: flex;
		gap: 0.5rem;
		margin: 0.65rem 0;
	}
	button {
		padding: 0.4rem 0.8rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--bg-raised);
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
	button:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}
	button.close {
		padding: 0.1rem 0.5rem;
		border-color: transparent;
		background: transparent;
		font-size: 1.2rem;
		line-height: 1;
	}
	.status {
		min-height: 1.2rem;
		margin: 0.4rem 0;
		font-size: 0.85rem;
		color: var(--text-dim);
	}
	.preview {
		padding: 0.7rem;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--bg-raised);
	}
	.preview h3 {
		margin: 0 0 0.4rem;
		font-size: 0.85rem;
		color: var(--accent);
	}
	.small {
		font-size: 0.8rem;
	}
	ul {
		margin: 0.3rem 0 0;
		padding-left: 1.1rem;
		font-size: 0.78rem;
	}
	details {
		margin-top: 0.4rem;
		font-size: 0.8rem;
	}
</style>
