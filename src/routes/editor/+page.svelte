<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- every target is built with resolve() plus a query string */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve, asset } from '$app/paths';
	import type { EditorMapHandle } from '#lib/game/createLeafletEditor';
	import type { EntityKind } from '#lib/domain/case-document';
	import { ENTITY_KINDS, ENTITY_KIND_COLORS } from '#lib/domain/case-document';
	import { SHARED_MAP_DOCUMENT } from '#lib/domain/map-document';
	import { listCaseDocuments } from '#lib/storage/db';
	import { debug } from '#lib/ui/debug.svelte';
	import { formatNumber, t, tIssue } from '#lib/i18n/index.svelte';
	import {
		addEntityAtCenter,
		caseStore,
		createCase,
		deleteCaseEntity,
		flushCaseSave,
		lastCaseId,
		moveCaseEntity,
		openCase,
		redoCaseEdit,
		renameCurrentCase,
		selectEntity,
		undoCaseEdit,
		updateCaseEntity,
		updateCaseChallenge,
		updateCaseSummary
	} from '#lib/state/cases.svelte';

	const store = caseStore();

	let host = $state<HTMLDivElement | null>(null);
	let handle: EditorMapHandle | null = null;
	let ready = $state(false);
	let fatal = $state<string | null>(null);
	let zoom = $state(0);
	let inactiveEntityCount = $state(0);
	/** Phones get a drawer instead of a permanent panel: the canvas needs the room. */
	let panelOpen = $state(false);
	let centre = $state({ x: 0, y: 0 });

	const saveLabel = $derived(
		store.saveState === 'saving'
			? t('save.saving')
			: store.saveState === 'dirty'
				? t('save.dirty')
				: store.saveState === 'error'
					? t('save.error')
					: store.saveState === 'saved'
						? t('save.saved')
						: ''
	);

	const characters = $derived(
		(store.current?.entities ?? []).filter((entity) => entity.kind === 'character')
	);
	const canPlaytest = $derived.by(() => {
		const document = store.current;
		if (!document?.challenge.objective.trim() || !document.challenge.solutionEntityId) return false;
		return (
			document.entities.some(
				(entity) => entity.kind === 'character' && entity.id === document.challenge.solutionEntityId
			) && document.entities.some((entity) => entity.kind === 'clue')
		);
	});

	// Undo/redo shortcuts. Text fields keep their own undo, so the handler steps
	// aside for inputs — only the document history responds here.
	onMount(() => {
		const onKeydown = (event: KeyboardEvent) => {
			if (!(event.ctrlKey || event.metaKey)) return;
			if (event.key.toLowerCase() !== 'z') return;
			const target = event.target as HTMLElement | null;
			if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
			event.preventDefault();
			if (event.shiftKey) redoCaseEdit();
			else undoCaseEdit();
		};

		window.addEventListener('keydown', onKeydown);
		return () => window.removeEventListener('keydown', onKeydown);
	});

	onMount(() => {
		let cancelled = false;

		(async () => {
			// `?id=` wins, then the last opened case, then a brand new one: the
			// editor is never a dead end.
			const requested = page.url.searchParams.get('id');
			const loaded = requested ? await openCase(requested) : await openCase(lastCaseId() ?? '');
			const active = loaded ?? (await createCase());
			if (cancelled) return;
			if (!active) {
				fatal = t('editor.fatal');
				return;
			}
			if (!requested) await goto(`${resolve('editor/')}?id=${active.id}`, { replaceState: true });

			const allCases = await listCaseDocuments();
			const backgroundCases = allCases.filter((document) => document.id !== active.id);
			inactiveEntityCount = backgroundCases.reduce(
				(count, document) => count + document.entities.length,
				0
			);

			// Leaflet and its CSS are browser-only; keep them out of prerendering.
			const { createLeafletEditor } = await import('#lib/game/createLeafletEditor');
			if (cancelled || !host) return;
			handle = createLeafletEditor(host, {
				document: active,
				backgroundDocuments: backgroundCases,
				mapImage: asset(SHARED_MAP_DOCUMENT.assetPath),
				onCamera: (camera) => {
					if (!debug()) return;
					zoom = camera.zoom;
					centre = { x: Math.round(camera.x), y: Math.round(camera.y) };
				},
				onSelect: (id) => selectEntity(id),
				onEntityMove: (id, position) => moveCaseEntity(id, position)
			});
			handle.fit();
			ready = true;
		})().catch((cause: unknown) => {
			fatal = cause instanceof Error ? cause.message : String(cause);
		});

		return () => {
			cancelled = true;
			void flushCaseSave();
			handle?.destroy();
			handle = null;
		};
	});

	// Keep the canvas in sync with the document and the selection.
	$effect(() => {
		const document = store.current;
		if (handle && document) handle.setDocument(document);
	});

	// Open the drawer when the selection changes, not whenever it is closed: reading
	// `panelOpen` here would make the effect re-run on every toggle and immediately
	// reopen the drawer the user just closed.
	let lastSelectedId: string | null = null;
	$effect(() => {
		const id = store.selectedId;
		handle?.setSelected(id);
		if (id && id !== lastSelectedId && window.matchMedia('(max-width: 46rem)').matches) {
			panelOpen = true;
		}
		lastSelectedId = id;
	});

	/**
	 * New markers land near the view centre, but never on top of an existing one:
	 * the golden-angle spiral finds the first free spot, so repeated clicks
	 * produce a readable cluster instead of a single unclickable stack.
	 */
	function freePosition(): { x: number; y: number } {
		const centre = handle?.camera() ?? { x: 1200, y: 800, zoom: 1 };
		const size = SHARED_MAP_DOCUMENT;
		const entities = store.current?.entities ?? [];
		const clampAxis = (value: number, max: number) => Math.min(max - 50, Math.max(50, value));
		const isFree = (candidate: { x: number; y: number }) =>
			!entities.some(
				(entity) =>
					Math.hypot(entity.position.x - candidate.x, entity.position.y - candidate.y) < 90
			);

		for (let index = 0; index < 60; index += 1) {
			const angle = index * 2.399963;
			const radius = 70 + 30 * Math.sqrt(index);
			const candidate = {
				x: clampAxis(centre.x + Math.cos(angle) * radius, size.width),
				y: clampAxis(centre.y + Math.sin(angle) * radius, size.height)
			};
			if (isFree(candidate)) return candidate;
		}
		return { x: clampAxis(centre.x, size.width), y: clampAxis(centre.y, size.height) };
	}

	function addEntity(kind: EntityKind) {
		addEntityAtCenter(kind, freePosition());
	}

	function onKindChange(kind: EntityKind) {
		patchSelected({ kind, color: ENTITY_KIND_COLORS[kind] });
	}

	/** Template-safe patch: no non-null assertions inside markup expressions. */
	function patchSelected(patch: Parameters<typeof updateCaseEntity>[1]) {
		const selected = store.selected;
		if (!selected) return;
		updateCaseEntity(selected.id, patch);
	}

	function startPlaytest() {
		const id = store.current?.id;
		if (!id || !canPlaytest) return;
		void goto(`${resolve('play/')}?id=${id}`);
	}

	function deleteSelected() {
		const selected = store.selected;
		if (!selected) return;
		deleteCaseEntity(selected.id);
	}
