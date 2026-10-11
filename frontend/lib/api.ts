export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: init?.method ?? "GET",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: { code?: string; message?: string };
  } & T;
  if (!res.ok) {
    throw new ApiError(data.error?.code ?? "REQUEST_FAILED", data.error?.message ?? "Request failed", res.status);
  }
  return data as T;
}

export interface RecommendationV2Unknown {
  field: string;
  whyItMatters: string;
  blocking: boolean;
}

export type RecommendationV2Status = "RECOMMEND" | "REASSESS" | "NEEDS_INPUT" | "INFEASIBLE";

export interface RecommendationV2Payload {
  nextMove: string;
  why: string;
  plan: string[];
  whatCanWait: string[];
  risk: string;
  reassessmentTrigger: string;
  assumptions: string[];
  unknowns: RecommendationV2Unknown[];
  options: string[];
  status: RecommendationV2Status;
}

export interface RecommendationV2Row {
  id: string;
  version: number;
  status: RecommendationV2Status;
  contextVersion: number;
  provider: string;
  promptVersion: string;
  previousId: string | null;
  createdAt: string;
  payload?: RecommendationV2Payload;
}

export interface RecommendationV2VersionMeta {
  id: string;
  version: number;
  status: RecommendationV2Status;
  contextVersion: number;
  provider: string;
  promptVersion: string;
  previousId: string | null;
  createdAt: string;
}

export interface RecommendationV2Response {
  id: string;
  version: number;
  status: RecommendationV2Status;
  provider: string;
  recommendation: RecommendationV2Payload;
}

export interface Situation {
  id: string;
  text: string;
  /** Owner-set sidebar name; null when never renamed. */
  title?: string | null;
  confirmed: boolean;
  context: {
    responsibilities: Array<{
      id: string;
      title: string;
      category: string;
      timeRef: string;
      fixedTime: boolean;
      delegatable: boolean;
    }>;
    conflicts: Array<{ id: string; description: string }>;
    uncertainties: string[];
  } | null;
  recommendations: Array<{
    id: string;
    version: number;
    recommendedPriority: string;
    why: string;
    nextAction: string;
    others: Array<{ title: string; suggestedHandling: string }>;
    reassessIf: string[];
    uncertaintyNotes: string;
  }>;
  reassessments: Array<{ id: string; updateText: string }>;
  feedback: { helpful: boolean; note: string } | null;
}
