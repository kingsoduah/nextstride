export class AiUnavailableError extends Error {
  constructor(message = 'AI provider unavailable') {
    super(message);
    this.name = 'AiUnavailableError';
  }
}

export class AiInvalidOutputError extends Error {
  details: string;
  constructor(details: string) {
    super('AI returned invalid structured output');
    this.name = 'AiInvalidOutputError';
    this.details = details;
  }
}
