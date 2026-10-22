import { useCallback, useEffect, useState } from "react";
import { fetchClaims } from "../api/claims";
import type { ClaimSummary } from "../types";

export function useClaims() {
  const [claims, setClaims] = useState<ClaimSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    setIsLoading(true);
    try {
      setClaims(await fetchClaims());
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load claims.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchClaims(controller.signal)
      .then((data) => { setClaims(data); setError(""); })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load claims.");
      })
      .finally(() => { if (!controller.signal.aborted) setIsLoading(false); });
    return () => controller.abort();
  }, []);

  return { claims, isLoading, error, reload };
}
