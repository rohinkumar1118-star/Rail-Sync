from pathlib import Path
import pandas as pd
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OUT = ROOT / "outputs"
OUT.mkdir(exist_ok=True)

START = pd.Timestamp("2026-09-07")
END = pd.Timestamp("2026-09-20")
SEV = {"Critical":10,"High":7,"Medium":5,"Low":2}
SAFE = {"Yes":10,"No":3}
IMP = {"High":10,"Medium":6,"Low":3}

def tm(x):
    h,m=map(int,x.split(":")); return h*60+m
def ts(x):
    x=int(round(x)); return f"{x//60:02d}:{x%60:02d}"
def overlap(a,b,c,d): return max(a,c)<min(b,d)

def make_priority(m,a):
    x=m[m.status.isin(["Pending","Overdue"])].copy()
    x["due_date"]=pd.to_datetime(x["due_date"])
    x["days_until_due"]=(x["due_date"]-START).dt.days
    x["urgency_score"]=np.clip(10-x["days_until_due"].clip(-10,10),0,20)
    x["severity_score"]=x.severity.map(SEV)
    x["safety_score"]=x.safety_critical.map(SAFE)
    x=x.merge(a[["asset_id","importance"]],on="asset_id",how="left")
    x["asset_importance_score"]=x.importance.map(IMP)
    x["priority_score"]=(x.severity_score*3.5+x.safety_score*2.5+
                         x.asset_importance_score*1.5+x.urgency_score*1.5+
                         np.where(x.status.eq("Overdue"),10,0))
    return x.sort_values("priority_score",ascending=False).reset_index(drop=True)

def trains_on(t,section,date):
    x=t[(t.section==section)&(t.date==date)]
    return list(x[["arrival_min","departure_min"]].itertuples(index=False,name=None))

def free(c,t,section,date):
    wins=c[(c.section==section)&(c.date==date)&(c.availability=="Available")]
    ti=sorted(trains_on(t,section,date)); out=[]
    for w in wins.itertuples(index=False):
        s,e=int(w.start_min),int(w.end_min); cur=s
        for a,b in ti:
            if b<=cur: continue
            if a>=e: break
            if a>cur: out.append((cur,min(a,e)))
            cur=max(cur,b)
            if cur>=e: break
        if cur<e: out.append((cur,e))
    return out

def run():
    m=pd.read_csv(DATA/"maintenance_tasks.csv")
    t=pd.read_csv(DATA/"train_schedule.csv")
    c=pd.read_csv(DATA/"corridor_availability.csv")
    a=pd.read_csv(DATA/"assets.csv")
    t["arrival_min"]=t.arrival_time.map(tm); t["departure_min"]=t.departure_time.map(tm)
    c["start_min"]=c.start_time.map(tm); c["end_min"]=c.end_time.map(tm)
    tasks=make_priority(m,a)
    tasks.to_csv(OUT/"priority_tasks.csv",index=False)

    dates=sorted(set(c.date)&set(pd.date_range(START,END).strftime("%Y-%m-%d")))
    blocks=[]; results=[]
    for _,task in tasks.iterrows():
        dur=float(task.estimated_duration_hours)*60; placed=False
        for date in dates:
            for fs,fe in free(c,t,task.section,date):
                existing=None
                for b in blocks:
                    if b["section"]==task.section and b["date"]==date and b["block_end"]>=fs and b["block_end"]+dur<=fe:
                        existing=b; break
                if existing:
                    new_end=existing["block_end"]+dur
                    if any(overlap(existing["block_start"],new_end,a,b) for a,b in trains_on(t,task.section,date)):
                        continue
                    existing["block_end"]=new_end
                    existing["task_ids"].append(task.task_id)
                    existing["departments"].add(task.department)
                    existing["maintenance_hours"]+=float(task.estimated_duration_hours)
                    results.append([task.task_id,task.department,task.section,round(task.priority_score,2),
                                     existing["block_id"],date,ts(existing["block_start"]),ts(new_end),
                                     "Scheduled","Grouped into existing block"])
                    placed=True; break
                if fe-fs>=dur:
                    bid=f"B{len(blocks)+1:03d}"
                    blocks.append({"block_id":bid,"section":task.section,"date":date,
                                   "block_start":fs,"block_end":fs+dur,"window_end":fe,
                                   "task_ids":[task.task_id],"departments":{task.department},
                                   "maintenance_hours":float(task.estimated_duration_hours)})
                    results.append([task.task_id,task.department,task.section,round(task.priority_score,2),
                                    bid,date,ts(fs),ts(fs+dur),"Scheduled","New conflict-free block"])
                    placed=True; break
            if placed: break
        if not placed:
            results.append([task.task_id,task.department,task.section,round(task.priority_score,2),
                            "","","","","Unscheduled","No suitable conflict-free window"])

    task_plan=pd.DataFrame(results,columns=["task_id","department","section","priority_score","block_id",
                                            "date","block_start","block_end","status","reason"])
    rows=[]
    for b in blocks:
        dur=b["block_end"]-b["block_start"]
        util=(b["maintenance_hours"]*60/dur*100) if dur else 0
        rows.append([b["block_id"],b["date"],b["section"],ts(b["block_start"]),ts(b["block_end"]),
                     round(dur/60,2),round(b["maintenance_hours"],2),round(min(util,100),2),
                     len(b["task_ids"]),", ".join(sorted(b["departments"])),", ".join(b["task_ids"])])
    block_plan=pd.DataFrame(rows,columns=["block_id","date","section","block_start","block_end",
                                           "block_duration_hours","maintenance_hours","block_utilization_pct",
                                           "task_count","departments","task_ids"])
    task_plan.to_csv(OUT/"optimized_task_assignments.csv",index=False)
    block_plan.to_csv(OUT/"optimized_block_plan.csv",index=False)

    print("\n=== PHASE 2 RESULTS ===")
    print("Tasks considered:",len(tasks))
    print("Scheduled:",(task_plan.status=="Scheduled").sum())
    print("Unscheduled:",(task_plan.status=="Unscheduled").sum())
    print("Blocks:",len(block_plan))
    if len(block_plan): print("Average utilization:",round(block_plan.block_utilization_pct.mean(),2),"%")

if __name__=="__main__": run()
