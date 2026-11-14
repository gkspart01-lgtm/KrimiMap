<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- routes include a case id query */
	import { onMount, tick } from 'svelte';
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
	let hintElement = $state<HTMLParagraphElement | null>(null);
	let solved = $state(false);
	let feedbackKey = $state<'answer.required' | 'find.clue' | 'incorrect' | 'correct' | null>(null);

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
			feedbackKey = 'answer.required';
			return;
		}
		if (discoveredClueIds.length === 0) {
			feedbackKey = 'find.clue';
			return;
		}
		if (selectedAnswerId === document.challenge.solutionEntityId) {
			solved = true;
			feedbackKey = 'correct';
		} else {
			feedbackKey = 'incorrect';
		}
	}

	function revealHint() {
		hintVisible = true;
		void tick().then(() => hintElement?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
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
						<button type="button" onclick={revealHint} disabled={hintVisible}>
							{t('play.hint.reveal')}
						</button>
						{#if hintVisible}
							<p bind:this={hintElement} class="hint-card" role="status" data-testid="play-hint">
								<strong>{t('play.hint.title')}</strong>
								<span>{document.challenge.hint}</span>
							</p>
						{/if}
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
		z-index: 0;
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
		scroll-padding-block: 0.75rem;
		border: 1px solid var(--border);
		border-radius: 12px;
		background: rgba(18, 21, 27, 0.98);
		box-shadow: 0 14px 38px rgba(0, 0, 0, 0.38);
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
		padding: 0.75rem;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: rgba(255, 255, 255, 0.035);
	}
	.play-objective > strong {
		display: block;
		margin-bottom: 0.25rem;
		color: var(--accent);
		font-size: 0.72rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.play-objective p,
	.play-inspector p {
		margin: 0.3rem 0 0;
	}
	.hint-area {
		border-color: rgba(240, 180, 41, 0.32);
		background: rgba(240, 180, 41, 0.045);
	}
	.hint-card {
		display: grid;
		gap: 0.3rem;
		margin: 0.55rem 0 0;
		padding: 0.7rem 0.75rem;
		scroll-margin-block: 0.75rem;
		border: 1px solid rgba(240, 180, 41, 0.35);
		border-left: 3px solid var(--accent);
		border-radius: 8px;
		background: linear-gradient(135deg, rgba(240, 180, 41, 0.14), rgba(255, 255, 255, 0.025));
		color: var(--text);
		font-size: 0.88rem;
		line-height: 1.45;
		overflow-wrap: anywhere;
	}
	.hint-card strong {
		color: var(--accent);
		font-size: 0.72rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.play-progress {
		align-self: flex-start;
		margin: 0;
		padding: 0.22rem 0.6rem;
		border: 1px solid rgba(240, 180, 41, 0.25);
		border-radius: 999px;
		background: rgba(240, 180, 41, 0.08);
		color: var(--accent);
		font-size: 0.78rem;
		font-weight: 650;
	}
	.play-inspector strong {
		display: block;
		font-size: 0.95rem;
	}
	.kind {
		display: inline-flex;
		align-items: center;
		margin-top: 0.3rem;
		padding: 0.12rem 0.45rem;
		border-radius: 999px;
		background: var(--bg-raised);
		color: var(--text-dim);
		font-size: 0.68rem;
		font-weight: 650;
		letter-spacing: 0.04em;
		text-transform: uppercase;
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
		.play-map {
			/* Keep the touchable map separate from the bottom-sheet controls. */
			height: auto;
			bottom: calc(45vh + 1.2rem);
		}

		.play-panel {
			top: auto;
			left: 0.6rem;
			right: 0.6rem;
			bottom: 0.6rem;
			width: auto;
			height: 45vh;
			max-height: 45vh;
		}
	}
</style>
