import { useEffect, useState } from "react";
import AppHeader from "./components/AppHeader";
import AuditCard from "./components/AuditCard";
import ClaimActionCard from "./components/ClaimActionCard";
import ClaimSummaryCard from "./components/ClaimSummaryCard";
import { useClaimDetails } from "./hooks/useClaimDetails";
import { useClaims } from "./hooks/useClaims";
import { useTransitionClaim } from "./hooks/useTransitionClaim";
import type { Role } from "./types";
import { roleLabels, stateLabel } from "./workflow";

function App() {
  const { claims, isLoading: isLoadingClaims, error: claimsError, reload: reloadClaims } = useClaims();
  const [claimId, setClaimId] = useState("");
  const { claim, setClaim, isLoading: isLoadingClaim, error: claimError } = useClaimDetails(claimId);
  const { transitionClaim, isPending } = useTransitionClaim();
  const [userId, setUserId] = useState("alex.morgan");
  const [userRole, setUserRole] = useState<Role>("document_clerk");
  const [reason, setReason] = useState("");
  const [selectedTo, setSelectedTo] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!claimId && claims.length > 0) setClaimId(claims[0]!.id);
  }, [claimId, claims]);

  useEffect(() => {
    const defaultRole = claim?.validTransitions[0]?.authorizedRoles[0];
    if (defaultRole) setUserRole(defaultRole);
  }, [claim?.id, claim?.state]);

  const availableTransitions = claim?.validTransitions ?? [];
  const activeTo = availableTransitions.some((transition) => transition.to === selectedTo)
    ? selectedTo
    : availableTransitions[0]?.to ?? "";
  const activeTransition = availableTransitions.find((transition) => transition.to === activeTo);

  function selectClaim(nextClaimId: string) {
    setClaimId(nextClaimId);
    setError("");
    setNotice("");
    setSelectedTo("");
    setReason("");
  }

  function selectTransition(to: string, nextRole?: Role) {
    setSelectedTo(to);
    setError("");
    setNotice("");
    if (nextRole) setUserRole(nextRole);
  }

  async function executeTransition() {
    if (!claim || !activeTransition || isPending) return;
    if (!userId.trim()) {
      setError("Enter a triggering user ID before executing this transition.");
      return;
    }

    try {
      const updatedClaim = await transitionClaim(claim.id, {
        to: activeTransition.to,
        actor: { userId: userId.trim(), role: userRole },
        reason: reason.trim(),
      });
      setClaim(updatedClaim);
      await reloadClaims();
      setNotice(`${stateLabel(updatedClaim.auditTrail.at(-1)?.fromState ?? claim.state)} → ${stateLabel(updatedClaim.state)} completed successfully.`);
      setError("");
      setReason("");
      setSelectedTo("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to transition this claim.");
      setNotice("");
    }
  }

  const pageError = claimsError || claimError;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-5 pb-8 pt-7 sm:px-8">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">Claims / Operations</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Claim workflow</h1>
          </div>
          <label className="flex items-center gap-3 text-sm font-medium text-slate-600">
            Select claim
            <select
              className="min-w-52 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              value={claimId}
              onChange={(event) => selectClaim(event.target.value)}
              disabled={isLoadingClaims || claims.length === 0}
            >
              {claims.map((item) => <option key={item.id} value={item.id}>{item.id} · {stateLabel(item.state)}</option>)}
            </select>
          </label>
        </div>

        {pageError && <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{pageError}</div>}
        {(isLoadingClaims || isLoadingClaim) && <div className="mb-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">Loading claim data…</div>}

        {claim && <>
          <ClaimSummaryCard claim={claim} maxInformationRequestCycles={claim.maxInformationRequestCycles} />
          <ClaimActionCard
            claim={claim}
            availableTransitions={availableTransitions}
            activeTo={activeTo}
            userId={userId}
            userRole={userRole}
            reason={reason}
            error={error}
            notice={notice}
            isPending={isPending}
            onSelectTransition={selectTransition}
            onUserIdChange={setUserId}
            onUserRoleChange={setUserRole}
            onReasonChange={setReason}
            onExecute={executeTransition}
          />
          <AuditCard audit={claim.auditTrail} />
        </>}
        <p className="mt-4 text-center text-[11px] text-slate-400">Claims workflow demo · State and audit history are served by the backend.</p>
      </main>
    </div>
  );
}

export default App;
