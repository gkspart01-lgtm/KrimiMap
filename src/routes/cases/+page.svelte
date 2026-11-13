<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- every target is built with resolve() plus a query string */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		caseStore,
		createCase,
		exportCurrentCase,
		importCaseFile,
		loadCases,
		openCase,
		removeCase
	} from '#lib/state/cases.svelte';
	import { storageEstimate } from '#lib/storage/db';

	const store = caseStore();
	let fileInput: HTMLInputElement;
	let usage = $state<{ usage: number; quota: number } | null>(null);
	let busy = $state(false);

	onMount(async () => {
		await loadCases();
		usage = await storageEstimate();
	});

	async function onCreate() {
		busy = true;
		const document = await createCase();
		busy = false;
		if (document) await goto(`${resolve('editor/')}?id=${document.id}`);
	}

	async function onOpen(id: string) {
		const document = await openCase(id);
		if (document) await goto(`${resolve('editor/')}?id=${document.id}`);
	}

	async function onImport(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		busy = true;
		const document = await importCaseFile(file);
		busy = false;
		if (document) await goto(`${resolve('editor/')}?id=${document.id}`);
	}

	async function onExport(id: string) {
		const document = await openCase(id);
		if (document) exportCurrentCase();
	}

	function formatDate(iso: string): string {
		const date = new Date(iso);
		return date.toLocaleString('de-DE', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function formatSize(bytes: number): string {
		if (!bytes) return '0 MB';
		return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	}
</script>

<svelte:head>
	<title>KrimiMap — Fälle</title>
</svelte:head>

<div class="page wide">
	<header class="head">
		<div>
			<h1>Deine Fälle</h1>
			<p class="muted small">
				Alles bleibt lokal in diesem Browser. Nichts wird hochgeladen, nichts verlässt das Gerät.
			</p>
		</div>
		<div class="actions">
			<button class="primary" onclick={onCreate} disabled={busy}>Neuer Fall</button>
			<button onclick={() => fileInput.click()} disabled={busy}>JSON importieren</button>
			<input
				bind:this={fileInput}
				type="file"
				accept="application/json,.json"
				onchange={onImport}
				hidden
			/>
		</div>
	</header>

	{#if store.error}
		<pre class="error" data-testid="case-error">{store.error}</pre>
	{/if}

	{#if store.cases.length === 0}
		<div class="empty">
			<p>Noch kein Fall angelegt.</p>
			<p class="muted small">
				Ein Fall ist die Arbeitsfläche: Karte, Figuren, Hinweise. Leg den ersten an — speichern
				passiert automatisch.
			</p>
		</div>
	{:else}
		<ul class="case-list" data-testid="case-list">
			{#each store.cases as entry (entry.id)}
				<li>
					<button class="case-main" onclick={() => onOpen(entry.id)}>
						<strong>{entry.title}</strong>
						<span class="muted small">
							{entry.entityCount}
							{entry.entityCount === 1 ? 'Eintrag' : 'Einträge'} · zuletzt {formatDate(
								entry.updatedAt
							)}
						</span>
						{#if entry.summary}
							<span class="muted small summary">{entry.summary}</span>
						{/if}
					</button>
					<div class="row-actions">
						<button class="ghost" onclick={() => onExport(entry.id)} title="Als JSON herunterladen"
							>Export</button
						>
						<button class="ghost danger" onclick={() => removeCase(entry.id)} title="Fall löschen"
							>Löschen</button
						>
					</div>
				</li>
			{/each}
		</ul>
	{/if}

	{#if usage}
		<p class="small muted storage">
			Belegt: {formatSize(usage.usage)} von {formatSize(usage.quota)}
		</p>
	{/if}
</div>

<style>
	.wide {
		max-width: 62rem;
	}

	.head {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		align-items: flex-start;
		justify-content: space-between;
		margin-bottom: 1.5rem;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.case-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.6rem;
	}

	.case-list li {
		display: flex;
		align-items: stretch;
		gap: 0.5rem;
		border: 1px solid var(--border);
		border-radius: 12px;
		background: var(--bg-panel);
		overflow: hidden;
	}

	.case-main {
		flex: 1;
		display: grid;
		gap: 0.25rem;
		padding: 0.9rem 1rem;
		border: 0;
		background: transparent;
		color: inherit;
		text-align: left;
		cursor: pointer;
		font: inherit;
	}

	.case-main:hover {
		background: rgba(255, 255, 255, 0.03);
	}

	.summary {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.row-actions {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding-right: 0.6rem;
	}

	button.ghost {
		padding: 0.35rem 0.6rem;
		border: 1px solid transparent;
		border-radius: 8px;
		background: transparent;
		color: var(--text-dim);
		font: inherit;
		font-size: 0.8rem;
		cursor: pointer;
	}

	button.ghost:hover {
		color: var(--text);
		border-color: var(--border);
	}

	button.ghost.danger:hover {
		color: var(--error);
		border-color: color-mix(in srgb, var(--error) 50%, transparent);
	}

	.empty {
		padding: 2rem 1.25rem;
		border: 1px dashed var(--border);
		border-radius: 12px;
		text-align: center;
	}

	.error {
		white-space: pre-wrap;
		padding: 0.75rem 1rem;
		border: 1px solid color-mix(in srgb, var(--error) 50%, transparent);
		border-radius: 10px;
		color: var(--error);
		font-size: 0.85rem;
	}

	.storage {
		margin-top: 1.25rem;
	}
</style>
