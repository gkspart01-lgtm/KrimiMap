<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- routes include a case id query */
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { asset, resolve } from '$app/paths';
	import type { EditorMapHandle } from '#lib/game/createLeafletEditor';
	import type { CaseDocument } from '#lib/domain/case-document';
	import { SHARED_MAP_DOCUMENT } from '#lib/domain/map-document';
	import { loadCase } from '#lib/storage/db';
	import { t } from '#lib/i18n/index.svelte';

	let host = $state<HTMLDivElement | null>(null);
	let handle: EditorMapHandle | null = null;
	let document = $state<CaseDocument | null>(null);
	let loading = $state(true);
	let fatal = $state<string | null>(null);
	let selectedEntityId = $state<string | null>(null);
	let discoveredClueIds = $state<string[]>([]);
	let selectedAnswerId = $state('');
	let hintVisible = $state(false);
	let solved = $state(false);
	let feedbackKey = $state<'required' | 'findClue' | 'incorrect' | 'correct' | null>(null);

	const clues = $derived((document?.entities ?? []).filter((entity) => entity.kind === 'clue'));
	const characters = $derived(
		(document?.entities ?? []).filter((entity) => entity.kind === 'character')
	);
	const selectedEntity = $derived(
		document?.entities.find((entity) => entity.id === selectedEntityId) ?? null
	);
	const canPlay = $derived.by(() => {
		if (
			!document?.challenge.objective.trim() ||
			!document.challenge.solutionEntityId ||
			clues.length === 0
		) {
			return false;
		}
		return characters.some((character) => character.id === document?.challenge.solutionEntityId);
	});
	const canSubmit = $derived(Boolean(selectedAnswerId) && discoveredClueIds.length > 0 && !solved);

	function selectEntity(id: string | null) {
		selectedEntityId = id;
		feedbackKey = null;
		if (!id || !document) return;
		const entity = document.entities.find((item) => item.id === id);
		if (entity?.kind === 'clue' && !discoveredClueIds.includes(entity.id)) {
			discoveredClueIds = [...discoveredClueIds, entity.id];
		}
	}

	function submitDeduction() {
		if (!document || solved) return;
		if (!selectedAnswerId) {
			feedbackKey = 'required';
			return;
		}
		if (discoveredClueIds.length === 0) {
			feedbackKey = 'findClue';
			return;
		}
		if (selectedAnswerId === document.challenge.solutionEntityId) {
			solved = true;
			feedbackKey = 'correct';
		} else {
			feedbackKey = 'incorrect';
		}
	}

	onMount(() => {
		let cancelled = false;
		(async () => {
			const id = page.url.searchParams.get('id');
			if (!id) throw new Error(t('play.unavailable'));
			const loaded = await loadCase(id);
			if (!loaded) throw new Error(t('play.unavailable'));
			document = loaded;
			if (!canPlay) {
				loading = false;
				fatal = t('play.unavailable');
				return;
			}

			const { createLeafletEditor } = await import('#lib/game/createLeafletEditor');
			if (cancelled || !host) return;
			handle = createLeafletEditor(host, {
				document: loaded,
				mapImage: asset(SHARED_MAP_DOCUMENT.assetPath),
				editable: false,
				onSelect: selectEntity
			});
			handle.fit();
			loading = false;
		})().catch((cause: unknown) => {
			fatal = cause instanceof Error ? cause.message : String(cause);
			loading = false;
		});

		return () => {
			cancelled = true;
			handle?.destroy();
			handle = null;
		};
	});

	$effect(() => handle?.setSelected(selectedEntityId));
</script>

<svelte:head>
	<title>{t('play.title')}</title>
</svelte:head>

