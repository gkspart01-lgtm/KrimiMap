/**
 * Local, in-browser draft provider (WebGPU + WebLLM).
 *
 * The only provider implemented today: no key, no upload, model downloads only
 * after an explicit creator action. Everything it returns is a *draft*; the
 * editor applies it only when the creator asks for it.
 */

import type { CaseDraft } from '#lib/ai/contracts/case-draft';
import type { LoadedEngine } from './webllm-spike';

export interface AiSupport {
	ok: boolean;
	/** Stable reason code so the UI can translate it instead of showing runtime text. */
	code?: 'no-webgpu' | 'no-model';
	/** Untranslated runtime detail, shown only for diagnostics. */
	detail?: string;
}

export interface AiProgress {
	text: string;
	progress: number;
}

export interface AiDraftResult {
	draft: CaseDraft;
	/** Id normalisations applied before validation, shown with the draft. */
	repairs: string[];
}

export interface DraftProvider {
	support(): Promise<AiSupport>;
	prepare(onProgress: (progress: AiProgress) => void): Promise<void>;
	generate(topic: string, onProgress: (progress: AiProgress) => void): Promise<AiDraftResult>;
	cancel(): void;
}

/** Wrap the WebLLM runtime behind the provider contract the editor uses. */
export async function createLocalDraftProvider(): Promise<DraftProvider> {
	const spike = await import('./webllm-spike');
	let engine: LoadedEngine | null = null;
	let modelId: string | null = null;

	const support = async (): Promise<AiSupport> => {
		const gpu = await spike.detectGpu();
		if (!gpu.supported) {
			return { ok: false, code: 'no-webgpu', detail: gpu.reason };
		}
		const models = await spike.availableModels();
		if (models.length === 0) return { ok: false, code: 'no-model' };
		modelId = models[0].id;
		return { ok: true };
	};

	return {
		support,
		async prepare(onProgress) {
			if (engine) return;
			if (!modelId) throw new Error('Lokales Modell ist nicht ausgewählt.');
			const loaded = await spike.loadModel(modelId, (progress) =>
				onProgress({ text: progress.text, progress: progress.progress })
			);
			engine = loaded.engine;
		},
		async generate(topic, onProgress) {
			if (!engine) throw new Error('Das lokale Modell ist noch nicht geladen.');
			const result = await spike.runCaseDraftAttempts(engine, topic, {
				maxAttempts: 2,
				mode: 'json_schema',
				onChunk: (text) =>
					onProgress({ text: `Entwurf wird geschrieben (${text.length} Zeichen)…`, progress: 0 })
			});
			if (!result.ok || !result.draft) {
				const last = result.attempts[result.attempts.length - 1];
				throw new Error(
					last?.validation
						? `Das Modell lieferte keinen gültigen Entwurf: ${last.validation}`
						: 'Das Modell lieferte keinen gültigen Entwurf.'
				);
			}
			const repairs = result.attempts[result.attempts.length - 1]?.repairs ?? [];
			return { draft: result.draft, repairs };
		},
		cancel() {
			void engine?.interruptGenerate();
		}
	};
}
