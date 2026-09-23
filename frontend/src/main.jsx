import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity, AlertTriangle, Blocks, CalendarDays, CheckCircle2, Clock3,
  Gauge, LayoutDashboard, Map as MapIcon, Menu, RefreshCw, Search,
  ShieldCheck, TrainFront, Upload, UserRound, Wrench, X, Play, Siren,
  ClipboardCheck, History, FlaskConical, LogOut, ChevronRight, Satellite, TimerReset, Sun, Moon,
  BarChart3, BrainCircuit, ShieldAlert, Database, UserCog, CheckCheck,
  PauseCircle, XCircle, Lightbulb, TrendingUp, Users, FileClock, CircleAlert
} from "lucide-react";
import { BarChart, Bar, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import "./index.css";

const API = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

const routeLabel = (s) => s?.display_name || (s?.start_station && s?.end_station ? `${s.start_station} → ${s.end_station}` : s?.section || "Unknown route");
const routeCorridor = (s) => s?.corridor_name || s?.route || "Railway corridor";

async function api(path, options = {}) {
  const r = await fetch(`${API}${path}`, options);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.detail || `${r.status} ${r.statusText}`);
  return data;
}

function MetricCard({ icon: Icon, label, value, sub, tone = "slate" }) {
  const tones = {
    blue: "bg-blue-50 text-blue-700", red: "bg-red-50 text-red-700",
    amber: "bg-amber-50 text-amber-700", green: "bg-emerald-50 text-emerald-700",
    slate: "bg-slate-100 text-slate-700"
  };
  return <div className="card p-5"><div className="flex items-start justify-between">
    <div><p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{sub}</p></div>
    <div className={`rounded-xl p-3 ${tones[tone]}`}><Icon size={21}/></div>
  </div></div>;
}

function Login({ onLogin }) {
  const [role, setRole] = useState("Controller");
  const [username, setUsername] = useState("controller");
  const [password, setPassword] = useState("controller123");
  const submit = e => { e.preventDefault(); onLogin({ role, username }); };
  return <div className="min-h-screen login-bg flex items-center justify-center p-5">
    <div className="w-full max-w-md">
      <div className="text-center mb-6"><div className="inline-flex rounded-2xl bg-blue-600 p-4 text-white shadow-lg"><TrainFront size={34}/></div>
        <h1 className="mt-4 text-3xl font-bold text-slate-900">ABMS</h1>
        <p className="text-sm text-slate-500">Automatic Block Management System</p></div>
      <form onSubmit={submit} className="card p-7">
        <div className="flex items-center gap-2 font-bold text-slate-900"><ShieldCheck size={19}/> Secure role-based prototype access</div>
        <label className="label">Username<input className="input" value={username} onChange={e=>setUsername(e.target.value)} /></label>
        <label className="label">Password<input className="input" type="password" value={password} onChange={e=>setPassword(e.target.value)} /></label>
        <label className="label">Role<select className="input" value={role} onChange={e=>setRole(e.target.value)}>
          <option>Controller</option><option>Maintenance Officer</option><option>Admin</option>
        </select></label>
        <button className="primary w-full mt-2"><LogOut className="rotate-180" size={17}/> Sign in</button>
        <p className="mt-4 text-xs text-slate-400">Prototype login. Production deployment would use authenticated railway identity and authorization.</p>
      </form>
    </div>
  </div>;
}

function StatusPill({ status }) {
  const meta = {
    pending: ['Pending','bg-red-50 text-red-700 border-red-100','bg-red-500'],
    ongoing: ['Ongoing','bg-amber-50 text-amber-700 border-amber-100','bg-amber-400'],
    completed: ['Completed','bg-emerald-50 text-emerald-700 border-emerald-100','bg-emerald-500'],
    approved: ['Approved','bg-blue-50 text-blue-700 border-blue-100','bg-blue-500'],
    available: ['Available','bg-slate-50 text-slate-600 border-slate-100','bg-slate-400']
  }[status] || ['Available','bg-slate-50 text-slate-600 border-slate-100','bg-slate-400'];
  return <span className={`status-pill ${meta[1]}`}><span className={`h-1.5 w-1.5 rounded-full ${meta[2]}`}/>{meta[0]}</span>;
}