{#if fatal}
	<div class="play-fatal" data-testid="play-unavailable">
		<p>{fatal}</p>
		{#if document}
			<a href={`${resolve('editor/')}?id=${document.id}`}>{t('play.back')}</a>
		{:else}
			<a href={resolve('cases/')}>{t('editor.fatal.back')}</a>
		{/if}
	</div>
{:else}
	<div class="play-workspace">
		<div class="play-map" bind:this={host} data-testid="map" aria-label={t('play.map.hint')}></div>
		<div class="play-map-title" aria-hidden="true">{t('map.shared.title')}</div>

		<aside class="play-panel" data-testid="play-panel">
			<header class="play-head">
				<div>
					<h1>{document?.title ?? t('editor.loading')}</h1>
					{#if document?.summary}<p class="muted small">{document.summary}</p>{/if}
				</div>
				{#if document}<a href={`${resolve('editor/')}?id=${document.id}`}>{t('play.back')}</a>{/if}
			</header>

			{#if document && canPlay}
				<section class="play-objective" data-testid="play-objective">
					<strong>{t('play.objective')}</strong>
					<p>{document.challenge.objective}</p>
				</section>
				<p class="play-progress" data-testid="clue-progress">
					{t('play.progress', { found: discoveredClueIds.length, total: clues.length })}
				</p>
				<section class="play-inspector" data-testid="play-entity-details" aria-live="polite">
					{#if selectedEntity}
						<strong>{selectedEntity.name}</strong>
						<span class="kind">{t(`kind.${selectedEntity.kind}`)}</span>
						<p>{selectedEntity.description || t('play.inspect.description.none')}</p>
					{:else}
						<p class="muted">{t('play.inspect.empty')}</p>
					{/if}
				</section>
				{#if document.challenge.hint}
					<div class="hint-area">
						<button type="button" onclick={() => (hintVisible = true)} disabled={hintVisible}>
							{t('play.hint.reveal')}
						</button>
						{#if hintVisible}<p data-testid="play-hint">
								<strong>{t('play.hint.title')}:</strong>
								{document.challenge.hint}
							</p>{/if}
					</div>
				{/if}
				<label class="answer-field">
					<span>{t('play.answer.label')}</span>
					<select
						aria-label={t('play.answer.label')}
						bind:value={selectedAnswerId}
						disabled={solved}
					>
						<option value="">{t('play.answer.placeholder')}</option>
						{#each characters as character (character.id)}<option value={character.id}
								>{character.name}</option
							>{/each}
					</select>
				</label>
				<button type="button" class="primary" onclick={submitDeduction} disabled={!canSubmit}>
					{t('play.submit')}
				</button>
				{#if feedbackKey}
					<p
						class="feedback"
						class:success={feedbackKey === 'correct'}
						role="status"
						data-testid="play-feedback"
					>
						{t(`play.${feedbackKey}`)}
					</p>
				{/if}
			{:else if document}
				<p class="muted" data-testid="play-unavailable">{t('play.unavailable')}</p>
			{:else if loading}
				<p class="muted">{t('editor.loading')}</p>
			{/if}
		</aside>
	</div>
{/if}

<style>
	.play-workspace {
		position: fixed;
		inset: var(--header-height) 0 0;
		overflow: hidden;
		background: #eee5d3;
	}
	.play-map {
		position: absolute;
		inset: 0;
		touch-action: none;
	}
	.play-map-title {
		position: absolute;
		z-index: 2;
		top: 0.65rem;
		left: 0.75rem;
		padding: 0.45rem 0.7rem;
		border: 1px solid rgba(104, 91, 69, 0.35);
		border-radius: 8px;
		background: rgba(249, 244, 232, 0.9);
		color: #544c40;
		font-size: 0.82rem;
		font-weight: 700;
		pointer-events: none;
	}
	:global(.leaflet-container) {
		width: 100%;
		height: 100%;
		background: #eee5d3;
		font-family: system-ui, sans-serif;
	}
	:global(.krimimap-map-marker-icon) {
		background: none;
		border: 0;
		overflow: visible;
	}
	.play-panel {
		position: absolute;
		z-index: 2;
		top: 0.65rem;
		right: 0.75rem;
		bottom: 0.75rem;
		width: min(22rem, calc(100vw - 1.5rem));
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
		padding: 0.8rem;
		overflow-y: auto;
		border: 1px solid var(--border);
		border-radius: 12px;
		background: rgba(18, 21, 27, 0.94);
		backdrop-filter: blur(7px);
	}
	.play-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.play-head h1 {
		font-size: 1.1rem;
	}
	.play-head p,
	.play-objective p,
	.play-inspector p,
	.hint-area p {
		margin: 0.2rem 0 0;
	}
	.play-objective,
	.play-inspector,
	.hint-area {
		padding: 0.55rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.025);
	}
	.play-progress {
		margin: 0;
		color: var(--accent);
		font-size: 0.85rem;
		font-weight: 650;
	}
	.kind {
		display: block;
		margin-top: 0.15rem;
		color: var(--text-dim);
		font-size: 0.74rem;
	}
	.answer-field {
		display: grid;
		gap: 0.25rem;
		color: var(--text-dim);
		font-size: 0.78rem;
	}
	.answer-field select {
		padding: 0.45rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--bg);
		color: var(--text);
		font: inherit;
	}
	.feedback {
		margin: 0;
		color: var(--warn);
	}
	.feedback.success {
		color: var(--ok);
	}
	.play-fatal {
		display: grid;
		gap: 0.8rem;
		place-content: center;
		min-height: 50vh;
		padding: 2rem;
		text-align: center;
	}
	@media (max-width: 46rem) {
		.play-panel {
			top: auto;
			left: 0.6rem;
			right: 0.6rem;
			bottom: 0.6rem;
			width: auto;
			max-height: 45vh;
		}
	}
</style>
