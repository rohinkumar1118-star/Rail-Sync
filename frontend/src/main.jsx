import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity, AlertTriangle, ArrowUpRight, Blocks, CalendarDays, CheckCircle2,
  ChevronRight, Clock3, Factory, Filter, Gauge, LayoutDashboard, Menu,
  RefreshCw, Search, ShieldCheck, TrainFront, Wrench, X
} from "lucide-react";
import { BarChart, Bar, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import "./index.css";

const API = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
//const API = "https://rail-sync-r99l.onrender.com";

async function api(path) {
  const r = await fetch(`${API}${path}`);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

const fallbackKpis = {
  scheduled_tasks: 0,
  optimized_blocks: 0,
  average_block_utilization_pct: 0,
  critical_tasks_scheduled: 0,
  overdue_tasks_scheduled: 0,
  multi_department_blocks: 0,
};

function MetricCard({ icon: Icon, label, value, sub, tone = "slate" }) {
  const tones = {
    blue: "bg-blue-50 text-blue-700",
    red: "bg-red-50 text-red-700",
    amber: "bg-amber-50 text-amber-700",
    green: "bg-emerald-50 text-emerald-700",
    slate: "bg-slate-100 text-slate-700",
  };
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{value}</p>
          {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
        </div>
        <div className={`rounded-xl p-3 ${tones[tone] || tones.slate}`}><Icon size={21}/></div>
      </div>
    </div>
  );
}

function App() {
  const [kpis, setKpis] = useState(fallbackKpis);
  const [blocks, setBlocks] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [health, setHealth] = useState("Checking...");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("All");
  const [section, setSection] = useState("All");
  const [sidebar, setSidebar] = useState(false);
  const [loading, setLoading] = useState(false);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [k, b, t, h] = await Promise.all([
        api("/api/kpis"), api("/api/blocks"), api("/api/tasks"), api("/api/health")
      ]);
      setKpis(k);
      setBlocks(Array.isArray(b) ? b : []);
      setTasks(Array.isArray(t) ? t : []);
      setHealth(h.status === "healthy" ? "Online" : "Offline");
    } catch (e) {
      setHealth("Offline");
      setError("Backend API is not reachable. Check the backend URL and make sure FastAPI is running.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  const departments = useMemo(() => ["All", ...new Set(tasks.map(x => x.department).filter(Boolean))], [tasks]);
  const sections = useMemo(() => ["All", ...new Set(blocks.map(x => x.section).filter(Boolean))], [blocks]);

  const filteredTasks = useMemo(() => {
    const q = search.toLowerCase();
    return tasks.filter(t => {
      const text = Object.values(t).join(" ").toLowerCase();
      return (!q || text.includes(q)) &&
        (department === "All" || String(t.department) === department);
    }).slice(0, 12);
  }, [tasks, search, department]);

  const filteredBlocks = useMemo(() => {
    return blocks.filter(b => section === "All" || String(b.section) === section).slice(0, 10);
  }, [blocks, section]);

  const chartData = useMemo(() => {
    const map = {};
    blocks.forEach(b => {
      const key = b.section || "Unknown";
      if (!map[key]) map[key] = { section: key, blocks: 0, utilization: 0 };
      map[key].blocks += 1;
      map[key].utilization += Number(b.utilization_pct || 0);
    });
    return Object.values(map).map(x => ({
      ...x, utilization: Math.round(x.utilization / x.blocks)
    })).slice(0, 10);
  }, [blocks]);

  const priorityBadge = (v) => {
    const s = String(v || "").toLowerCase();
    if (s.includes("critical")) return "bg-red-100 text-red-700";
    if (s.includes("high")) return "bg-orange-100 text-orange-700";
    if (s.includes("medium")) return "bg-amber-100 text-amber-700";
    return "bg-slate-100 text-slate-600";
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {sidebar && <div className="fixed inset-0 z-30 bg-slate-900/30 lg:hidden" onClick={() => setSidebar(false)}/>}
      <aside className={`fixed z-40 flex h-screen w-64 flex-col bg-slate-950 text-white transition-transform lg:translate-x-0 ${sidebar ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center gap-3 px-6 py-6 border-b border-white/10">
          <div className="rounded-xl bg-blue-600 p-2"><TrainFront size={22}/></div>
          <div><div className="font-bold tracking-wide">RAIL Sync</div><div className="text-[10px] text-slate-400">AUTOMATIC BLOCK PLANNING</div></div>
        </div>
        <nav className="p-4 space-y-1">
          <div className="flex items-center gap-3 rounded-xl bg-blue-600/15 px-4 py-3 text-blue-300"><LayoutDashboard size={18}/> Dashboard</div>
          <div className="flex items-center gap-3 rounded-xl px-4 py-3 text-slate-400"><Blocks size={18}/> Block Plans</div>
          <div className="flex items-center gap-3 rounded-xl px-4 py-3 text-slate-400"><Wrench size={18}/> Maintenance</div>
          <div className="flex items-center gap-3 rounded-xl px-4 py-3 text-slate-400"><CalendarDays size={18}/> Forecast</div>
        </nav>
        <div className="mt-auto m-4 rounded-2xl bg-white/5 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck size={17}/> Optimization Engine</div>
          <p className="mt-2 text-xs leading-5 text-slate-400">OR-Tools CP-SAT is used to coordinate maintenance blocks.</p>
          <div className="mt-3 flex items-center gap-2 text-xs text-emerald-400"><span className="h-2 w-2 rounded-full bg-emerald-400"/> Active</div>
        </div>
      </aside>

      <main className="lg:ml-64">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="flex items-center justify-between px-5 py-4 lg:px-8">
            <div className="flex items-center gap-3">
              <button className="lg:hidden rounded-lg p-2 hover:bg-slate-100" onClick={() => setSidebar(true)}><Menu/></button>
              <div>
                <h1 className="text-xl font-bold text-slate-900">Automatic Block Planning</h1>
                <p className="text-xs text-slate-500">Integrated maintenance & train operations control view</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`hidden sm:flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${health === "Online" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                <span className={`h-2 w-2 rounded-full ${health === "Online" ? "bg-emerald-500" : "bg-red-500"}`}/>{health}
              </span>
              <button onClick={loadData} className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 hover:bg-slate-50" title="Refresh">
                <RefreshCw size={18} className={loading ? "animate-spin" : ""}/>
              </button>
            </div>
          </div>
        </header>

        <div className="p-5 lg:p-8">
          {error && <div className="mb-5 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertTriangle size={18}/>{error}</div>}

          <div className="mb-7">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-sm font-medium text-blue-600">CONTROL CENTER</p>
                <h2 className="mt-1 text-2xl font-bold text-slate-900">Network maintenance overview</h2>
                <p className="mt-1 text-sm text-slate-500">Optimized from maintenance, corridor and train schedule data.</p>
              </div>
              <div className="hidden md:flex items-center gap-2 rounded-xl bg-white border border-slate-200 px-3 py-2 text-xs text-slate-500"><Activity size={15}/> Live API data</div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard icon={Wrench} label="Scheduled Tasks" value={kpis.scheduled_tasks} sub="Optimized maintenance assignments" tone="blue"/>
            <MetricCard icon={Blocks} label="Optimized Blocks" value={kpis.optimized_blocks} sub="Coordinated maintenance windows" tone="green"/>
            <MetricCard icon={Gauge} label="Avg. Utilization" value={`${kpis.average_block_utilization_pct}%`} sub="Available block capacity used" tone="amber"/>
            <MetricCard icon={AlertTriangle} label="Critical Scheduled" value={kpis.critical_tasks_scheduled} sub={`${kpis.overdue_tasks_scheduled} overdue tasks scheduled`} tone="red"/>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-5">
            <section className="card p-5 xl:col-span-3">
              <div className="flex items-center justify-between">
                <div><h3 className="font-bold text-slate-900">Section-wise utilization</h3><p className="text-xs text-slate-500 mt-1">Optimized block capacity</p></div>
                <div className="rounded-lg bg-blue-50 p-2 text-blue-600"><Gauge size={17}/></div>
              </div>
              <div className="mt-5 h-64">
                {chartData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{left:0,right:8,top:5,bottom:5}}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false}/>
                      <XAxis dataKey="section" tick={{fontSize:11}}/>
                      <YAxis tick={{fontSize:11}} unit="%"/>
                      <Tooltip/>
                      <Bar dataKey="utilization" name="Utilization %" radius={[6,6,0,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                ) : <div className="h-full flex items-center justify-center text-sm text-slate-400">No block data available</div>}
              </div>
            </section>

            <section className="card p-5 xl:col-span-2">
              <div className="flex items-center justify-between">
                <div><h3 className="font-bold text-slate-900">Optimization impact</h3><p className="text-xs text-slate-500 mt-1">Phase 3 planning indicators</p></div>
                <CheckCircle2 className="text-emerald-500" size={20}/>
              </div>
              <div className="mt-5 space-y-4">
                <div className="rounded-xl bg-slate-50 p-4"><div className="flex justify-between text-sm"><span className="text-slate-500">Multi-department blocks</span><b>{kpis.multi_department_blocks}</b></div><div className="mt-2 text-xs text-slate-400">Engineering + S&T + Traction coordination</div></div>
                <div className="rounded-xl bg-slate-50 p-4"><div className="flex justify-between text-sm"><span className="text-slate-500">Critical tasks scheduled</span><b>{kpis.critical_tasks_scheduled}</b></div><div className="mt-2 h-2 rounded-full bg-slate-200"><div className="h-2 rounded-full bg-red-500" style={{width: `${Math.min(100, Number(kpis.critical_tasks_scheduled)*10)}%`}}/></div></div>
                <div className="rounded-xl bg-emerald-50 p-4"><div className="flex items-center gap-2 text-sm font-semibold text-emerald-800"><ShieldCheck size={17}/> Safety-first scheduling</div><p className="mt-1 text-xs leading-5 text-emerald-700">Priority and train-conflict constraints are considered before creating optimized assignments.</p></div>
              </div>
            </section>
          </div>

          <section className="card mt-6 overflow-hidden">
            <div className="border-b border-slate-100 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div><h3 className="font-bold text-slate-900">Optimized block plan</h3><p className="text-xs text-slate-500 mt-1">Recommended maintenance windows</p></div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative"><Search className="absolute left-3 top-2.5 text-slate-400" size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search tasks..." className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-400 sm:w-56"/></div>
                  <select value={section} onChange={e=>setSection(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"><option>All</option>{sections.slice(1).map(x=><option key={x}>{x}</option>)}</select>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Block</th><th>Date</th><th>Section</th><th>Time</th><th>Tasks</th><th>Departments</th><th>Utilization</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredBlocks.map((b,i)=><tr key={b.block_id || i} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-semibold text-blue-700">{b.block_id || "—"}</td><td>{b.date || "—"}</td><td>{b.section || "—"}</td><td>{b.block_start || "—"} – {b.block_end || "—"}</td><td>{b.task_count ?? "—"}</td><td className="max-w-48 truncate">{b.departments || "—"}</td><td><span className="font-semibold">{b.utilization_pct ?? 0}%</span></td>
                  </tr>)}
                  {!filteredBlocks.length && <tr><td colSpan="7" className="py-12 text-center text-sm text-slate-400">No optimized blocks found.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card mt-6 overflow-hidden">
            <div className="border-b border-slate-100 p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div><h3 className="font-bold text-slate-900">Maintenance task queue</h3><p className="text-xs text-slate-500 mt-1">Highest-value optimized assignments</p></div>
              <select value={department} onChange={e=>setDepartment(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"><option>All</option>{departments.slice(1).map(x=><option key={x}>{x}</option>)}</select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Task</th><th>Asset</th><th>Department</th><th>Severity</th><th>Status</th><th>Duration</th><th>Window</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTasks.map((t,i)=><tr key={t.task_id || i} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-semibold text-slate-800">{t.task_id || "—"}</td><td>{t.asset_id || "—"}</td><td>{t.department || "—"}</td><td><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${priorityBadge(t.severity)}`}>{t.severity || "—"}</span></td><td>{t.status || "—"}</td><td>{t.duration_min ? `${(Number(t.duration_min)/60).toFixed(1)}h` : (t.estimated_duration_hours ? `${t.estimated_duration_hours}h` : "—")}</td><td>{t.block_start_time && t.block_end_time ? `${t.block_start_time} – ${t.block_end_time}` : "Scheduled"}</td>
                  </tr>)}
                  {!filteredTasks.length && <tr><td colSpan="7" className="py-12 text-center text-sm text-slate-400">No task data found.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <footer className="py-8 text-center text-xs text-slate-400">
            RAIL Sync Prototype • AI-assisted maintenance prioritization + OR-Tools block optimization • Demo data
          </footer>
        </div>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
