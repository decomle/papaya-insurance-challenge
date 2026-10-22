import { useMemo, useState } from "react";
import AppHeader from "./components/AppHeader";
import AuditCard from "./components/AuditCard";
import ClaimActionCard from "./components/ClaimActionCard";
import ClaimSummaryCard from "./components/ClaimSummaryCard";
import type { AuditEntry, ClaimRecord, Role } from "./types";
import { checkPrecondition, config, maxInformationRequestCycles, roleLabels, sampleClaims, stateLabel } from "./workflow";

function App() {
  const [claims, setClaims] = useState(sampleClaims);
  const [claimId, setClaimId] = useState(sampleClaims[0]!.id);
  const [userId, setUserId] = useState("alex.morgan");
  const [userRole, setUserRole] = useState<Role>("document_clerk");
  const [reason, setReason] = useState("");
  const [selectedTo, setSelectedTo] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const claim = claims.find((item) => item.id === claimId)!;
  const availableTransitions = useMemo(
    () => config.transitions.filter((transition) => transition.from === claim.state),
    [claim.state],
  );
  const activeTo = availableTransitions.some((transition) => transition.to === selectedTo)
    ? selectedTo
    : availableTransitions[0]?.to ?? "";
  const activeTransition = availableTransitions.find((transition) => transition.to === activeTo);

  function selectClaim(nextClaimId: string) {
    const nextClaim = claims.find((item) => item.id === nextClaimId);
    setClaimId(nextClaimId);
    setError("");
    setNotice("");
    setSelectedTo("");
    if (nextClaim) {
      const nextTransition = config.transitions.find((transition) => transition.from === nextClaim.state);
      if (nextTransition?.authorizedRoles[0]) setUserRole(nextTransition.authorizedRoles[0]);
    }
  }

  function selectTransition(to: string, nextRole?: Role) {
    setSelectedTo(to);
    setError("");
    setNotice("");
    if (nextRole) setUserRole(nextRole);
  }

  function executeTransition() {
    if (!activeTransition) return;
    if (!userId.trim()) {
      setError("Enter a triggering user ID before executing this transition.");
      return;
    }
    if (!activeTransition.authorizedRoles.includes(userRole)) {
      setError(`Role “${roleLabels[userRole]}” is not authorized to transition ${stateLabel(claim.state)} to ${stateLabel(activeTransition.to)}. Required role: ${activeTransition.authorizedRoles.map((role) => roleLabels[role]).join(", ")}.`);
      return;
    }
    if (activeTransition.to === "PENDING_INFO" && claim.informationRequestCycles >= maxInformationRequestCycles) {
      setError(`Maximum information requests exceeded — escalate to team lead (limit: ${maxInformationRequestCycles}).`);
      return;
    }

    const rejectionReason = activeTransition.to === "REJECTED" ? reason.trim() : "";
    const claimForChecks = rejectionReason
      ? { ...claim, facts: { ...claim.facts, rejectionReason } }
      : claim;
    const unmet = activeTransition.preconditions.filter((condition) => !checkPrecondition(condition.check, claimForChecks));
    if (unmet.length > 0) {
      setError(`Cannot transition ${stateLabel(claim.state)} to ${stateLabel(activeTransition.to)}. Unmet preconditions: ${unmet.map((condition) => condition.description).join(" ")}`);
      return;
    }

    const entry: AuditEntry = {
      timestamp: new Date().toISOString(),
      fromState: claim.state,
      toState: activeTransition.to,
      userId: userId.trim(),
      role: userRole,
      reason: reason.trim(),
    };
    setClaims((current) => current.map((item) => item.id !== claim.id ? item : {
      ...item,
      state: activeTransition.to,
      facts: activeTransition.to === "REJECTED"
        ? { ...item.facts, rejectionReason }
        : item.facts,
      informationRequestCycles: item.informationRequestCycles + (activeTransition.to === "PENDING_INFO" ? 1 : 0),
      audit: [...item.audit, entry],
    }));
    activeTransition.sideEffects.forEach((effect) => console.info(`[side-effect] [claim:${claim.id}] ${effect}`));
    const nextTransition = config.transitions.find((transition) => transition.from === activeTransition.to);
    if (nextTransition?.authorizedRoles[0]) setUserRole(nextTransition.authorizedRoles[0]);
    setNotice(`${stateLabel(claim.state)} → ${stateLabel(activeTransition.to)} completed successfully.`);
    setError("");
    setReason("");
    setSelectedTo("");
  }

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
            >
              {claims.map((item) => <option key={item.id} value={item.id}>{item.id}</option>)}
            </select>
          </label>
        </div>

        <ClaimSummaryCard claim={claim} maxInformationRequestCycles={maxInformationRequestCycles} />
        <ClaimActionCard
          claim={claim}
          availableTransitions={availableTransitions}
          activeTo={activeTo}
          userId={userId}
          userRole={userRole}
          reason={reason}
          error={error}
          notice={notice}
          onSelectTransition={selectTransition}
          onUserIdChange={setUserId}
          onUserRoleChange={setUserRole}
          onReasonChange={setReason}
          onExecute={executeTransition}
        />
        <AuditCard audit={claim.audit} />
        <p className="mt-4 text-center text-[11px] text-slate-400">Claims workflow demo · Changes are kept in this browser session only.</p>
      </main>
    </div>
  );
}

export default App;
