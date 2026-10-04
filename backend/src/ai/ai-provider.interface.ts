import type { ParsedContext, RecommendationDraft } from './schemas';

/** Provider abstraction — swap Groq for another LLM without touching business logic. */
export interface AiProvider {
  readonly name: string;
  understand(text: string): Promise<ParsedContext>;
  prioritize(input: {
    situationText: string;
    context: ParsedContext;
    newInfo?: string;
  }): Promise<RecommendationDraft>;
}

export const AI_PROVIDER = Symbol('AI_PROVIDER');