</script>

<svelte:head>
	<title>{t('editor.title')}</title>
</svelte:head>

{#if fatal}
	<div class="fatal">
		<p>{fatal}</p>
		<a href={resolve('cases/')}>{t('editor.fatal.back')}</a>
	</div>
{:else}
	<div class="workspace">
		<div class="canvas" bind:this={host} data-testid="map"></div>

		<div class="hud" data-testid="map-hud">
			<strong>{t('map.shared.title')}</strong>
			<span class="muted small"
				>{t('editor.hud.current-case', { title: store.current?.title ?? '' })}</span
			>
			<span class="ghost-legend small" data-testid="shared-map-legend">
				<i aria-hidden="true"></i>
				{t('editor.hud.other-cases', { count: inactiveEntityCount })}
			</span>
			<span class="muted small">{t('editor.hud.hint')}</span>
			{#if debug()}
				<span class="small mono" data-testid="zoom-label"
					>{t('editor.hud.debug', {
						percent: formatNumber(zoom * 100),
						x: formatNumber(centre.x),
						y: formatNumber(centre.y),
						width: SHARED_MAP_DOCUMENT.width,
						height: SHARED_MAP_DOCUMENT.height
					})}</span
				>
			{/if}
		</div>

		<button
			type="button"
			class="panel-toggle"
			aria-expanded={panelOpen}
			onclick={() => (panelOpen = !panelOpen)}>{t('editor.panel.toggle')}</button
		>

		<aside class="panel" class:open={panelOpen} data-testid="editor-panel">
			<div class="panel-head">
				<input
					class="title"
					value={store.current?.title ?? ''}
					oninput={(event) => renameCurrentCase(event.currentTarget.value)}
					aria-label={t('editor.title.label')}
				/>
				<a class="back" href={resolve('cases/')}>{t('editor.back')}</a>
			</div>

			<div
				class="status"
				data-testid="save-state"
				data-state={store.saveState}
				title={store.error ?? ''}
			>
				<span class="dot"></span>{saveLabel}
			</div>
			{#if store.error}
				<p class="save-error small" data-testid="save-error">{store.error}</p>
			{/if}

			<div class="history-row">
				<button
					type="button"
					class="ghost"
					disabled={!store.canUndo}
					title={t('editor.undo')}
					aria-label={t('editor.undo')}
					onclick={undoCaseEdit}>↶</button
				>
				<button
					type="button"
					class="ghost"
					disabled={!store.canRedo}
					title={t('editor.redo')}
					aria-label={t('editor.redo')}
					onclick={redoCaseEdit}>↷</button
				>
			</div>

			<div class="challenge-form" data-testid="challenge-form">
				<h2>{t('editor.challenge.title')}</h2>
				<label>
					<span>{t('editor.challenge.premise')}</span>
					<textarea
						rows="2"
						value={store.current?.summary ?? ''}
						oninput={(event) => updateCaseSummary(event.currentTarget.value)}></textarea>
				</label>
				<label>
					<span>{t('editor.challenge.objective')}</span>
					<textarea
						rows="2"
						value={store.current?.challenge.objective ?? ''}
						oninput={(event) => updateCaseChallenge({ objective: event.currentTarget.value })}
					></textarea>
				</label>
				<label>
					<span>{t('editor.challenge.solution')}</span>
					<select
						value={store.current?.challenge.solutionEntityId ?? ''}
						onchange={(event) =>
							updateCaseChallenge({ solutionEntityId: event.currentTarget.value || null })}
					>
						<option value="">{t('editor.challenge.solution.none')}</option>
						{#each characters as character (character.id)}
							<option value={character.id}>{character.name}</option>
						{/each}
					</select>
				</label>
				<label>
					<span>{t('editor.challenge.hint')}</span>
					<textarea
						rows="2"
						value={store.current?.challenge.hint ?? ''}
						oninput={(event) => updateCaseChallenge({ hint: event.currentTarget.value })}
					></textarea>
				</label>
				<button
					class="primary"
					disabled={!canPlaytest}
					data-testid="playtest-button"
					onclick={startPlaytest}>{t('editor.challenge.playtest')}</button
				>
				<p class="muted small">
					{t(canPlaytest ? 'editor.challenge.ready' : 'editor.challenge.incomplete')}
				</p>
			</div>

			<div class="add-row">
				{#each ENTITY_KINDS as kind (kind)}
					<button
						class="add"
						style="--kind-color: {ENTITY_KIND_COLORS[kind]}"
						onclick={() => addEntity(kind)}>+ {t(`kind.${kind}`)}</button
					>
				{/each}
			</div>

			{#if store.selected}
				<div class="entity-form" data-testid="entity-form">
					<label>
						<span>{t('editor.form.name')}</span>
						<input
							value={store.selected.name}
							oninput={(event) => patchSelected({ name: event.currentTarget.value })}
						/>
					</label>
					<label>
						<span>{t('editor.form.kind')}</span>
						<select
							value={store.selected.kind}
							onchange={(event) => onKindChange(event.currentTarget.value as EntityKind)}
						>
							{#each ENTITY_KINDS as kind (kind)}
								<option value={kind}>{t(`kind.${kind}`)}</option>
							{/each}
						</select>
					</label>
					<label>
						<span>{t('editor.form.description')}</span>
						<textarea
							rows="3"
							value={store.selected.description}
							oninput={(event) => patchSelected({ description: event.currentTarget.value })}
						></textarea>
					</label>
					<div class="coords small muted">
						x {Math.round(store.selected.position.x)} · y {Math.round(store.selected.position.y)} · id
						<code>{store.selected.id}</code>
					</div>
					<button class="danger" onclick={deleteSelected}>{t('editor.form.delete')}</button>
				</div>
			{:else}
				<p class="muted small hint">
					{t('editor.hint.none')}
				</p>
			{/if}

			{#if store.issues.length > 0}
				<div class="issues" data-testid="case-issues">
					<strong class="small">{t('editor.issues')}</strong>
					<ul class="small">
						{#each store.issues.slice(0, 5) as issue (issue.path + issue.message)}
							<li>{issue.path}: {tIssue(issue.code, issue.message, issue.params)}</li>
						{/each}
					</ul>
				</div>
			{/if}
		</aside>

		<div class="toolbar">
			<button onclick={() => handle?.zoomOut()} aria-label="Herauszoomen">−</button>
			<button onclick={() => handle?.zoomIn()} aria-label="Hineinzoomen">+</button>
			<button onclick={() => handle?.fit()}>Ganze Karte</button>
		</div>

		{#if !ready && !fatal}
			<div class="overlay muted">{t('editor.loading')}</div>
		{/if}
	</div>
{/if}

<style>
	.workspace {
		position: fixed;
		/* Below the site header, so the header stays visible and clickable. */
		inset: var(--header-height) 0 0 0;
		background: #0f1218;
		overflow: hidden;
	}

	.canvas {
		position: absolute;
		inset: 0;
		background: #eee5d3;
		touch-action: none;
	}

	:global(.leaflet-container) {
		width: 100%;
		height: 100%;
		background: #eee5d3;
		font-family: system-ui, sans-serif;
		cursor: grab;
	}

	:global(.leaflet-container.leaflet-dragging) {
		cursor: grabbing;
	}

	:global(.leaflet-image-layer) {
		user-select: none;
		-webkit-user-drag: none;
	}

	:global(.krimimap-map-marker-icon) {
		background: none;
		border: 0;
		overflow: visible;
	}

	:global(.krimimap-map-marker) {
		width: max-content;
		height: 34px;
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		white-space: nowrap;
		transform: translateX(-2px);
		pointer-events: auto;
		cursor: grab;
		filter: drop-shadow(0 2px 3px rgba(25, 30, 36, 0.35));
	}

	:global(.krimimap-map-marker__dot) {
		width: 26px;
		height: 26px;
		flex: 0 0 26px;
		border: 3px solid #f8f4ec;
		border-radius: 50%;
		background: var(--entity-color);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--entity-color) 85%, #2a2d32);
	}

	:global(.krimimap-map-marker__label) {
		max-width: 18rem;
		overflow: hidden;
		text-overflow: ellipsis;
		padding: 0.2rem 0.42rem;
		border: 1px solid rgba(104, 91, 69, 0.5);
		border-radius: 5px;
		background: rgba(249, 244, 232, 0.94);
		color: #38352f;
		font-size: 0.78rem;
		font-weight: 700;
		box-shadow: 0 1px 3px rgba(38, 35, 30, 0.18);
	}

	:global(.krimimap-map-marker.is-selected .krimimap-map-marker__dot) {
		box-shadow:
			0 0 0 3px #fff,
			0 0 0 6px rgba(40, 53, 67, 0.78);
	}

	:global(.krimimap-map-marker.is-inactive) {
		filter: grayscale(1);
		opacity: 0.34;
		cursor: default;
		pointer-events: none;
	}

	:global(.krimimap-map-marker.is-inactive .krimimap-map-marker__label) {
		border-color: rgba(100, 100, 100, 0.24);
		background: rgba(220, 220, 220, 0.45);
		color: #777;
	}

	.hud,
	.toolbar,
	.panel {
		position: absolute;
		z-index: 2;
		background: rgba(18, 21, 27, 0.9);
		border: 1px solid var(--border);
		border-radius: 10px;
		backdrop-filter: blur(6px);
	}

	.hud {
		top: 0.6rem;
		left: 0.75rem;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.15rem;
		max-width: min(22rem, 70vw);
		padding: 0.5rem 0.75rem;
		pointer-events: none;
	}

	.ghost-legend {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		color: var(--text-dim);
	}

	.ghost-legend i {
		width: 0.6rem;
		height: 0.6rem;
		border-radius: 50%;
		background: #929292;
		opacity: 0.7;
	}

	.toolbar {
		right: 0.75rem;
		bottom: 0.9rem;
		display: flex;
		gap: 0.5rem;
		align-items: center;
		padding: 0.5rem 0.75rem;
	}

	.panel {
		top: 0.6rem;
		right: 0.75rem;
		bottom: 4.6rem;
		width: min(20rem, calc(100vw - 1.5rem));
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		padding: 0.75rem;
		overflow-y: auto;
	}

	.panel-head {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.title {
		flex: 1;
		min-width: 0;
		padding: 0.35rem 0.5rem;
		border: 1px solid transparent;
		border-radius: 8px;
		background: transparent;
		color: var(--text);
		font: inherit;
		font-weight: 600;
	}

	.title:hover,
	.title:focus {
		border-color: var(--border);
		background: rgba(255, 255, 255, 0.03);
	}

	.back {
		color: var(--text-dim);
		font-size: 0.8rem;
		text-decoration: none;
	}

	.back:hover {
		color: var(--text);
	}

	.status {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.72rem;
		color: var(--text-dim);
	}

	.status .dot {
		width: 0.45rem;
		height: 0.45rem;
		border-radius: 50%;
		background: #e8a33d;
	}

	/* Green only when the document is really on disk; amber while a save is
	   pending or running. */
	.status[data-state='saved'] .dot {
		background: #4ec9a0;
	}

	.status[data-state='error'] .dot {
		background: var(--error);
	}

	.save-error {
		margin: 0;
		color: var(--error);
	}

	.history-row {
		display: flex;
		gap: 0.35rem;
	}

	button.ghost {
		min-width: 2.1rem;
		padding: 0.25rem 0.5rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: transparent;
		color: var(--text);
		font: inherit;
		cursor: pointer;
	}

	button.ghost:disabled {
		opacity: 0.35;
		cursor: default;
	}

	.add-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.4rem;
	}

	button.add {
		padding: 0.4rem 0.5rem;
		border: 1px solid color-mix(in srgb, var(--kind-color) 55%, var(--border));
		border-radius: 8px;
		background: color-mix(in srgb, var(--kind-color) 12%, transparent);
		color: var(--text);
		font: inherit;
		font-size: 0.78rem;
		cursor: pointer;
	}

	button.add:hover {
		background: color-mix(in srgb, var(--kind-color) 24%, transparent);
	}

	.challenge-form {
		display: grid;
		gap: 0.45rem;
		padding: 0.65rem 0;
		border-top: 1px solid var(--border);
		border-bottom: 1px solid var(--border);
	}

	.challenge-form h2 {
		margin: 0;
		font-size: 0.9rem;
	}

	.challenge-form label {
		display: grid;
		gap: 0.2rem;
		font-size: 0.72rem;
		color: var(--text-dim);
	}

	.challenge-form textarea,
	.challenge-form select {
		width: 100%;
		padding: 0.35rem 0.5rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: #0f1218;
		color: var(--text);
		font: inherit;
		font-size: 0.82rem;
	}

	.challenge-form p {
		margin: 0;
	}

	.entity-form {
		display: grid;
		gap: 0.5rem;
		padding-top: 0.6rem;
		border-top: 1px solid var(--border);
	}

	.entity-form label {
		display: grid;
		gap: 0.2rem;
		font-size: 0.72rem;
		color: var(--text-dim);
	}

	.entity-form input,
	.entity-form select,
	.entity-form textarea {
		padding: 0.35rem 0.5rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: #0f1218;
		color: var(--text);
		font: inherit;
		font-size: 0.82rem;
	}

	.coords code {
		font-size: 0.7rem;
	}

	button.danger {
		padding: 0.4rem 0.6rem;
		border: 1px solid color-mix(in srgb, var(--error) 45%, transparent);
		border-radius: 8px;
		background: transparent;
		color: var(--error);
		font: inherit;
		font-size: 0.78rem;
		cursor: pointer;
	}

	.issues ul {
		margin: 0.3rem 0 0;
		padding-left: 1rem;
		color: var(--text-dim);
	}

	.hint {
		margin: 0;
	}

	.overlay {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		z-index: 3;
		pointer-events: none;
		font-size: 0.95rem;
	}

	.fatal {
		display: grid;
		gap: 0.5rem;
		place-items: center;
		padding: 3rem 1rem;
	}

	.panel-toggle {
		display: none;
	}

	@media (max-width: 46rem) {
		.panel {
			top: auto;
			right: 0.75rem;
			left: 0.75rem;
			width: auto;
			max-height: 42vh;
			/* Closed by default: a permanent sheet would eat half the canvas. */
			transform: translateY(calc(100% + 5rem));
			transition: transform 160ms ease;
		}

		.panel.open {
			transform: none;
		}

		.panel-toggle {
			position: absolute;
			z-index: 3;
			right: 0.75rem;
			bottom: 4.9rem;
			display: block;
			padding: 0.4rem 0.7rem;
			border: 1px solid var(--border);
			border-radius: 999px;
			background: rgba(18, 21, 27, 0.92);
			color: var(--text);
			font: inherit;
			font-size: 0.78rem;
			cursor: pointer;
		}

		.hud {
			max-width: 60vw;
		}
	}
</style>
