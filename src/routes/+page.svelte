<script lang="ts">
	import { resolve } from '$app/paths';

	const buildInfo = import.meta.env.VITE_BUILD_INFO;
</script>

<svelte:head>
	<title>KrimiMap — Phase 0</title>
</svelte:head>

<div class="page">
	<h1>KrimiMap</h1>
	<p class="muted">
		Browser-basiertes Detektivspiel mit Level-Editor. Dieser Stand ist <strong>Phase 0</strong>: das
		statische Grundgerüst, der Kartenbereich und der WebLLM-Machbarkeitstest. Fallinhalte,
		Speicherung und Editor-Werkzeuge folgen in den nächsten Phasen.
	</p>

	<div class="panel">
		<h2>Was hier schon läuft</h2>
		<ul>
			<li>SvelteKit als reine statische Seite (kein Server, keine API-Aufrufe an KrimiMap).</li>
			<li>Phaser-Karte mit Ziehen, Mausrad-Zoom und Pinch-Zoom.</li>
			<li>
				WebLLM-Spike: lokales Modell per WebGPU laden, Fallentwurf generieren, Messwerte erfassen.
			</li>
			<li>Framework-freier <code>CaseDocument</code>-Entwurf mit Validierung und Unit-Tests.</li>
		</ul>
	</div>

	<div class="row">
		<a href={resolve('editor/')}><button class="primary">Karte öffnen</button></a>
		<a href={resolve('spike/webllm/')}><button>WebLLM-Spike starten</button></a>
	</div>

	<h2>Hinweis zur Vorschau</h2>
	<p class="small muted">
		Diese Seite ist ein Preview-Build aus einem Pull Request, veröffentlicht über GitHub Pages.
		WebGPU funktioniert nur in einem aktuellen Chrome/Edge (Desktop oder Android) oder in Safari ab
		Version 26; Firefox braucht noch ein Flag. Auf einem iPhone ohne WebGPU zeigt der Spike das
		sauber als „nicht verfügbar" an, statt abzustürzen.
	</p>

	{#if buildInfo}
		<p class="small muted">Build: <code>{buildInfo}</code></p>
	{/if}
</div>