function RailwayMap({ map, height='h-[540px]', onRouteSelect }) {
  const ref=useRef(null), mapRef=useRef(null);
  const [ready,setReady]=useState(false), [err,setErr]=useState('');
  useEffect(()=>{
    if(!ref.current || !window.L || mapRef.current) return;
    try{
      const L=window.L;
      const m=L.map(ref.current,{zoomControl:true,scrollWheelZoom:true});
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'}).addTo(m);
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,opacity:.9,attribution:'Boundaries & Places © Esri'}).addTo(m);
      mapRef.current=m; setReady(true); setTimeout(()=>m.invalidateSize(),100);
    }catch(e){setErr(e.message||'Could not load map')}
    return ()=>{if(mapRef.current){mapRef.current.remove();mapRef.current=null}}
  },[]);
  useEffect(()=>{
    const m=mapRef.current,L=window.L;if(!m||!L||!map.length)return;
    m.eachLayer(layer=>{if(layer.__railOverlay)m.removeLayer(layer)});
    const bounds=[],seen=new Set();
    const colors={pending:'#ef4444',ongoing:'#f59e0b',completed:'#10b981',approved:'#3b82f6',available:'#94a3b8'};
    [...map].sort((a,b)=>String(a.section).localeCompare(String(b.section),undefined,{numeric:true})).forEach(s=>{
      if(s.start_lat==null||s.end_lat==null)return;
      const c=colors[s.status]||colors.available;
      const line=L.polyline([[s.start_lat,s.start_lon],[s.end_lat,s.end_lon]],{color:c,weight:s.status==='approved'?7:5,opacity:.9,dashArray:s.status==='pending'?'8 7':undefined}).addTo(m);line.__railOverlay=true;
      line.bindPopup(`<div class="map-popup"><b>${routeLabel(s)}</b><br><span>${routeCorridor(s)}</span><hr>🔴 Pending: ${s.pending_count||0}<br>🟠 Ongoing: ${s.ongoing_count||0}<br>🟢 Completed: ${s.completed_count||0}<br>🔵 Scheduled: ${s.scheduled_count||0}</div>`);line.on('click',()=>onRouteSelect&&onRouteSelect(s));
      const mid=[(s.start_lat+s.end_lat)/2,(s.start_lon+s.end_lon)/2];
      const icon=L.divIcon({className:'rail-task-marker-wrap',html:`<div class="rail-task-marker" style="--marker:${c}">${s.total_task_count||s.task_count||0}</div>`,iconSize:[36,36],iconAnchor:[18,18]});
      const mk=L.marker(mid,{icon}).addTo(m);mk.__railOverlay=true;mk.on('click',()=>onRouteSelect&&onRouteSelect(s));mk.bindPopup(`<div class="map-popup"><b>${routeLabel(s)}</b><br><span>${routeCorridor(s)}</span><hr><strong>${s.total_task_count||0}</strong> tasks • <strong>${s.block_count||0}</strong> blocks<br>Pending ${s.pending_count||0} • Ongoing ${s.ongoing_count||0} • Completed ${s.completed_count||0}</div>`);
      [[s.start_station,s.start_lat,s.start_lon],[s.end_station,s.end_lat,s.end_lon]].forEach(([name,lat,lon])=>{if(seen.has(name))return;seen.add(name);const si=L.divIcon({className:'station-label-wrap',html:`<div class="station-label"><span class="station-dot"></span>${name}</div>`,iconSize:[0,0]});const sm=L.marker([lat,lon],{icon:si,interactive:false}).addTo(m);sm.__railOverlay=true});
      bounds.push([s.start_lat,s.start_lon],[s.end_lat,s.end_lon]);
    });
    if(bounds.length)m.fitBounds(bounds,{padding:[30,30],maxZoom:10});
    setTimeout(()=>m.invalidateSize(),120);
  },[map,onRouteSelect]);
  return <section className="card overflow-hidden">
    <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center md:justify-between gap-3"><div><div className="flex items-center gap-2"><Satellite size={19} className="text-blue-600"/><h3 className="font-bold">Network Map</h3><span className="map-badge">SATELLITE</span></div><p className="text-xs text-slate-500 mt-1">Satellite imagery with real station names and live task-status overlays.</p></div><div className="flex flex-wrap gap-2"><span className="map-count"><i className="dot pending-dot"/> {map.reduce((n,x)=>n+(x.pending_count||0),0)} Pending</span><span className="map-count"><i className="dot ongoing-dot"/> {map.reduce((n,x)=>n+(x.ongoing_count||0),0)} Ongoing</span><span className="map-count"><i className="dot completed-dot"/> {map.reduce((n,x)=>n+(x.completed_count||0),0)} Completed</span><span className="map-count"><i className="dot approved-dot"/> {map.reduce((n,x)=>n+(x.scheduled_count||0),0)} Scheduled</span></div></div>
    <div className={`relative ${height}`}><div ref={ref} className="absolute inset-0"/>{!ready&&!err&&<div className="absolute inset-0 z-[500] flex items-center justify-center bg-slate-100/70 backdrop-blur-sm"><div className="map-loading"><RefreshCw size={16} className="animate-spin"/> Loading satellite imagery…</div></div>}{err&&<div className="absolute inset-0 z-[500] flex items-center justify-center bg-slate-100 text-sm text-slate-500">{err}</div>}<div className="absolute bottom-4 left-4 z-[500] rounded-2xl bg-slate-950/85 p-3 text-white shadow-xl text-[10px]"><b className="uppercase tracking-widest text-slate-300">Task status</b><div className="grid grid-cols-2 gap-2 mt-2"><span>🔴 Pending</span><span>🟠 Ongoing</span><span>🟢 Completed</span><span>🔵 Approved</span></div></div></div>
    <div className="px-5 py-3 border-t border-slate-100 text-[11px] text-slate-500 flex flex-wrap justify-between gap-2"><span><b>Click</b> a route or numbered task marker for details.</span><span>Station mapping is demo data; production can use authorized railway GIS coordinates.</span></div>
  </section>;
}
function DatasetPanel({ onDone }) {
  const [type,setType]=useState("maintenance"), [file,setFile]=useState(null), [result,setResult]=useState(null), [busy,setBusy]=useState(false);
  async function upload() {
    if(!file) return;
    setBusy(true); setResult(null);
    const fd=new FormData(); fd.append("dataset_type",type); fd.append("file",file);
    try { const r=await api("/api/upload",{method:"POST",body:fd}); setResult(r); onDone(); }
    catch(e){ setResult({error:e.message}); } finally { setBusy(false); }
  }
  return <section className="card p-5">
    <div className="flex items-center gap-2"><Upload size={19} className="text-blue-600"/><h3 className="font-bold">Dynamic Dataset Upload</h3></div>
    <p className="text-xs text-slate-500 mt-1">Upload a CSV, validate it, then generate a fresh optimization plan.</p>
    <div className="mt-4 grid md:grid-cols-3 gap-3">
      <select className="input" value={type} onChange={e=>setType(e.target.value)}>
        <option value="maintenance">Maintenance Tasks</option><option value="assets">Assets</option>
        <option value="trains">Train Schedule</option><option value="corridor">Corridor Availability</option>
        <option value="sections">Sections</option><option value="forecast">Goods Forecast</option>
      </select>
      <input className="input" type="file" accept=".csv" onChange={e=>setFile(e.target.files?.[0]||null)}/>
      <button className="primary" disabled={!file||busy} onClick={upload}>{busy?"Uploading...":"Upload & Validate"}</button>
    </div>
    {result && <div className={`mt-4 rounded-xl p-4 text-sm ${result.error?"bg-red-50 text-red-700":"bg-emerald-50 text-emerald-700"}`}>
      {result.error ? result.error : <><b>✓ {result.filename}</b> — {result.records} records. {result.warnings?.length ? `Warnings: ${result.warnings.join("; ")}` : "Validation passed."}</>}
    </div>}
  </section>;
}

