"""HEXAi FastAPI Backend"""
import os, uuid, sys
from fastapi import FastAPI, UploadFile, File, Form, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client
from dotenv import load_dotenv

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from agents.hexai_graph import run_hexai_agents
from api.services.vector_store import load_knowledge_base

load_dotenv()
app = FastAPI(title="HEXAi API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
sb  = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_ROLE_KEY"))

@app.on_event("startup")
async def startup():
    print("⚡ Starting HEXAi...")
    load_knowledge_base()
    print("✅ Ready at http://localhost:8000")

@app.get("/health")
async def health():
    return {"status": "ok", "service": "HEXAi API v1.0"}

@app.post("/sessions/upload")
async def upload(background_tasks: BackgroundTasks,
                 video: UploadFile = File(...), athlete_id: str = Form(...)):
    sid   = str(uuid.uuid4())
    vb    = await video.read()
    fp    = f"videos/{sid}/{video.filename}"
    sb.storage.from_("sessions").upload(fp, vb)
    url   = sb.storage.from_("sessions").get_public_url(fp)
    sb.table("sessions").insert({"id":sid,"athlete_id":athlete_id,"status":"processing","video_url":url}).execute()
    background_tasks.add_task(analyze, sid, athlete_id)
    return {"session_id": sid, "status": "processing"}

async def analyze(sid, athlete_id):
    try:
        res     = sb.table("athletes").select("*").eq("id", athlete_id).execute()
        profile = res.data[0] if res.data else {"sport":"general","goals":"improve","injury_history":[]}
        metrics = {"knee_valgus_angle":22.5,"hip_hinge_depth":68.0,"trunk_lean":14.2,
                   "asymmetry_score":0.28,"rep_count":10,"fatigue_index":0.55}
        report  = run_hexai_agents(sid, athlete_id, profile, metrics)
        sb.table("sessions").update({"status":"done"}).eq("id",sid).execute()
        sb.table("agent_outputs").insert({
            "session_id":sid,"key_issues":report.get("movement_analysis"),
            "coaching_cues":report.get("coaching_cues"),"weekly_plan":report.get("weekly_plan"),
            "red_flags":report.get("safety_rules"),"risk_level":report.get("summary",{}).get("risk_level"),
            "risk_score":report.get("summary",{}).get("risk_score"),"agent_log":report.get("agent_log")
        }).execute()
    except Exception as e:
        sb.table("sessions").update({"status":"failed"}).eq("id",sid).execute()
        raise e

@app.get("/sessions/{sid}")
async def get_session(sid: str):
    s = sb.table("sessions").select("*").eq("id",sid).execute()
    if not s.data: return {"error":"Not found"}
    session = s.data[0]
    if session['status'] == 'done':
        out = sb.table("agent_outputs").select("*").eq("session_id",sid).execute()
        session['agent_output'] = out.data[0] if out.data else {}
    return session

@app.get("/athletes/{aid}/dashboard")
async def dashboard(aid: str):
    s = sb.table("sessions").select("*").eq("athlete_id",aid).order("created_at",desc=True).limit(10).execute()
    return {"sessions": s.data}