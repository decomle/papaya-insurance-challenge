import { useCallback, useEffect, useState } from "react";
import { fetchClaimDetails } from "../api/claims";
import type { ClaimDetails } from "../types";

export function useClaimDetails(claimId: string) {
  const [claim, setClaim] = useState<ClaimDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    if (!claimId) return;
    setIsLoading(true);
    try {
      setClaim(await fetchClaimDetails(claimId));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load claim details.");
    } finally {
      setIsLoading(false);
    }
  }, [claimId]);

  useEffect(() => {
    if (!claimId) {
      setClaim(null);
      return;
    }
    const controller = new AbortController();
    setClaim(null);
    setIsLoading(true);
    fetchClaimDetails(claimId, controller.signal)
      .then((data) => { setClaim(data); setError(""); })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load claim details.");
      })
      .finally(() => { if (!controller.signal.aborted) setIsLoading(false); });
    return () => controller.abort();
  }, [claimId]);

  return { claim, setClaim, isLoading, error, reload };
}
