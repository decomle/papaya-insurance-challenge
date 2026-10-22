export default function AppHeader() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600 text-sm font-bold text-white">C</div>
          <div>
            <p className="text-sm font-semibold tracking-tight">Claims desk</p>
            <p className="text-xs text-slate-500">Workflow operations</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> Demo workspace
        </div>
      </div>
    </header>
  );
}
