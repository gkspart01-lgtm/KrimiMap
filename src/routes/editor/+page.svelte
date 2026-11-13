<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- every target is built with resolve() plus a query string */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import type { EditorGameHandle } from '#lib/game/createEditorGame';
	import type { EntityKind } from '#lib/domain/case-document';
	import { ENTITY_KINDS, ENTITY_KIND_COLORS } from '#lib/domain/case-document';
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
		updateCaseEntity
	} from '#lib/state/cases.svelte';

	const store = caseStore();

	let host = $state<HTMLDivElement | null>(null);
	let handle: EditorGameHandle | null = null;
	let ready = $state(false);
	let fatal = $state<string | null>(null);
	let zoom = $state(0);
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
			const document = requested ? await openCase(requested) : await openCase(lastCaseId() ?? '');
			const active = document ?? (await createCase());
			if (cancelled) return;
			if (!active) {
				fatal = t('editor.fatal');
				return;
			}
			if (!requested) await goto(`${resolve('editor/')}?id=${active.id}`, { replaceState: true });

			// Phaser and WebGL must only start in the browser, never during prerender.
			const { createEditorGame } = await import('#lib/game/createEditorGame');
			if (cancelled || !host) return;
			handle = createEditorGame(host, {
				document: active,
				onCamera: (camera) => {
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

	$effect(() => {
		handle?.setSelected(store.selectedId);
	});

	/**
	 * New markers land near the view centre, but never on top of an existing one:
	 * the golden-angle spiral finds the first free spot, so repeated clicks
	 * produce a readable cluster instead of a single unclickable stack.
	 */
	function freePosition(): { x: number; y: number } {
		const centre = handle?.camera() ?? { x: 1200, y: 800, zoom: 1 };
		const size = store.current?.map ?? { width: 2400, height: 1600 };
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

		<div class="hud" aria-hidden="true" data-testid="map-hud">
			<strong>{store.current?.title ?? 'Karte'}</strong>
			<span class="muted small">{t('editor.hud.hint')}</span>
			{#if debug()}
				<span class="small mono" data-testid="zoom-label"
					>{t('editor.hud.debug', {
						percent: formatNumber(zoom * 100),
						x: formatNumber(centre.x),
						y: formatNumber(centre.y),
						width: store.current?.map.width ?? 0,
						height: store.current?.map.height ?? 0
					})}</span
				>
			{/if}
		</div>

		<aside class="panel" data-testid="editor-panel">
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
		touch-action: none;
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
		max-width: 20rem;
		padding: 0.5rem 0.75rem;
		/* Informational only: a drag that starts here must still move the map. */
		pointer-events: none;
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

	@media (max-width: 46rem) {
		.panel {
			top: auto;
			right: 0.75rem;
			left: 0.75rem;
			width: auto;
			max-height: 32vh;
		}

		.hud {
			max-width: 60vw;
		}
	}
</style>
