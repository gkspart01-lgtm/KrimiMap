/**
 * WebLLM feasibility probe: browser-local inference through WebGPU.
 *
 * Everything here is browser-only and loaded lazily — the model runtime is a
 * large dependency that must not end up in the editor's main bundle. No API
 * key, no server: model weights are fetched from the public MLC model CDN and
 * cached by the browser.
 *
 * See docs/spike-webllm.md for the measurement procedure and what counts as a
 * pass.
 */

import type { CaseDraft } from '../contracts/case-draft';
import { extractJsonObject, validateCaseDraft } from '../contracts/case-draft';

export interface GpuReport {
	supported: boolean;
	reason?: string;
	adapter?: {
		vendor?: string;
		architecture?: string;
		device?: string;
		description?: string;
	};
	crossOriginIsolated: boolean;
	hardwareConcurrency?: number;
	deviceMemoryGB?: number;
	userAgent: string;
	online: boolean;
}

interface AdapterInfo {
	vendor?: string;
	architecture?: string;
	device?: string;
	description?: string;
}

interface GpuAdapterLike {
	info?: AdapterInfo;
	limits?: { maxBufferSize?: number };
}

interface GpuLike {
	requestAdapter: (options?: {
		powerPreference?: 'low-power' | 'high-performance';
	}) => Promise<GpuAdapterLike | null>;
}

/** Detect WebGPU and the device facts the spike report needs. */
export async function detectGpu(): Promise<GpuReport> {
	const nav = navigator as Navigator & { gpu?: GpuLike; deviceMemory?: number };
	const report: GpuReport = {
		supported: false,
		crossOriginIsolated: typeof crossOriginIsolated !== 'undefined' ? crossOriginIsolated : false,
		hardwareConcurrency: navigator.hardwareConcurrency,
		deviceMemoryGB: nav.deviceMemory,
		userAgent: navigator.userAgent,
		online: navigator.onLine
	};

	if (!nav.gpu) {
		return { ...report, reason: 'navigator.gpu is not exposed by this browser' };
	}

	try {
		const adapter = await nav.gpu.requestAdapter({ powerPreference: 'high-performance' });
		if (!adapter) {
			return {
				...report,
				reason: 'requestAdapter() returned null (no compatible GPU or blocklisted driver)'
			};
		}
		const info: AdapterInfo = adapter.info ?? {};
		return { ...report, supported: true, adapter: info };
	} catch (cause) {
		return { ...report, reason: cause instanceof Error ? cause.message : String(cause) };
	}
}

export interface ModelOption {
	id: string;
	label: string;
	license: string;
	note: string;
	vramMB?: number;
}

/**
 * Small, permissively licensed candidates. Model IDs are checked against the
 * runtime's own model list before being offered, so a missing entry disables
 * the option instead of failing at load time.
 */
const CANDIDATES: Omit<ModelOption, 'vramMB'>[] = [
	{
		id: 'SmolLM2-360M-Instruct-q4f16_1-MLC',
		label: 'SmolLM2 360M (q4f16)',
		license: 'Apache-2.0',
		note: 'Smallest option — the realistic candidate for mid-range phones.'
	},
	{
		id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
		label: 'Llama 3.2 1B (q4f16)',
		license: 'Llama 3.2 Community License',
		note: 'Better German text, ~1 GB of GPU memory.'
	},
	{
		id: 'Qwen3.5-0.8B-q4f16_1-MLC',
		label: 'Qwen 3.5 0.8B (q4f16)',
		license: 'Apache-2.0',
		note: 'Strong instruction following for its size; reasoning model, slower warm start.'
	}
];

export async function availableModels(): Promise<ModelOption[]> {
	const { prebuiltAppConfig } = await import('@mlc-ai/web-llm');
	const known = new Map(
		prebuiltAppConfig.model_list.map((model) => [model.model_id, model.vram_required_MB])
	);
	return CANDIDATES.filter((candidate) => known.has(candidate.id)).map((candidate) => ({
		...candidate,
		vramMB: known.get(candidate.id)
	}));
}

