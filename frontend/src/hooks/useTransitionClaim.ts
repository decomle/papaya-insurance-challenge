import { useState } from "react";
import { postClaimTransition } from "../api/claims";
import type { ClaimDetails, TransitionRequest } from "../types";

export function useTransitionClaim() {
  const [isPending, setIsPending] = useState(false);

  async function transitionClaim(claimId: string, transition: TransitionRequest): Promise<ClaimDetails> {
    setIsPending(true);
    try {
      return await postClaimTransition(claimId, transition);
    } finally {
      setIsPending(false);
    }
  }

  return { transitionClaim, isPending };
}
