import type { ClaimRecord, Role, WorkflowTransition } from "../types";
import { checkPrecondition, roleLabels, stateLabel, roles } from "../workflow";

type Props = {
  claim: ClaimRecord;
  availableTransitions: WorkflowTransition[];
  activeTo: string;
  userId: string;
  userRole: Role;
  reason: string;
  error: string;
  notice: string;
  onSelectTransition: (to: string, role?: Role) => void;
  onUserIdChange: (userId: string) => void;
  onUserRoleChange: (role: Role) => void;
  onReasonChange: (reason: string) => void;
  onExecute: () => void;
};

export default function ClaimActionCard({
  claim,
  availableTransitions,
  activeTo,
  userId,
  userRole,
  reason,
  error,
  notice,
  onSelectTransition,
  onUserIdChange,
  onUserRoleChange,
  onReasonChange,
  onExecute,
}: Props) {
  const activeTransition = availableTransitions.find((transition) => transition.to === activeTo);

  return (
    <>
      {error && <div role="alert" className="mb-4 flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"><span className="font-bold">!</span><p>{error}</p></div>}
      {notice && <div role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-base font-semibold">Actions &amp; transitions</h2>
            <p className="mt-0.5 text-xs text-slate-500">Choose an available next step and provide the actor details.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{availableTransitions.length} available</span>
        </div>

        <div className="grid gap-0 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-2 border-b border-slate-100 p-4 sm:p-5 lg:border-b-0 lg:border-r">
            {availableTransitions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">This claim is in a terminal state. No transitions are available.</div>
            ) : availableTransitions.map((transition) => {
              const selected = activeTo === transition.to;
              const unmetCount = transition.preconditions.filter((condition) => !checkPrecondition(condition.check, claim)).length;
              return (
                <button
                  key={`${transition.from}-${transition.to}`}
                  type="button"
                  onClick={() => onSelectTransition(transition.to, transition.authorizedRoles[0])}
                  className={`w-full rounded-xl border p-3.5 text-left transition ${selected ? "border-blue-300 bg-blue-50/70 ring-1 ring-blue-100" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span className={`grid h-4 w-4 place-items-center rounded-full border ${selected ? "border-blue-600" : "border-slate-300"}`}>
                        {selected && <span className="h-2 w-2 rounded-full bg-blue-600" />}
                      </span>
                      <span className="text-sm font-semibold text-slate-900">{stateLabel(transition.to)}</span>
                    </div>
                    <span className={`text-[11px] font-medium ${unmetCount === 0 ? "text-emerald-700" : "text-amber-700"}`}>
                      {unmetCount === 0 ? "Ready" : `${unmetCount} rule${unmetCount === 1 ? "" : "s"} to meet`}
                    </span>
                  </div>
                  <div className="ml-[26px] mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span>Required role: <span className="font-medium text-slate-700">{transition.authorizedRoles.map((role) => roleLabels[role]).join(", ")}</span></span>
                  </div>
                  {transition.preconditions.length > 0 && (
                    <ul className="ml-[26px] mt-2 space-y-1">
                      {transition.preconditions.map((condition) => {
                        const satisfied = checkPrecondition(condition.check, claim);
                        return <li key={condition.check} className={`flex items-start gap-1.5 text-[11px] ${satisfied ? "text-emerald-700" : "text-slate-500"}`}>
                          <span className="mt-px font-bold">{satisfied ? "✓" : "○"}</span><span>{condition.description}</span>
                        </li>;
                      })}
                    </ul>
                  )}
                </button>
              );
            })}
          </div>

          <form className="p-4 sm:p-5" onSubmit={(event) => { event.preventDefault(); onExecute(); }}>
            <p className="mb-4 text-sm font-semibold">Transition details</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <label className="block text-xs font-medium text-slate-600">
                Triggering user ID
                <input className="field mt-1.5" value={userId} onChange={(event) => onUserIdChange(event.target.value)} placeholder="e.g. alex.morgan" />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                User role
                <select className="field mt-1.5" value={userRole} onChange={(event) => onUserRoleChange(event.target.value as Role)}>
                  {roles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
                </select>
              </label>
            </div>
            <label className="mt-3 block text-xs font-medium text-slate-600">
              {activeTransition?.to === "REJECTED" ? "Rejection reason / Notes" : "Reason / Notes"}
              <span className="ml-1 font-normal text-slate-400">{activeTransition?.to === "REJECTED" ? "(required)" : "(optional)"}</span>
              <textarea className="field mt-1.5 min-h-20 resize-y" value={reason} onChange={(event) => onReasonChange(event.target.value)} placeholder={activeTransition?.to === "REJECTED" ? "Explain why the claim is rejected" : "Add context for the audit trail"} />
            </label>
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-xs text-slate-500">Next state: <span className="font-semibold text-slate-700">{activeTransition ? stateLabel(activeTransition.to) : "—"}</span></p>
              <button className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300" type="submit" disabled={!activeTransition}>
                Execute transition <span aria-hidden="true">→</span>
              </button>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-400">Side effects are simulated and written to the browser console.</p>
          </form>
        </div>
      </section>
    </>
  );
}
