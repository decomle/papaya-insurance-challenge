import type { ClaimDetails, ClaimSummary, TransitionRequest } from "../types";

type ApiErrorResponse = {
  error?: { code?: string; message?: string };
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as ApiErrorResponse;
    throw new Error(payload.error?.message ?? `Request failed with status ${response.status}.`);
  }
  return response.json() as Promise<T>;
}

export function fetchClaims(signal?: AbortSignal) {
  return request<ClaimSummary[]>("/api/claims", { signal });
}

export function fetchClaimDetails(claimId: string, signal?: AbortSignal) {
  return request<ClaimDetails>(`/api/claims/${encodeURIComponent(claimId)}`, { signal });
}

export function postClaimTransition(claimId: string, transition: TransitionRequest) {
  return request<ClaimDetails>(`/api/claims/${encodeURIComponent(claimId)}/transition`, {
    method: "POST",
    body: JSON.stringify(transition),
  });
}