export interface LoadProgress {
	text: string;
	progress: number;
}

export interface GenerationMetrics {
	text: string;
	firstTokenMs: number;
	totalMs: number;
	completionTokens?: number;
	promptTokens?: number;
	charsPerSecond: number;
}

/** Minimal shape of the engine we need; keeps this module honest about usage. */
export interface LoadedEngine {
	chat: {
		completions: {
			create: (request: Record<string, unknown>) => Promise<AsyncIterable<unknown>>;
		};
	};
	interruptGenerate: () => Promise<void> | void;
	unload: () => Promise<void> | void;
}

export async function loadModel(
	modelId: string,
	onProgress: (progress: LoadProgress) => void
): Promise<{ engine: LoadedEngine; loadMs: number }> {
	const { CreateMLCEngine } = await import('@mlc-ai/web-llm');
	const started = performance.now();
	const engine = (await CreateMLCEngine(modelId, {
		initProgressCallback: (report: { text: string; progress: number }) =>
			onProgress({ text: report.text, progress: report.progress })
	})) as unknown as LoadedEngine;
	return { engine, loadMs: performance.now() - started };
}

export interface Message {
	role: 'system' | 'user';
	content: string;
}

export type StructuredMode = 'text' | 'json_object' | 'json_schema';

/**
 * Stream one completion and time it. Timings are wall-clock from the browser,
 * which is what matters for the "is this usable on a phone" question.
 *
 * `mode` selects the response format handed to the runtime. `json_object` and
 * `json_schema` enable constrained decoding, which is the interesting
 * comparison for small models: without a constraint a 360M model tends to break
 * the JSON mid-object.
 */
export async function streamCompletion(
	engine: LoadedEngine,
	messages: Message[],
	options: {
		maxTokens: number;
		temperature: number;
		mode?: StructuredMode;
		schema?: string;
		onChunk?: (text: string) => void;
	}
): Promise<GenerationMetrics> {
	const started = performance.now();
	let firstTokenMs = -1;
	let text = '';
	let completionTokens: number | undefined;
	let promptTokens: number | undefined;

	const request: Record<string, unknown> = {
		messages,
		stream: true,
		stream_options: { include_usage: true },
		max_tokens: options.maxTokens,
		temperature: options.temperature
	};

	if (options.mode === 'json_object' || options.mode === 'json_schema') {
		request.response_format = {
			type: 'json_object',
			...(options.mode === 'json_schema' && options.schema ? { schema: options.schema } : {})
		};
	}

	const stream = await engine.chat.completions.create(request);

	for await (const chunk of stream) {
		const delta = (chunk as { choices?: { delta?: { content?: string } }[] }).choices?.[0]?.delta
			?.content;
		if (delta) {
			if (firstTokenMs < 0) firstTokenMs = performance.now() - started;
			text += delta;
			options.onChunk?.(text);
		}
		const usage = (chunk as { usage?: { completion_tokens?: number; prompt_tokens?: number } })
			.usage;
		if (usage) {
			completionTokens = usage.completion_tokens;
			promptTokens = usage.prompt_tokens;
		}
	}

	const totalMs = performance.now() - started;
	return {
		text,
		firstTokenMs: firstTokenMs < 0 ? totalMs : firstTokenMs,
		totalMs,
		completionTokens,
		promptTokens,
		charsPerSecond: totalMs > 0 ? (text.length / totalMs) * 1000 : 0
	};
}

/** JS heap sample; Chrome-only and not GPU memory, so treat it as a hint. */
export function heapMegabytes(): number | undefined {
	const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
	return memory ? Math.round(memory.usedJSHeapSize / (1024 * 1024)) : undefined;
}