function ApprovalQueue({ approvals, onAction, onRefresh, sections=[] }) {
  return <section className="card overflow-hidden"><div className="p-5 border-b border-slate-100 flex justify-between">
    <div><h3 className="font-bold">Controller Approval Queue</h3><p className="text-xs text-slate-500 mt-1">Recommendations require human review before finalization.</p></div>
    <ClipboardCheck className="text-blue-600"/></div>
    {!approvals.length?<div className="p-10 text-center text-sm text-slate-400">No pending approvals.</div>:
    <div className="divide-y divide-slate-100">{approvals.map(b=><div key={b.block_id} className="p-5">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div><div className="flex items-center gap-2"><b className="text-blue-700">{b.block_id}</b><span className="badge bg-amber-100 text-amber-700">{b.approval_status}</span></div>
          <p className="mt-1 text-sm text-slate-700">{routeLabel(sections.find(s=>String(s.section)===String(b.section))) || b.section} • {b.date} • {b.block_start} – {b.block_end}</p>
          <p className="text-xs text-slate-500 mt-1">{b.task_count} tasks • {b.departments}</p>
          <div className="mt-3 flex flex-wrap gap-2">{(b.why_recommended||[]).map(x=><span key={x} className="reason">✓ {x}</span>)}</div>
        </div>
        <div className="flex gap-2">
          <button className="success-btn" onClick={()=>onAction(b.block_id,"approve")}>Approve</button>
          <button className="warn-btn" onClick={()=>onAction(b.block_id,"hold")}>Hold</button>
          <button className="danger-btn" onClick={()=>onAction(b.block_id,"reject")}>Reject</button>
        </div>
      </div>
    </div>)}</div>}
  </section>;
}

function EmergencyForm({ sections, onDone }) {
  const [form,setForm]=useState({task_id:"EMG-"+Date.now().toString().slice(-5),section:sections[0]?.section||"S01",department:"Engineering",estimated_duration_hours:1.5,asset_id:"",due_date:"",reason:"Critical defect detected"});
  const set=(k,v)=>setForm({...form,[k]:v});
  async function submit(e){e.preventDefault();try{await api("/api/emergency",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,severity:"Critical",safety_critical:"Yes",task_type:"Emergency Maintenance",status:"Pending"})});onDone("Emergency task added. Re-optimizing now…");}catch(err){onDone(err.message,true)}}
  return <form onSubmit={submit} className="card p-5"><div className="flex items-center gap-2"><Siren className="text-red-600"/><h3 className="font-bold">Emergency Maintenance</h3></div>
    <div className="grid md:grid-cols-4 gap-3 mt-4">
      <label className="label">Task ID<input className="input" value={form.task_id} onChange={e=>set("task_id",e.target.value)}/></label>
      <label className="label">Section<select className="input" value={form.section} onChange={e=>set("section",e.target.value)}>{sections.map(s=><option key={s.section} value={s.section}>{routeLabel(s)}</option>)}</select></label>
      <label className="label">Department<select className="input" value={form.department} onChange={e=>set("department",e.target.value)}><option>Engineering</option><option>S&T</option><option>Traction</option></select></label>
      <label className="label">Duration (hours)<input className="input" type="number" step=".5" min=".5" value={form.estimated_duration_hours} onChange={e=>set("estimated_duration_hours",e.target.value)}/></label>
    </div>
    <button className="danger-btn mt-4"><Siren size={16}/> Add Emergency Task</button>
  </form>;
}


