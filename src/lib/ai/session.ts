/**
 * State machine for an AI case-draft session.
 *
 * Kept framework-free so the rules are unit-tested: the editor component only
 * renders this state and forwards button presses. Generation never touches the
 * case document — a draft is a proposal until the creator applies it.
 */

import type { CaseDraft } from '#lib/ai/contracts/case-draft';

export type AiStatus =
	'checking' | 'unavailable' | 'idle' | 'preparing' | 'generating' | 'draft' | 'failed';

export interface AiSessionState {
	status: AiStatus;
	/** Human-readable progress or state line, already localised by the caller. */
	message: string;
	draft: CaseDraft | null;
	/** Repairs the parser applied to the model output, shown with the draft. */
	repairs: string[];
	error: string | null;
}

export type AiSessionEvent =
	| { type: 'checking' }
	| { type: 'unavailable'; reason: string }
	| { type: 'ready' }
	| { type: 'preparing'; message: string }
	| { type: 'generating'; message: string }
	| { type: 'draft'; draft: CaseDraft; repairs: string[] }
	| { type: 'failed'; message: string }
	| { type: 'reset' };

export const INITIAL_AI_SESSION: AiSessionState = {
	status: 'checking',
	message: '',
	draft: null,
	repairs: [],
	error: null
};

export function reduceAiSession(state: AiSessionState, event: AiSessionEvent): AiSessionState {
	switch (event.type) {
		case 'checking':
			return { ...INITIAL_AI_SESSION, status: 'checking' };
		case 'unavailable':
			return { ...INITIAL_AI_SESSION, status: 'unavailable', error: event.reason };
		case 'ready':
			return { ...INITIAL_AI_SESSION, status: 'idle' };
		case 'preparing':
			return { ...state, status: 'preparing', message: event.message, error: null };
		case 'generating':
			return { ...state, status: 'generating', message: event.message, error: null };
		case 'draft':
			return {
				...state,
				status: 'draft',
				message: '',
				draft: event.draft,
				repairs: event.repairs,
				error: null
			};
		case 'failed':
			return {
				...state,
				status: 'failed',
				message: '',
				draft: null,
				repairs: [],
				error: event.message
			};
		case 'reset':
			return { ...INITIAL_AI_SESSION, status: 'idle' };
	}
}

/** True while work is in flight, so the caller can show a cancel control. */
export function aiSessionBusy(state: AiSessionState): boolean {
	return state.status === 'preparing' || state.status === 'generating';
}

/** Generation is only offered when a provider is ready and no draft is pending. */
export function canRequestDraft(state: AiSessionState, topic: string): boolean {
	if (state.status !== 'idle' && state.status !== 'failed') return false;
	return topic.trim().length >= 3;
}
