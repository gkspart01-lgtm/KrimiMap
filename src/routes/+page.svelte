<script lang="ts">
	import { resolve } from '$app/paths';
	import { debug } from '#lib/ui/debug.svelte';

	const buildInfo = import.meta.env.VITE_BUILD_INFO;
</script>

<svelte:head>
	<title>KrimiMap — Editor für Detektivfälle</title>
</svelte:head>

<div class="page">
	<h1>KrimiMap</h1>
	<p class="muted">
		Baue Detektivfälle direkt im Browser: Karte, Figuren, Hinweise. Alles bleibt auf deinem Gerät —
		kein Konto, kein Server, und nach dem ersten Besuch funktioniert der Editor auch offline.
	</p>

	<div class="row">
		<a href={resolve('editor/')}><button class="primary">Karte öffnen</button></a>
	</div>

	<div class="panel">
		<h2>Was jetzt schon geht</h2>
		<ul>
			<li>Karte mit Ziehen, Mausrad-Zoom und Zwei-Finger-Zoom.</li>
			<li>Als App installierbar und offline nutzbar.</li>
			<li>Fälle anlegen, Figuren und Hinweise setzen, lokal speichern — kommt als Nächstes.</li>
		</ul>
	</div>

	{#if debug()}
		<div class="panel debug-panel" data-testid="debug-panel">
			<h2>Technische Details</h2>
			<ul>
				<li>SvelteKit als reine statische Seite, kein Server, keine API-Aufrufe an KrimiMap.</li>
				<li>Phaser-Karte mit framework-freiem Kamera-Controller und Unit-Tests.</li>
				<li><a href={resolve('spike/webllm/')}>WebLLM-Spike</a> — lokales Modell per WebGPU.</li>
				<li>WebGPU braucht aktuelles Chrome/Edge (Desktop oder Android) oder Safari ab 26.</li>
			</ul>
			{#if buildInfo}
				<p class="small muted">Build: <code data-testid="build-info">{buildInfo}</code></p>
			{/if}
		</div>
	{/if}
</div>
