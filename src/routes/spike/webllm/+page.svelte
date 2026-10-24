<script lang="ts">
	import { onMount } from 'svelte';
	import {
		availableModels,
		detectGpu,
		heapMegabytes,
		loadModel,
		runCaseDraftAttempts,
		type AttemptResult,
		type GpuReport,
		type LoadedEngine,
		type ModelOption,
		type StructuredMode
	} from '#lib/ai/local/webllm-spike';

	const STORAGE_KEY = 'krimimap:spike-report';

	let gpu = $state<GpuReport | null>(null);
	let models = $state<ModelOption[]>([]);
	let modelId = $state('');
	let engine = $state<LoadedEngine | null>(null);
	let loading = $state(false);
	let loadText = $state('');
	let loadProgress = $state(0);
	let loadMs = $state<number | null>(null);
	let generating = $state(false);
	let topic = $state('ein verschwundener Förster im Nebelwald');
	let mode = $state<StructuredMode>('text');
	let maxAttempts = $state(1);
	let output = $state('');
	let attempts = $state<AttemptResult[]>([]);
	let verdict = $state('');
	let error = $state<string | null>(null);
	let report = $state<string>('');
	let copied = $state(false);

	onMount(() => {
		detectGpu().then((value) => (gpu = value));
		availableModels().then((value) => {
			models = value;
			if (!modelId && value.length > 0) modelId = value[0].id;
		});
		const saved = localStorage.getItem(STORAGE_KEY);
		if (saved) report = saved;
	});

	const model = $derived(models.find((candidate) => candidate.id === modelId));
	const lastAttempt = $derived(attempts.length > 0 ? attempts[attempts.length - 1] : null);

	async function doLoad() {
		error = null;
		loading = true;
		output = '';
		attempts = [];
		verdict = '';
		loadProgress = 0;
		loadText = 'initialising runtime…';
		try {
			const result = await loadModel(modelId, (progress) => {
				loadText = progress.text;
				loadProgress = progress.progress;
			});
			engine = result.engine;
			loadMs = result.loadMs;
		} catch (cause) {
			error = cause instanceof Error ? cause.message : String(cause);
		} finally {
			loading = false;
		}
	}

	async function doGenerate() {
		if (!engine) return;
		error = null;
		generating = true;
		output = '';
		attempts = [];
		verdict = 'läuft…';
		const heapBefore = heapMegabytes();

		try {
			const result = await runCaseDraftAttempts(engine, topic, {
				maxAttempts,
				mode,
				temperature: 0.7,
				onChunk: (text) => (output = text)
			});
			attempts = result.attempts;
			verdict = result.ok
				? `schema-konform nach Versuch ${result.attempts.length} ✔`
				: `nach ${result.attempts.length} Versuch(en) kein schema-konformer Entwurf`;

			report = JSON.stringify(
				{
					measuredAt: new Date().toISOString(),
					device: gpu,
					model: modelId,
					modelLicence: model?.license,
					vramRequiredMB: model?.vramMB,
					modelLoadMs: loadMs,
					mode,
					maxAttempts,
					attempts: result.attempts.map((attempt) => ({
						index: attempt.index,
						jsonOk: attempt.jsonOk,
						validation: attempt.validation,
						repairs: attempt.repairs,
						firstTokenMs: Math.round(attempt.metrics.firstTokenMs),
						totalMs: Math.round(attempt.metrics.totalMs),
						promptTokens: attempt.metrics.promptTokens,
						completionTokens: attempt.metrics.completionTokens,
						charsPerSecond: Number(attempt.metrics.charsPerSecond.toFixed(1))
					})),
					schemaConform: result.ok,
					verdict,
					heapBeforeMB: heapBefore,
					heapAfterMB: heapMegabytes(),
					crossOriginIsolated: gpu?.crossOriginIsolated
				},
				null,
				2
			);
			localStorage.setItem(STORAGE_KEY, report);
		} catch (cause) {
			verdict = '';
			error = cause instanceof Error ? cause.message : String(cause);
		} finally {
			generating = false;
		}
	}

	async function interrupt() {
		await engine?.interruptGenerate();
	}

	function copyReport() {
		navigator.clipboard?.writeText(report).then(() => {
			copied = true;
			setTimeout(() => (copied = false), 2000);
		});
	}

	function downloadReport() {
		const blob = new Blob([report], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = `krimimap-webllm-spike-${Date.now()}.json`;
		link.click();
		URL.revokeObjectURL(url);
	}
</script>

<svelte:head>
	<title>KrimiMap — WebLLM-Spike</title>
</svelte:head>

<div class="page">
	<h1>WebLLM-Spike: lokale KI im Browser</h1>
	<p class="muted">
		Misst, ob ein kleines Sprachmodell per WebGPU im Browser läuft und ob es einen strukturierten
		Krimi-Entwurf liefert. Nichts verlässt das Gerät — die Modellgewichte kommen einmalig von einem
		öffentlichen CDN und liegen danach im Browser-Cache.
	</p>

	<div class="panel">
		<h2>1. Gerät</h2>
		{#if gpu}
			<table>
				<tbody>
					<tr>
						<th>WebGPU</th>
						<td class:ok={gpu.supported} class:bad={!gpu.supported}>
							{gpu.supported ? 'verfügbar' : `nicht verfügbar — ${gpu.reason}`}
						</td>
					</tr>
					{#if gpu.adapter}
						<tr>
							<th>Adapter</th>
							<td>
								{[
									gpu.adapter.vendor,
									gpu.adapter.architecture,
									gpu.adapter.device,
									gpu.adapter.description
								]
									.filter(Boolean)
									.join(' · ') || 'keine Angaben'}
							</td>
						</tr>
					{/if}
					<tr>
						<th>CPU-Threads</th>
						<td>{gpu.hardwareConcurrency ?? 'unbekannt'}</td>
					</tr>
					<tr>
						<th>Arbeitsspeicher (Schätzung)</th>
						<td
							>{gpu.deviceMemoryGB
								? `${gpu.deviceMemoryGB} GB (Browser-Angabe)`
								: 'keine Angabe'}</td
						>
					</tr>
					<tr>
						<th>Cross-Origin isolated</th>
						<td>
							{gpu.crossOriginIsolated ? 'ja' : 'nein (keine Threads — auf GitHub Pages normal)'}
						</td>
					</tr>
					<tr>
						<th>User-Agent</th>
						<td class="small">{gpu.userAgent}</td>
					</tr>
				</tbody>
			</table>
		{:else}
			<p class="muted">Erkenne Gerät…</p>
		{/if}
	</div>

	<div class="panel">
		<h2>2. Modell laden</h2>
		<div class="row">
			<select bind:value={modelId} disabled={loading || generating}>
				{#each models as candidate (candidate.id)}
					<option value={candidate.id}>
						{candidate.label} — {candidate.vramMB ? `${Math.round(candidate.vramMB)} MB` : '?'} ({candidate.license})
					</option>
				{/each}
			</select>
			<button class="primary" onclick={doLoad} disabled={loading || generating || !modelId}>
				{loading ? 'Lädt…' : 'Modell laden'}
			</button>
			<span class="small muted">
				{#if model}{model.note}{/if}
			</span>
		</div>

		{#if loading}
			<p class="small muted">{loadText}</p>
			<div class="bar">
				<div class="fill" style="width: {Math.round(loadProgress * 100)}%"></div>
			</div>
		{/if}

		{#if loadMs !== null}
			<p class="small">
				Ladezeit: <strong>{(loadMs / 1000).toFixed(1)} s</strong> · Beim zweiten Laden greift der Browser-Cache:
				Seite neu laden und erneut laden, um den Warmstart zu messen.
			</p>
		{/if}
	</div>

	<div class="panel">
		<h2>3. Strukturierten Fall generieren</h2>
		<div class="row">
			<input type="text" bind:value={topic} disabled={generating} style="flex: 1 1 18rem" />
		</div>
		<div class="row" style="margin-top: 0.6rem">
			<label class="small">
				Antwortformat
				<select bind:value={mode} disabled={generating}>
					<option value="text">Freitext (Modell soll JSON schreiben)</option>
					<option value="json_object">JSON-Modus (erzwungen)</option>
					<option value="json_schema">JSON + Schema (erzwungen)</option>
				</select>
			</label>
			<label class="small">
				Versuche
				<select bind:value={maxAttempts} disabled={generating}>
					<option value={1}>1</option>
					<option value={2}>2</option>
					<option value={3}>3</option>
				</select>
			</label>
			<button class="primary" onclick={doGenerate} disabled={!engine || generating}>
				{generating ? 'Generiert…' : 'Test starten'}
			</button>
			{#if generating}
				<button onclick={interrupt}>Abbrechen</button>
			{/if}
		</div>
		{#if !engine}
			<p class="small muted">Erst ein Modell laden.</p>
		{/if}

		{#if error}
			<p class="errorbox">Fehler: {error}</p>
		{/if}

		{#if verdict}
			<p
				class="small"
				class:ok={verdict.includes('✔')}
				class:bad={!verdict.includes('✔') && !verdict.includes('läuft')}
			>
				{verdict}
			</p>
		{/if}

		{#if attempts.length > 0}
			<table>
				<thead>
					<tr>
						<th>Versuch</th>
						<th>TTFT</th>
						<th>Gesamt</th>
						<th>Tokens</th>
						<th>Zeichen/s</th>
						<th>Korrekturen</th>
						<th>Ergebnis</th>
					</tr>
				</thead>
				<tbody>
					{#each attempts as attempt (attempt.index)}
						<tr>
							<td>{attempt.index}</td>
							<td>{(attempt.metrics.firstTokenMs / 1000).toFixed(1)} s</td>
							<td>{(attempt.metrics.totalMs / 1000).toFixed(1)} s</td>
							<td
								>{attempt.metrics.promptTokens ?? '?'} / {attempt.metrics.completionTokens ??
									'?'}</td
							>
							<td>{attempt.metrics.charsPerSecond.toFixed(1)}</td>
							<td>{attempt.repairs.length}</td>
							<td
								class:ok={attempt.validation === 'schema-conform'}
								class:bad={attempt.validation !== 'schema-conform'}
							>
								{attempt.validation}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
			{#if lastAttempt && lastAttempt.repairs.length > 0}
				<details>
					<summary class="small muted">Id-Korrekturen des letzten Versuchs</summary>
					<ul class="small">
						{#each lastAttempt.repairs as repair, index (index)}
							<li><code>{repair}</code></li>
						{/each}
					</ul>
				</details>
			{/if}
			<p class="small muted">
				JS-Heap: {heapMegabytes() ?? '—'} MB (nur Chrome, kein GPU-Speicher)
				{#if lastAttempt && lastAttempt.metrics.completionTokens}
					· {((lastAttempt.metrics.completionTokens / lastAttempt.metrics.totalMs) * 1000).toFixed(
						1
					)} Tokens/s
				{/if}
			</p>
		{/if}

		{#if output}
			<h3 class="small muted">Rohausgabe der letzten Generierung</h3>
			<pre>{output}</pre>
		{/if}
	</div>

	{#if report}
		<div class="panel">
			<h2>4. Messbericht</h2>
			<p class="small muted">
				Diesen Block kopieren oder herunterladen und zurück an Hermes schicken — daraus wird die
				Spike-Doku im Repo.
			</p>
			<div class="row">
				<button onclick={copyReport}>{copied ? 'Kopiert ✓' : 'Bericht kopieren'}</button>
				<button onclick={downloadReport}>Als JSON herunterladen</button>
			</div>
			<pre>{report}</pre>
		</div>
	{/if}

	<p class="small muted">
		Modelllizenzen: SmolLM2 und Qwen sind Apache-2.0, Llama 3.2 unterliegt der Llama-3.2-Lizenz. Die
		Bibliothek <code>@mlc-ai/web-llm</code> ist Apache-2.0 — ihre Lizenz deckt keine Modellgewichte ab.
	</p>
</div>

<style>
	.ok {
		color: var(--ok);
	}

	.bad {
		color: var(--error);
	}

	.bar {
		height: 8px;
		background: var(--bg-raised);
		border-radius: 999px;
		overflow: hidden;
		margin: 0.4rem 0 0.6rem;
	}

	.fill {
		height: 100%;
		background: var(--accent);
		transition: width 0.2s ease;
	}

	.errorbox {
		color: var(--error);
		background: rgba(229, 101, 122, 0.1);
		border: 1px solid rgba(229, 101, 122, 0.4);
		border-radius: 8px;
		padding: 0.6rem 0.75rem;
	}

	input[type='text'] {
		min-width: 0;
	}

	label {
		display: inline-flex;
		gap: 0.4rem;
		align-items: center;
		color: var(--text-dim);
	}
</style>