/** The prompt the spike uses: a real KrimiMap-shaped structured draft. */
export function caseDraftPrompt(topic: string): Message[] {
	return [
		{
			role: 'system',
			content:
				'You are a case writer for a detective game. Answer with a single JSON object and nothing else. No Markdown, no commentary.'
		},
		{
			role: 'user',
			content: `Write a short, family-friendly German detective case about: ${topic}.

Return JSON with exactly this shape:
{
  "schemaVersion": 1,
  "title": string,
  "premise": string (2-3 sentences),
  "setting": string,
  "objective": string,
  "solution": string,
  "characters": [{"id": kebab-case id, "name": string, "role": string, "description": string}],
  "clues": [{"id": kebab-case id, "title": string, "description": string, "relatedCharacterIds": [existing character id]}]
}

Use 3 characters and 3 clues. All ids must be lowercase kebab-case.`
		}
	];
}

/** JSON Schema of the draft contract, used for constrained decoding. */
export function caseDraftJsonSchema(): string {
	return JSON.stringify({
		type: 'object',
		properties: {
			schemaVersion: { type: 'integer', enum: [1] },
			title: { type: 'string' },
			premise: { type: 'string' },
			setting: { type: 'string' },
			objective: { type: 'string' },
			solution: { type: 'string' },
			characters: {
				type: 'array',
				minItems: 1,
				items: {
					type: 'object',
					properties: {
						id: { type: 'string' },
						name: { type: 'string' },
						role: { type: 'string' },
						description: { type: 'string' }
					},
					required: ['id', 'name', 'role', 'description']
				}
			},
			clues: {
				type: 'array',
				minItems: 1,
				items: {
					type: 'object',
					properties: {
						id: { type: 'string' },
						title: { type: 'string' },
						description: { type: 'string' },
						relatedCharacterIds: { type: 'array', items: { type: 'string' } }
					},
					required: ['id', 'title', 'description', 'relatedCharacterIds']
				}
			}
		},
		required: [
			'schemaVersion',
			'title',
			'premise',
			'setting',
			'objective',
			'solution',
			'characters',
			'clues'
		]
	});
}

export interface AttemptResult {
	index: number;
	mode: StructuredMode;
	metrics: GenerationMetrics;
	jsonOk: boolean;
	validation: string;
	draft?: CaseDraft;
}

/**
 * Ask for a case draft up to `maxAttempts` times and stop at the first
 * schema-valid answer. Retrying at a lower temperature is what a real
 * generation flow would do, so the spike measures that, not a single-shot
 * best case.
 */
export async function runCaseDraftAttempts(
	engine: LoadedEngine,
	topic: string,
	options: {
		maxAttempts: number;
		mode: StructuredMode;
		temperature?: number;
		onChunk?: (text: string) => void;
	}
): Promise<{ attempts: AttemptResult[]; draft?: CaseDraft; ok: boolean }> {
	const attempts: AttemptResult[] = [];

	for (let index = 1; index <= Math.max(1, options.maxAttempts); index++) {
		const metrics = await streamCompletion(engine, caseDraftPrompt(topic), {
			maxTokens: 900,
			temperature: index === 1 ? (options.temperature ?? 0.7) : 0.2,
			mode: options.mode,
			schema: caseDraftJsonSchema(),
			onChunk: options.onChunk
		});

		const extracted = extractJsonObject(metrics.text);
		if (!extracted.ok) {
			attempts.push({
				index,
				mode: options.mode,
				metrics,
				jsonOk: false,
				validation: `JSON parse failed: ${extracted.reason}`
			});
			continue;
		}

		const checked = validateCaseDraft(extracted.value);
		if (checked.ok) {
			attempts.push({
				index,
				mode: options.mode,
				metrics,
				jsonOk: true,
				validation: 'schema-conform',
				draft: checked.draft
			});
			return { attempts, draft: checked.draft, ok: true };
		}

		attempts.push({
			index,
			mode: options.mode,
			metrics,
			jsonOk: true,
			validation: checked.issues.map((issue) => `${issue.path} ${issue.message}`).join('; ')
		});
	}

	return { attempts, ok: false };
}
