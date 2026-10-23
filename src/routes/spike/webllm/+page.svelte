<script lang="ts">
	import { onMount } from 'svelte';
	import {
		availableModels,
		caseDraftPrompt,
		detectGpu,
		heapMegabytes,
		loadModel,
		streamCompletion,
		type GpuReport,
		type LoadedEngine,
		type ModelOption
	} from '#lib/ai/local/webllm-spike';
	import { extractJsonObject, validateCaseDraft } from '#lib/ai/contracts/case-draft';
	import type { GenerationMetrics } from '#lib/ai/local/webllm-spike';

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
	let output = $state('');
	let metrics = $state<GenerationMetrics | null>(null);
	let validation = $state<string>('');
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

	async function doLoad() {
		error = null;
		loading = true;
		output = '';
		metrics = null;
		validation = '';
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
		metrics = null;
		validation = 'checking schema…';
		const heapBefore = heapMegabytes();
		try {
			const result = await streamCompletion(engine, caseDraftPrompt(topic), {
				maxTokens: 900,
				temperature: 0.7,
				onChunk: (text) => (output = text)
			});
			metrics = result;

			const extracted = extractJsonObject(result.text);
			if (!extracted.ok) {
				validation = `JSON parse failed: ${extracted.reason}`;
			} else {
				const checked = validateCaseDraft(extracted.value);
				validation = checked.ok
					? 'JSON valid and schema-conform ✔'
					: `JSON parsed, schema issues: ${checked.issues
							.map((issue) => `${issue.path} ${issue.message}`)
							.join('; ')}`;
			}

			report = JSON.stringify(
				{
					measuredAt: new Date().toISOString(),
					device: gpu,
					model: modelId,
					modelLicence: model?.license,
					vramRequiredMB: model?.vramMB,
					modelLoadMs: loadMs,
					firstTokenMs: result.firstTokenMs,
					totalMs: result.totalMs,
					promptTokens: result.promptTokens,
					completionTokens: result.completionTokens,
					charsPerSecond: Number(result.charsPerSecond.toFixed(1)),
					heapBeforeMB: heapBefore,
					heapAfterMB: heapMegabytes(),
					crossOriginIsolated: gpu?.crossOriginIsolated,
					jsonValid: !validation.includes('failed') && !validation.includes('issues'),
					validation
				},
				null,
				2
			);
			localStorage.setItem(STORAGE_KEY, report);
		} catch (cause) {
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

		{#if metrics}
			<table>
				<tbody>
					<tr><th>Time to first token</th><td>{metrics.firstTokenMs.toFixed(0)} ms</td></tr>
					<tr>
						<th>Gesamtzeit</th>
						<td>{(metrics.totalMs / 1000).toFixed(1)} s</td>
					</tr>
					<tr>
						<th>Tokens (prompt / completion)</th>
						<td>{metrics.promptTokens ?? '?'} / {metrics.completionTokens ?? '?'}</td>
					</tr>
					<tr>
						<th>Ausgabegeschwindigkeit</th>
						<td>{metrics.charsPerSecond.toFixed(1)} Zeichen/s</td>
					</tr>
					<tr>
						<th>Schema-Prüfung</th>
						<td
							class:ok={validation.includes('gültig') || validation.includes('valid')}
							class:bad={validation.includes('failed') || validation.includes('issues')}
						>
							{validation}
						</td>
					</tr>
					<tr>
						<th>JS-Heap</th>
						<td>{heapMegabytes() ?? '—'} MB (nur Chrome, kein GPU-Speicher)</td>
					</tr>
				</tbody>
			</table>
		{/if}

		{#if output}
			<h3 class="small muted">Rohausgabe des Modells</h3>
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
</style>
