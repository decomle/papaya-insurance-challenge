import type { ClaimDetails } from "../types";
import { formatMoney, stateLabel } from "../workflow";

type Props = {
  claim: ClaimDetails;
  maxInformationRequestCycles: number;
};

export default function ClaimSummaryCard({ claim, maxInformationRequestCycles }: Props) {
  const statusTone = claim.state === "APPROVED" || claim.state === "CLOSED"
    ? "green"
    : claim.state === "REJECTED" || claim.state === "PENDING_INFO"
      ? "amber"
      : "blue";

  return (
    <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Current status</p>
          <div className="mt-2 flex items-center gap-3">
            <h2 className="text-xl font-semibold tracking-tight">{stateLabel(claim.state)}</h2>
            <span className={`status-badge status-${statusTone}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{claim.state.replaceAll("_", " ")}</span>
          </div>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          Information requests <span className="ml-2 font-semibold text-slate-800">{claim.informationRequestCycles} / {maxInformationRequestCycles}</span>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 sm:grid-cols-4">
        <Metadata label="Claim ID" value={claim.id} />
        <Metadata label="Member ID" value={claim.memberId} />
        <Metadata label="Claim amount" value={formatMoney(claim.amount)} />
        <Metadata label="Policy limit" value={formatMoney(claim.policyLimit)} />
      </div>
    </section>
  );
}

function Metadata({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-sm font-semibold text-slate-800">{value}</p></div>;
}
