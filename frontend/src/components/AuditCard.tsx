import type { AuditEntry } from "../types";
import { roleLabels, stateLabel } from "../workflow";

export default function AuditCard({ audit }: { audit: AuditEntry[] }) {
  return (
    <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
        <div>
          <h2 className="text-base font-semibold">Audit trail</h2>
          <p className="mt-0.5 text-xs text-slate-500">A read-only history of transitions for this claim.</p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{audit.length} entries</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left text-xs">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3 font-semibold sm:px-6">Timestamp</th>
              <th className="px-4 py-3 font-semibold">From state</th>
              <th className="px-4 py-3 font-semibold">To state</th>
              <th className="px-4 py-3 font-semibold">Triggered by</th>
              <th className="px-4 py-3 font-semibold">Reason / Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {audit.length === 0 ? (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-sm text-slate-400 sm:px-6">No transitions recorded for this claim yet.</td></tr>
            ) : [...audit].reverse().map((entry, index) => (
              <tr key={`${entry.timestamp}-${index}`} className="text-slate-600 hover:bg-slate-50/70">
                <td className="whitespace-nowrap px-5 py-3.5 text-slate-500 sm:px-6">{new Date(entry.timestamp).toLocaleString()}</td>
                <td className="px-4 py-3.5">{stateLabel(entry.fromState)}</td>
                <td className="px-4 py-3.5 font-medium text-slate-800">{stateLabel(entry.toState)}</td>
                <td className="px-4 py-3.5"><span className="font-medium text-slate-800">{entry.userId}</span><span className="ml-1.5 text-slate-400">· {roleLabels[entry.role]}</span></td>
                <td className="max-w-64 px-4 py-3.5 text-slate-500">{entry.reason || <span className="text-slate-300">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
