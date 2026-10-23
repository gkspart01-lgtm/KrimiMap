<script lang="ts">
	import { onMount } from 'svelte';
	import type { EditorGameHandle } from '#lib/game/createEditorGame';

	let host: HTMLDivElement;
	let handle: EditorGameHandle | null = null;
	let ready = $state(false);
	let error = $state<string | null>(null);
	let zoom = $state(0);
	let centre = $state({ x: 0, y: 0 });

	onMount(() => {
		let cancelled = false;

		// Phaser and WebGL must only start in the browser, never during prerender.
		import('#lib/game/createEditorGame')
			.then(({ createEditorGame }) => {
				if (cancelled) return;
				handle = createEditorGame(host, {
					onCamera: (camera) => {
						zoom = camera.zoom;
						centre = { x: Math.round(camera.x), y: Math.round(camera.y) };
					}
				});
				ready = true;
			})
			.catch((cause: unknown) => {
				error = cause instanceof Error ? cause.message : String(cause);
			});

		return () => {
			cancelled = true;
			handle?.destroy();
			handle = null;
		};
	});
</script>

<svelte:head>
	<title>KrimiMap — Editor</title>
</svelte:head>

<div class="workspace">
	<div class="canvas" bind:this={host}></div>

	<div class="hud">
		<strong>Editor</strong>
		<span class="muted small">Ziehen = verschieben · Mausrad / Pinch = zoomen</span>
		<span class="small">Zoom {(zoom * 100).toFixed(0)}% · Mitte {centre.x}/{centre.y}</span>
	</div>

	{#if !ready && !error}
		<div class="overlay muted">Karte wird geladen…</div>
	{/if}

	{#if error}
		<div class="overlay error">Canvas-Start fehlgeschlagen: {error}</div>
	{/if}

	<div class="toolbar">
		<button onclick={() => handle?.zoomOut()} aria-label="Herauszoomen">−</button>
		<button onclick={() => handle?.zoomIn()} aria-label="Hineinzoomen">+</button>
		<button onclick={() => handle?.fit()}>Ganze Karte</button>
	</div>
</div>

<style>
	.workspace {
		position: fixed;
		inset: 0;
		/* Leave room for the site header. */
		padding-top: 3.1rem;
		background: #0f1218;
		overflow: hidden;
	}

	.canvas {
		position: absolute;
		inset: 3.1rem 0 0 0;
		touch-action: none;
	}

	.hud,
	.toolbar {
		position: absolute;
		z-index: 2;
		display: flex;
		gap: 0.5rem;
		align-items: center;
		background: rgba(18, 21, 27, 0.86);
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 0.5rem 0.75rem;
		backdrop-filter: blur(6px);
	}

	.hud {
		top: 3.6rem;
		left: 0.75rem;
		flex-direction: column;
		align-items: flex-start;
		max-width: 18rem;
	}

	.toolbar {
		right: 0.75rem;
		bottom: 0.9rem;
	}

	.overlay {
		position: absolute;
		inset: 3.1rem 0 0 0;
		display: grid;
		place-items: center;
		z-index: 3;
		pointer-events: none;
		font-size: 0.95rem;
	}

	.overlay.error {
		color: var(--error);
		background: rgba(18, 21, 27, 0.9);
	}
</style>
