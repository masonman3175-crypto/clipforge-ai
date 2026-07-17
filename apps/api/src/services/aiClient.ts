import OpenAI from 'openai';
import { env } from '../config/env.js';

/**
 * Unified AI client. Groq (https://groq.com) is free and requires no credit
 * card, and exposes an OpenAI-compatible API — so we use the OpenAI SDK pointed
 * at Groq's base URL when GROQ_API_KEY is set, and fall back to OpenAI otherwise.
 *
 * Both providers support:
 *   - audio.transcriptions.create (Whisper) with word-level timestamps
 *   - chat.completions.create with JSON response_format
 */
export const useGroq = !!env.GROQ_API_KEY;

export const aiClient = new OpenAI({
  apiKey: (useGroq ? env.GROQ_API_KEY : env.OPENAI_API_KEY) || 'missing',
  baseURL: useGroq ? 'https://api.groq.com/openai/v1' : undefined,
});

export const AI_MODELS = {
  transcribe: useGroq ? env.GROQ_TRANSCRIBE_MODEL : env.OPENAI_TRANSCRIBE_MODEL,
  analysis: useGroq ? env.GROQ_ANALYSIS_MODEL : env.OPENAI_ANALYSIS_MODEL,
  // Lighter model for high-volume asset generation (Groq only; OpenAI reuses one).
  assets: useGroq ? env.GROQ_ASSETS_MODEL : env.OPENAI_ANALYSIS_MODEL,
};

/** True when an AI provider is actually configured (not just a placeholder). */
export const aiConfigured =
  useGroq || (!!env.OPENAI_API_KEY && env.OPENAI_API_KEY.startsWith('sk-'));

export const aiProviderName = useGroq ? 'groq' : 'openai';