function App() {
  const [user,setUser]=useState(()=>JSON.parse(localStorage.getItem("railSyncUser")||"null"));
  const [darkMode,setDarkMode]=useState(()=>localStorage.getItem("railSyncTheme")==="dark");
  const [page,setPage]=useState("Dashboard"), [sidebar,setSidebar]=useState(false), [loading,setLoading]=useState(false), [error,setError]=useState("");
  const [kpis,setKpis]=useState({scheduled_tasks:0,optimized_blocks:0,average_block_utilization_pct:0,critical_tasks_scheduled:0,overdue_tasks_scheduled:0,multi_department_blocks:0,total_tasks:0});
  const [blocks,setBlocks]=useState([]),[tasks,setTasks]=useState([]),[map,setMap]=useState([]),[approvals,setApprovals]=useState([]),[history,setHistory]=useState([]),[sectionRows,setSections]=useState([]),[corridors,setCorridors]=useState([]);
  const [insights,setInsights]=useState([]),[analytics,setAnalytics]=useState({department_load:[],status_mix:[],route_load:[]}),[conflicts,setConflicts]=useState({count:0,conflicts:[]}),[selectedRoute,setSelectedRoute]=useState(null);
  const [search,setSearch]=useState(""),[section,setSection]=useState("All"),[department,setDepartment]=useState("All"),[toast,setToast]=useState("");
  const [sim,setSim]=useState({section:"S03",date:"2026-09-20",start_time:"11:00",end_time:"13:00"}),[simResult,setSimResult]=useState(null);
  const [emergencyMsg,setEmergencyMsg]=useState("");

  const load=async()=>{setLoading(true);setError("");try{
    const [k,b,t,m,a,h,s,c,i,an,cf]=await Promise.all([
      api("/api/kpis"),api("/api/blocks"),api("/api/tasks"),api("/api/map"),api("/api/approvals"),api("/api/history"),api("/api/sections"),api("/api/corridors"),api("/api/insights"),api("/api/analytics"),api("/api/conflicts")
    ]);
    setKpis(k);setBlocks(b);setTasks(t);setMap(m);setApprovals(a);setHistory(h);setSections(s);setCorridors(c);setInsights(i.insights||[]);setAnalytics(an);setConflicts(cf||{count:0,conflicts:[]});
    if(s.length && !s.some(x=>x.section===sim.section)) setSim(v=>({...v,section:s[0].section}));
  }catch(e){setError(e.message)}finally{setLoading(false)}};

  useEffect(()=>{if(user)load()},[user]);
  useEffect(()=>{document.documentElement.classList.toggle("dark-theme",darkMode);localStorage.setItem("railSyncTheme",darkMode?"dark":"light")},[darkMode]);
  useEffect(()=>{if(toast){const x=setTimeout(()=>setToast(""),3500);return()=>clearTimeout(x)}},[toast]);

  const departments=useMemo(()=>["All",...new Set(tasks.map(x=>x.department).filter(Boolean))],[tasks]);
  const filteredBlocks=useMemo(()=>blocks.filter(b=>section==="All"||String(b.section)===section),[blocks,section]);
  const filteredTasks=useMemo(()=>tasks.filter(t=>(department==="All"||String(t.department)===department)&&(!search||Object.values(t).join(" ").toLowerCase().includes(search.toLowerCase()))).slice(0,40),[tasks,department,search]);
  const sectionLabel=(id)=>routeLabel(sectionRows.find(x=>String(x.section)===String(id))) || id;
  const chartData=useMemo(()=>{const m={};blocks.forEach(b=>{const s=sectionLabel(b.section);m[s]??={section:s,utilization:0,count:0};m[s].utilization+=Number(b.utilization_pct||0);m[s].count++});return Object.values(m).map(x=>({...x,utilization:Math.round(x.utilization/x.count)})).slice(0,10)},[blocks,sectionRows]);

  async function runOptimize(){try{setLoading(true);const r=await api("/api/optimize",{method:"POST"});setToast(`Optimization complete: ${r.result.scheduled_tasks} tasks scheduled`);await load()}catch(e){setError(e.message)}finally{setLoading(false)}}
  async function approval(id,action){try{await api(`/api/approvals/${id}/${action}`,{method:"POST"});setToast(`${id} ${action === "approve" ? "approved" : action === "hold" ? "put on hold" : "rejected"}`);await load()}catch(e){setError(e.message)}}
  async function reopt(){try{setLoading(true);const r=await api("/api/reoptimize",{method:"POST"});setEmergencyMsg(`Emergency re-optimization complete: ${r.result.optimized_blocks} blocks regenerated.`);setToast("Network plan updated after emergency task");await load()}catch(e){setError(e.message)}finally{setLoading(false)}}
  async function simulate(){try{setLoading(true);const r=await api("/api/simulation",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...sim,scenario_name:"Maintenance window what-if scenario"})});setSimResult(r);setToast("What-if scenario calculated — active plan unchanged")}catch(e){setError(e.message)}finally{setLoading(false)}}
  async function emergencyDone(msg,err){if(err){setError(msg);return}setEmergencyMsg(msg);await reopt()}
  function login(u){setUser(u);localStorage.setItem("railSyncUser",JSON.stringify(u))}
  function logout(){localStorage.removeItem("railSyncUser");setUser(null)}
  if(!user)return <Login onLogin={login}/>;

  const common=["Dashboard","Network Map","Block Plans","Maintenance","Forecast","What-if Simulation","Analytics","History"];
  const roleNav={
    "Controller":[...common,"Approvals","Conflicts"],
    "Maintenance Officer":["Dashboard","Network Map","Maintenance","Block Plans","What-if Simulation","Analytics","History"],
    "Admin":[...common,"Approvals","Conflicts"]
  };
  const icons={"Dashboard":LayoutDashboard,"Network Map":MapIcon,"Block Plans":Blocks,"Maintenance":Wrench,"Approvals":ClipboardCheck,"Forecast":CalendarDays,"What-if Simulation":FlaskConical,"History":History,"Analytics":BarChart3,"Conflicts":ShieldAlert};
  const nav=(roleNav[user.role]||common).map(n=>[n,icons[n]]);

  return <div className={`min-h-screen app-shell ${darkMode?"theme-dark":"theme-light"}`}>
    {sidebar&&<div className="fixed inset-0 z-30 bg-slate-900/30 lg:hidden" onClick={()=>setSidebar(false)}/>} 
    <aside className={`fixed z-40 flex h-screen w-64 flex-col bg-slate-950 text-white transition-transform lg:translate-x-0 ${sidebar?"translate-x-0":"-translate-x-full"}`}>
      <div className="flex items-center gap-3 px-6 py-6 border-b border-white/10"><div className="ir-mark"><TrainFront size={22}/></div><div><div className="font-bold tracking-tight">ABMS</div><div className="text-[10px] text-slate-400">Automatic Block Management System</div></div></div>
      <div className="mx-4 mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-2"><div className="text-[9px] uppercase tracking-widest text-slate-500">Active role</div><div className="mt-1 flex items-center gap-2 text-sm font-bold"><UserCog size={15}/>{user.role}</div></div>
      <nav className="p-4 space-y-1 overflow-y-auto">{nav.map(([name,Icon])=><button key={name} onClick={()=>{setPage(name);setSidebar(false)}} className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left text-sm ${page===name?"bg-red-700/30 text-red-100 shadow-inner":"text-slate-400 hover:bg-white/5 hover:text-white"}`}><Icon size={18}/>{name}{name==="Approvals"&&approvals.length>0?<span className="ml-auto badge bg-red-500 text-white">{approvals.length}</span>:null}{name==="Conflicts"&&conflicts.count>0?<span className="ml-auto badge bg-amber-500 text-white">{conflicts.count}</span>:null}</button>)}</nav>
      <div className="mt-auto m-4 rounded-2xl bg-white/5 p-4"><div className="flex items-center gap-2 text-sm font-semibold"><UserRound size={17}/>{user.username}</div><p className="mt-2 text-xs text-slate-400">Human-in-the-loop planning mode</p><button onClick={logout} className="mt-3 text-xs text-slate-300 flex items-center gap-2"><LogOut size={14}/> Sign out</button></div>
    </aside>

    <main className="lg:ml-64">
      <header className="sticky top-0 z-20 border-b border-slate-200 topbar"><div className="flex items-center justify-between px-5 py-4 lg:px-8">
        <div className="flex items-center gap-3"><button className="lg:hidden p-2" onClick={()=>setSidebar(true)}><Menu/></button><div><h1 className="text-xl font-black tracking-tight">ABMS Control Center</h1><p className="text-xs text-slate-500">{page} • {user.role} • Railway maintenance decision-support</p></div></div>
        <div className="flex items-center gap-3"><span className="hidden sm:flex items-center gap-2 rounded-full bg-emerald-50 text-emerald-700 px-3 py-1.5 text-xs font-semibold"><span className="h-2 w-2 bg-emerald-500 rounded-full"/> API Online</span><button onClick={()=>setDarkMode(v=>!v)} className="theme-toggle" title={darkMode?"Switch to light mode":"Switch to dark mode"}>{darkMode?<Sun size={18}/>:<Moon size={18}/>}</button><button onClick={load} className="rounded-xl border p-2.5"><RefreshCw size={18} className={loading?"animate-spin":""}/></button></div>
      </div></header>

      <div className="p-5 lg:p-8">
        {error&&<div className="mb-5 alert-red"><AlertTriangle size={17}/>{error}<button onClick={()=>setError("")} className="ml-auto"><X size={16}/></button></div>}
        {toast&&<div className="mb-5 alert-green"><CheckCircle2 size={17}/>{toast}</div>}

        {page==="Dashboard"&&<div className="space-y-6">
          <div className="dashboard-hero text-white"><div className="hero-glow"/><div className="relative flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5"><div><p className="text-[10px] font-black tracking-[.2em] text-red-200">RAILWAY OPERATIONS DECISION SUPPORT</p><h2 className="mt-2 text-3xl font-black tracking-tight">Network maintenance command view</h2><p className="mt-2 text-sm text-slate-200 max-w-2xl">Integrate maintenance demand, asset risk and operational constraints → optimize blocks → explain recommendations → obtain controller approval.</p></div><div className="flex gap-2"><button className="hero-button" onClick={runOptimize}><Play size={16}/> Generate Plan</button><button className="hero-button" onClick={()=>setPage("Conflicts")}><ShieldAlert size={16}/> {conflicts.count} Conflicts</button></div></div></div>
          <RoleQuickView role={user.role} kpis={kpis} approvals={approvals.length} conflicts={conflicts.count}/>
          <DatasetPanel onDone={load}/>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard icon={Wrench} label="Scheduled Tasks" value={kpis.scheduled_tasks} sub={`${kpis.total_tasks} tasks considered`} tone="blue"/>
            <MetricCard icon={Blocks} label="Optimized Blocks" value={kpis.optimized_blocks} sub="Recommended maintenance windows" tone="green"/>
            <MetricCard icon={Gauge} label="Avg. Utilization" value={`${kpis.average_block_utilization_pct}%`} sub="Available block capacity used" tone="amber"/>
            <MetricCard icon={AlertTriangle} label="Critical Scheduled" value={kpis.critical_tasks_scheduled} sub={`${kpis.overdue_tasks_scheduled} overdue scheduled`} tone="red"/>
          </div>
          <section className="card p-5"><div className="flex justify-between"><div><h3 className="font-bold">Route-wise block utilization</h3><p className="text-xs text-slate-500">Optimized maintenance window usage</p></div><Gauge className="text-red-600"/></div><div className="h-64 mt-4">{chartData.length?<ResponsiveContainer width="100%" height="100%"><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="section" tick={{fontSize:10}}/><YAxis unit="%"/><Tooltip/><Bar dataKey="utilization" name="Utilization %" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer>:<Empty/>}</div></section>
          <div className="grid gap-6 xl:grid-cols-2"><InsightsPanel insights={insights}/><ConflictSummary conflicts={conflicts}/></div>
          <RailwayMap map={map} onRouteSelect={setSelectedRoute}/>
          {selectedRoute&&<RouteDetailDrawer route={selectedRoute} onClose={()=>setSelectedRoute(null)} sections={sectionRows} tasks={tasks} blocks={blocks}/>}
          <ApprovalQueue approvals={approvals.slice(0,3)} onAction={approval} sections={sectionRows}/>
        </div>}

        {page==="Network Map"&&<div className="space-y-6"><div><h2 className="page-title">Network Status Map</h2><p className="page-sub">Satellite network view with maintenance status overlays.</p></div><RailwayMap map={map} onRouteSelect={setSelectedRoute}/>{selectedRoute&&<RouteDetailDrawer route={selectedRoute} onClose={()=>setSelectedRoute(null)} sections={sectionRows} tasks={tasks} blocks={blocks}/>}<div className="grid md:grid-cols-3 gap-4">{map.filter(x=>x.total_task_count).slice(0,12).map(s=><div className="card p-4 route-card" key={s.section}><div className="flex items-center justify-between gap-2"><b>{routeLabel(s)}</b><StatusPill status={s.status}/></div><p className="text-xs text-slate-500 mt-2">{routeCorridor(s)}</p><div className="mt-3 flex flex-wrap gap-2 text-[10px]"><span>🔴 {s.pending_count||0}</span><span>🟠 {s.ongoing_count||0}</span><span>🟢 {s.completed_count||0}</span><span>🔵 {s.scheduled_count||0}</span></div></div>)}</div><section className="card p-5"><div className="flex items-center justify-between gap-3"><div><h3 className="font-bold">Named Railway Corridors</h3><p className="text-xs text-slate-500 mt-1">Representative routes for the synthetic prototype network.</p></div><TrainFront className="text-red-600"/></div><div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 mt-4">{corridors.map(c=><div className="corridor-tile" key={c.corridor_id}><div className="corridor-line"/><div><b>{c.display_name}</b><p>{c.corridor}</p><span>{c.region}</span></div></div>)}</div></section></div>}

        {page==="Block Plans"&&<BlockPlans blocks={filteredBlocks} sections={sectionRows} onOptimize={runOptimize}/>} 
        {page==="Maintenance"&&<div className="space-y-6"><EmergencyForm sections={sectionRows} onDone={emergencyDone}/><div className="flex justify-between items-end"><div><h2 className="page-title">Maintenance Task Queue</h2><p className="page-sub">Dynamic tasks from the active dataset.</p></div><button className="danger-btn" onClick={reopt}><RefreshCw size={16}/> Re-optimize</button></div>{emergencyMsg&&<div className="alert-blue">{emergencyMsg}</div>}<div className="card overflow-auto"><div className="p-4 flex gap-3"><div className="relative flex-1"><Search className="absolute left-3 top-2.5 text-slate-400" size={16}/><input className="input pl-9" placeholder="Search tasks, assets or routes..." value={search} onChange={e=>setSearch(e.target.value)}/></div><select className="input w-48" value={department} onChange={e=>setDepartment(e.target.value)}>{departments.map(x=><option key={x}>{x}</option>)}</select></div><table className="table"><thead><tr><th>Task</th><th>Asset</th><th>Department</th><th>Route</th><th>Severity</th><th>Status</th><th>Assignment</th></tr></thead><tbody>{filteredTasks.map(t=><tr key={t.task_id}><td className="font-semibold">{t.task_id}</td><td>{t.asset_id}</td><td>{t.department}</td><td>{sectionLabel(t.section)}</td><td>{t.severity}</td><td><StatusPill status={String(t.status||"").toLowerCase()==="overdue"?"pending":String(t.status||"").toLowerCase()}/></td><td>{t.assignment_status}</td></tr>)}</tbody></table></div></div>}

        {page==="Approvals"&&<div className="space-y-6"><div><h2 className="page-title">Controller Approval Queue</h2><p className="page-sub">Recommendations require human review before finalization.</p></div><ApprovalQueue approvals={approvals} onAction={approval} sections={sectionRows}/></div>}
        {page==="Conflicts"&&<ConflictsPage conflicts={conflicts} sections={sectionRows}/>} 
        {page==="Analytics"&&<AnalyticsPage analytics={analytics} kpis={kpis}/>} 
        {page==="Forecast"&&<Forecast/>}
        {page==="What-if Simulation"&&<Simulation sim={sim} setSim={setSim} onRun={simulate} result={simResult} sections={sectionRows} currentKpis={kpis}/>} 
        {page==="History"&&<HistoryPanel history={history}/>} 
      </div>
      <footer className="px-8 py-8 text-center text-xs text-slate-400">ABMS (Automatic Block Management System) • Indian Railways-inspired prototype UI • AI-assisted prioritization + OR-Tools CP-SAT • Synthetic/demo data • Human approval required</footer>
    </main>
  </div>;
}

function RoleQuickView({role,kpis,approvals,conflicts}){
  const text={Controller:["Controller Command View","Review optimized blocks, conflicts and approval requests."],"Maintenance Officer":["Maintenance Operations","Track work, emergency tasks and recommended windows."],Admin:["System Administration","Monitor datasets, optimization health and audit activity."]}[role]||[role,"Decision-support workspace"];
  return <div className="card p-4"><div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4"><div><div className="eyebrow"><UserCog size={13}/> ROLE-AWARE WORKSPACE</div><h3 className="mt-1 text-lg font-black">{text[0]}</h3><p className="text-xs text-slate-500 mt-1">{text[1]}</p></div><div className="flex flex-wrap gap-2 text-[10px] font-bold"><span className="badge bg-slate-100 text-slate-700">{approvals} approvals</span><span className="badge bg-amber-100 text-amber-700">{conflicts} conflicts</span><span className="badge bg-blue-100 text-blue-700">{kpis.multi_department_blocks} multi-dept blocks</span></div></div></div>;
}

function BlockPlans({blocks,sections,onOptimize}){
  const [expanded,setExpanded]=useState(null);
  const label=id=>routeLabel(sections.find(s=>String(s.section)===String(id)))||id;
  return <div className="space-y-6"><div className="flex justify-between"><div><h2 className="page-title">Optimized Block Plans</h2><p className="page-sub">Recommended maintenance windows with explainable approval rationale.</p></div><button className="primary" onClick={onOptimize}><Play size={16}/> Re-run Optimization</button></div><div className="card p-5 overflow-auto"><h3 className="font-bold">Block Timeline</h3><p className="text-xs text-slate-500 mt-1">Gantt-style view of recommended maintenance windows.</p><div className="mt-4 min-w-[760px] space-y-2">{blocks.slice(0,16).map(b=>{const start=Number(String(b.block_start||"09:00").split(":")[0])*60+Number(String(b.block_start||"09:00").split(":")[1]);const end=Number(String(b.block_end||"10:00").split(":")[0])*60+Number(String(b.block_end||"10:00").split(":")[1]);const left=Math.max(0,Math.min(100,(start-300)/1080*100));const width=Math.max(3,Math.min(100-left,(end-start)/1080*100));return <div key={b.block_id} className="flex items-center gap-3 text-xs"><div className="w-24 font-semibold text-red-700">{b.block_id}</div><div className="relative h-9 flex-1 rounded-lg bg-slate-100 overflow-hidden"><div className="absolute top-1 bottom-1 rounded-md bg-gradient-to-r from-red-700 to-red-500 text-white px-2 flex items-center font-semibold" style={{left:`${left}%`,width:`${width}%`}}>{label(b.section)} • {b.block_start}–{b.block_end}</div></div></div>})}</div></div><div className="card overflow-auto"><table className="table"><thead><tr><th>Block</th><th>Date</th><th>Route</th><th>Time</th><th>Tasks</th><th>Departments</th><th>Utilization</th><th>Approval</th><th>Explain</th></tr></thead><tbody>{blocks.map(b=><React.Fragment key={b.block_id}><tr><td className="font-bold text-red-700">{b.block_id}</td><td>{b.date}</td><td>{label(b.section)}</td><td>{b.block_start} – {b.block_end}</td><td>{b.task_count}</td><td>{b.departments}</td><td>{b.utilization_pct}%</td><td><span className="badge bg-slate-100 text-slate-700">{b.approval_status}</span></td><td><button className="text-xs font-bold text-red-700" onClick={()=>setExpanded(expanded===b.block_id?null:b.block_id)}>{expanded===b.block_id?"Hide":"Why?"}</button></td></tr>{expanded===b.block_id&&<tr><td colSpan="9"><div className="p-3 bg-slate-50 rounded-xl"><b>Why recommended?</b><p className="text-xs text-slate-600 mt-1">Priority-weighted tasks, train-free windows, capacity constraints, compatible department grouping and block reuse were considered by the optimization engine.</p></div></td></tr>}</React.Fragment>)}</tbody></table></div></div>;
}

function ConflictsPage({conflicts,sections}){
  const label=id=>routeLabel(sections.find(s=>String(s.section)===String(id)))||id;
  return <div className="space-y-6"><div className="page-hero"><div><div className="eyebrow"><ShieldAlert size={14}/> CONFLICT DETECTION</div><h2 className="page-title mt-2">Operational Conflict Monitor</h2><p className="page-sub">Checks generated maintenance assignments against scheduled train windows.</p></div><div className={`hero-chip ${conflicts.count?"text-amber-700":"text-emerald-700"}`}>{conflicts.count} detected</div></div>{!conflicts.count?<div className="alert-green"><CheckCircle2 size={17}/> No train-window conflicts detected in the current optimized plan.</div>:<div className="card overflow-auto"><table className="table"><thead><tr><th>Task</th><th>Route</th><th>Date</th><th>Train</th><th>Train window</th><th>Action</th></tr></thead><tbody>{conflicts.conflicts.map((c,i)=><tr key={i}><td className="font-bold">{c.task_id}</td><td>{label(c.section)}</td><td>{c.date}</td><td>{c.train_id}</td><td>{c.train_time}</td><td><span className="badge bg-amber-100 text-amber-700">Review / Re-optimize</span></td></tr>)}</tbody></table></div>}<div className="card p-5"><h3 className="font-bold">Decision rule</h3><p className="text-sm text-slate-600 mt-2">A conflict is flagged when a scheduled maintenance interval overlaps a train arrival/departure interval on the same section and date. In production, this layer can consume authorized live timetable/traffic feeds.</p></div></div>;
}

function AnalyticsPage({analytics,kpis}){
  const max=Math.max(...(analytics.department_load||[]).map(x=>x.tasks),1);
  return <div className="space-y-6"><div><div className="eyebrow"><BarChart3 size={14}/> NETWORK ANALYTICS</div><h2 className="page-title mt-2">Maintenance & Optimization Analytics</h2><p className="page-sub">Operational workload and optimization indicators from the active synthetic dataset.</p></div><div className="grid md:grid-cols-3 gap-4"><MetricCard icon={Database} label="Total Tasks" value={kpis.total_tasks} sub="Active maintenance dataset" tone="blue"/><MetricCard icon={Blocks} label="Blocks" value={kpis.optimized_blocks} sub="Generated recommendations" tone="green"/><MetricCard icon={TrendingUp} label="Utilization" value={`${kpis.average_block_utilization_pct}%`} sub="Average block utilization" tone="amber"/></div><div className="grid xl:grid-cols-2 gap-6"><section className="card p-5"><h3 className="font-bold">Department workload</h3><div className="mt-5 space-y-4">{(analytics.department_load||[]).map(x=><div key={x.department}><div className="flex justify-between text-xs font-bold"><span>{x.department}</span><span>{x.tasks}</span></div><div className="h-3 mt-1 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-red-800 to-red-500" style={{width:`${x.tasks/max*100}%`}}/></div></div>)}</div></section><section className="card p-5"><h3 className="font-bold">Task status mix</h3><div className="mt-4 grid grid-cols-2 gap-3">{(analytics.status_mix||[]).map(x=><div className="stat" key={x.status}><span>{x.status}</span><b>{x.tasks}</b></div>)}</div></section></div><section className="card p-5"><h3 className="font-bold">Highest maintenance workload corridors</h3><div className="mt-4 grid md:grid-cols-2 xl:grid-cols-3 gap-3">{(analytics.route_load||[]).map((x,i)=><div className="route-analytics" key={i}><div className="text-xs font-bold">{x.route}</div><div className="text-2xl font-black text-red-700 mt-1">{x.tasks}</div><div className="text-[10px] text-slate-500">maintenance tasks</div></div>)}</div></section></div>;
}

function InsightsPanel({ insights }) {
  const data = insights || {};
  const items = Array.isArray(data)
    ? data
    : (data.insights || data.items || data.recommendations || []);

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold">AI Insights</h3>
          <p className="text-xs text-slate-500 mt-1">
            Data-driven planning observations
          </p>
        </div>
        <span className="badge bg-blue-100 text-blue-700">
          Decision Support
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {items.length > 0 ? (
          items.slice(0, 5).map((item, index) => {
            const text =
              typeof item === "string"
                ? item
                : item.message ||
                  item.insight ||
                  item.reason ||
                  item.text ||
                  JSON.stringify(item);

            return (
              <div
                key={index}
                className="rounded-xl border border-slate-200 p-3 bg-slate-50"
              >
                <p className="text-sm text-slate-700">{text}</p>
              </div>
            );
          })
        ) : (
          <div className="rounded-xl bg-blue-50 p-4">
            <p className="text-sm font-semibold text-blue-800">
              Optimization insights are available after generating an optimized plan.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function ConflictSummary({ conflicts }) {
  const data = conflicts || {};
  const count = Number(data.count || 0);
  const rows = Array.isArray(data.conflicts) ? data.conflicts : [];

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold">Conflict Detection</h3>
          <p className="text-xs text-slate-500 mt-1">
            Maintenance assignments checked against train windows
          </p>
        </div>

        <span
          className={`badge ${
            count
              ? "bg-amber-100 text-amber-700"
              : "bg-emerald-100 text-emerald-700"
          }`}
        >
          {count} detected
        </span>
      </div>

      {count === 0 ? (
        <div className="alert-green mt-4">
          No train-window conflicts detected in the current plan.
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {rows.slice(0, 5).map((conflict, index) => (
            <div
              key={index}
              className="rounded-xl border border-amber-200 bg-amber-50 p-3"
            >
              <div className="text-sm font-bold">
                {conflict.task_id || "Maintenance Task"}
              </div>

              <div className="text-xs text-slate-600 mt-1">
                Train: {conflict.train_id || "N/A"} •
                Time: {conflict.train_time || "N/A"}
              </div>

              <div className="text-xs text-amber-700 font-semibold mt-2">
                Review / Re-optimize
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Empty(){return <div className="h-full flex items-center justify-center text-sm text-slate-400">No optimization data available.</div>}

function Forecast(){
  const [data,setData]=useState([]); useEffect(()=>{api("/api/trains").then(setData).catch(()=>{})},[]);
  const counts=useMemo(()=>{const m={};data.forEach(x=>{m[x.date]=(m[x.date]||0)+1});return Object.entries(m).map(([date,trains])=>({date:date?.slice(5),trains})).slice(0,14)},[data]);
  return <div className="space-y-6"><div><h2 className="page-title">Traffic / Forecast View</h2><p className="page-sub">Train movement demand used as operational context for maintenance planning.</p></div><div className="card p-5 h-80"><ResponsiveContainer width="100%" height="100%"><BarChart data={counts}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="date"/><YAxis/><Tooltip/><Bar dataKey="trains" name="Scheduled trains"/></BarChart></ResponsiveContainer></div><div className="alert-blue">Production scope: timetable and traffic demand can be integrated after authorized railway-system integration.</div></div>
}

function Simulation({sim,setSim,onRun,result,sections,currentKpis}){
  const set=(k,v)=>setSim({...sim,[k]:v}); const current=sections.find(s=>s.section===sim.section);
  const delta=result?.result?.comparison;
  return <div className="space-y-6"><div className="page-hero"><div><div className="eyebrow"><FlaskConical size={14}/> WHAT-IF LAB</div><h2 className="page-title mt-2">Scenario Simulation</h2><p className="page-sub">Test a new maintenance window without changing the active plan.</p></div><div className="hero-chip"><TimerReset size={15}/> Non-destructive scenario</div></div><div className="card p-6"><div className="grid md:grid-cols-4 gap-4"><label className="label">Route<select className="input" value={sim.section} onChange={e=>set("section",e.target.value)}>{sections.map(s=><option key={s.section} value={s.section}>{routeLabel(s)}</option>)}</select></label><label className="label">Date<input className="input" type="date" value={sim.date} onChange={e=>set("date",e.target.value)}/></label><label className="label">Start<input className="input" type="time" value={sim.start_time} onChange={e=>set("start_time",e.target.value)}/></label><label className="label">End<input className="input" type="time" value={sim.end_time} onChange={e=>set("end_time",e.target.value)}/></label></div><p className="field-help mt-2">{routeCorridor(current)} • {routeLabel(current)||sim.section}</p><button className="primary mt-5" onClick={onRun}><FlaskConical size={17}/> Run Scenario</button></div>{result&&<div className="simulation-result"><div className="eyebrow">SCENARIO COMPARISON</div><h3 className="mt-1 text-lg font-extrabold text-slate-900">{result.scenario?.scenario_name||"Scenario"}</h3><p className="text-xs text-slate-500 mt-1">The active plan remains unchanged. Compare scenario output with the current plan before proposing a change.</p><div className="grid sm:grid-cols-3 gap-3 mt-5"><div className="sim-stat"><span>Scheduled tasks</span><b>{result.result?.scheduled_tasks??0}</b><small>current {currentKpis.scheduled_tasks}</small></div><div className="sim-stat"><span>Optimized blocks</span><b>{result.result?.optimized_blocks??0}</b><small>current {currentKpis.optimized_blocks}</small></div><div className="sim-stat"><span>Utilization</span><b>{result.result?.average_block_utilization_pct??0}%</b><small>current {currentKpis.average_block_utilization_pct}%</small></div></div>{delta&&<div className="grid sm:grid-cols-3 gap-3 mt-4"><div className="stat"><span>Task delta</span><b>{delta.scheduled_tasks_delta>=0?"+":""}{delta.scheduled_tasks_delta}</b></div><div className="stat"><span>Block delta</span><b>{delta.optimized_blocks_delta>=0?"+":""}{delta.optimized_blocks_delta}</b></div><div className="stat"><span>Utilization delta</span><b>{delta.utilization_delta_pct>=0?"+":""}{delta.utilization_delta_pct}%</b></div></div>}<div className="mt-4 rounded-xl bg-white/80 border border-white p-4 text-xs text-slate-600"><b>Scenario:</b> {routeLabel(current)||sim.section} • {sim.date} • {sim.start_time}–{sim.end_time}. This is an isolated optimization run.</div></div>}</div>
}

function HistoryPanel({history}){
  return <div className="space-y-6"><div><div className="eyebrow"><FileClock size={14}/> AUDIT TRAIL</div><h2 className="page-title mt-2">Audit & Decision History</h2><p className="page-sub">Prototype record of uploads, optimization runs, emergency actions and controller decisions.</p></div><div className="card divide-y divide-slate-100">{history.length?history.map((h,i)=><div className="p-4 flex gap-3" key={i}><History size={17} className="text-red-600 mt-1"/><div><b className="text-sm">{h.action}</b><p className="text-sm text-slate-600">{h.detail}</p><p className="text-xs text-slate-400 mt-1">{h.timestamp} • {h.actor}</p></div></div>):<div className="p-10 text-center text-slate-400">No history yet.</div>}</div></div>
}

createRoot(document.getElementById("root")).render(<App/>);
