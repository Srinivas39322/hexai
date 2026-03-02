"""HEXAi LangGraph Multi-Agent System"""
import os, json, sys
from typing import TypedDict, List, Optional
from langgraph.graph import StateGraph, END
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage
from langfuse import Langfuse
from dotenv import load_dotenv

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from api.services.vector_store import get_best_drills, get_safety_rules, find_similar, store_session

load_dotenv()

llm_fast  = ChatAnthropic(model="claude-haiku-4-5-20251001", max_tokens=1000)
llm_smart = ChatAnthropic(model="claude-sonnet-4-6",  max_tokens=2000)
lf        = Langfuse()

class State(TypedDict):
    session_id: str; athlete_id: str
    athlete_profile: dict; pose_metrics: dict
    risk_level: str; movement_issues: List[str]
    bio_analysis: List[dict]; risk_score: float
    drills: List[dict]; safety_rules: List[dict]
    cues: List[str]; plan: dict
    past_sessions: List[dict]; report: dict
    safety_note: Optional[str]; log: List[str]

def planner(s):
    print("\n🧠 PLANNER")
    r = llm_fast.invoke([HumanMessage(content=f"""Triage this session.
Athlete: {json.dumps(s['athlete_profile'])}
Metrics: {json.dumps(s['pose_metrics'])}
Rules: knee_valgus>25=amber,>35=red | asymmetry>0.25=amber,>0.40=red | fatigue>0.70=amber,>0.85=red
Return JSON only: {{"risk_level":"green|amber|red","movement_issues":["i1","i2","i3"]}}""")])
    out = json.loads(r.content)
    s['risk_level'] = out['risk_level']
    s['movement_issues'] = out['movement_issues']
    s['log'].append(f"PLANNER→risk={out['risk_level']}")
    return s

def memory(s):
    print("\n🧬 MEMORY")
    summary = f"Sport:{s['athlete_profile'].get('sport')} Issues:{','.join(s['movement_issues'])}"
    s['past_sessions'] = find_similar(s['athlete_id'], summary)
    s['log'].append(f"MEMORY→{len(s['past_sessions'])} past sessions")
    return s

def analyst(s):
    print("\n🔬 ANALYST")
    r = llm_smart.invoke([HumanMessage(content=f"""Biomechanics analysis.
Metrics: {json.dumps(s['pose_metrics'])}
Issues: {s['movement_issues']}
Sport: {s['athlete_profile'].get('sport','general')}
Return JSON only: {{"analysis":[{{"issue":"...","root_cause":"...","severity":7,"muscles_involved":["glute_med"],"explanation":"..."}}]}}""")])
    s['bio_analysis'] = json.loads(r.content)['analysis']
    s['log'].append(f"ANALYST→{len(s['bio_analysis'])} issues")
    return s

def injury_risk(s):
    print("\n⚠️  INJURY RISK")
    m = s['pose_metrics']
    sc = 0
    v = m.get('knee_valgus_angle', 0)
    sc += 30 if v>35 else 20 if v>25 else 10 if v>15 else 0
    a = m.get('asymmetry_score', 0)
    sc += 25 if a>0.40 else 15 if a>0.25 else 8 if a>0.15 else 0
    f = m.get('fatigue_index', 0)
    sc += 25 if f>0.85 else 15 if f>0.70 else 8 if f>0.50 else 0
    h = s['athlete_profile'].get('injury_history', [])
    sc += 20 if len(h)>2 else 10 if len(h)>0 else 0
    s['safety_rules'] = get_safety_rules(s['movement_issues'])
    s['risk_score'] = min(sc, 100)
    s['log'].append(f"RISK→score={sc}/100")
    return s

def coaching(s):
    print("\n🏋️  COACHING")
    sport = s['athlete_profile'].get('sport','general')
    causes = [a.get('root_cause','') for a in s['bio_analysis']]
    muscles = [m for a in s['bio_analysis'] for m in a.get('muscles_involved',[])]
    q = f"{sport} athlete. Issues:{','.join(s['movement_issues'])}. Causes:{','.join(causes)}. Muscles:{','.join(muscles)}"
    best = get_best_drills(q, sport, 3)
    s['drills'] = best
    drill_ctx = "\n".join([f"- {d['metadata'].get('name')}" for d in best])
    r = llm_smart.invoke([HumanMessage(content=f"""Elite sports coach.
Athlete: {json.dumps(s['athlete_profile'])}
Issues: {json.dumps(s['bio_analysis'])}
Risk: {s['risk_level']} | Score: {s['risk_score']}/100
Past patterns: {json.dumps(s.get('past_sessions',[]))}
Best drills: {drill_ctx}
Return JSON only:
{{"coaching_cues":["cue1","cue2","cue3","cue4","cue5"],
"weekly_plan":{{"monday":{{"focus":"technique","drills":["name"],"duration_mins":45,"intensity":"60%"}},
"tuesday":{{"focus":"recovery","drills":["foam roll"],"duration_mins":20,"intensity":"30%"}},
"wednesday":{{"focus":"strength","drills":[],"duration_mins":50,"intensity":"75%"}},
"thursday":{{"focus":"rest","drills":[],"duration_mins":0,"intensity":"0%"}},
"friday":{{"focus":"sport","drills":[],"duration_mins":45,"intensity":"70%"}},
"saturday":{{"focus":"mobility","drills":[],"duration_mins":30,"intensity":"40%"}},
"sunday":{{"focus":"rest","drills":[],"duration_mins":0,"intensity":"0%"}}}}}}""")])
    out = json.loads(r.content)
    s['cues'] = out['coaching_cues']
    s['plan'] = out['weekly_plan']
    s['log'].append("COACHING→plan built via RAG+rerank")
    return s

def reporter(s):
    print("\n📊 REPORTER")
    store_session(s['session_id'], s['athlete_id'],
                  f"Sport:{s['athlete_profile'].get('sport')} Risk:{s['risk_level']} Score:{s['risk_score']} Issues:{','.join(s['movement_issues'])}")
    s['report'] = {
        "session_id": s['session_id'],
        "summary": {"risk_level":s['risk_level'],"risk_score":s['risk_score'],"total_issues":len(s['movement_issues'])},
        "movement_analysis": s['bio_analysis'],
        "coaching_cues": s['cues'],
        "recommended_drills": [{"name":d['metadata'].get('name'),"score":round(d.get('rerank_score',0),3)} for d in s.get('drills',[])],
        "weekly_plan": s['plan'],
        "agent_log": s['log']
    }
    s['log'].append("REPORTER→done ✅")
    return s

def safety(s):
    print("\n🛡️  SAFETY")
    r = llm_fast.invoke([HumanMessage(content=f"""Safety check. Risk:{s['risk_level']} Score:{s['risk_score']}/100
Review cues - no diagnoses, no absolute injury claims, add clinician note if red/amber.
Cues: {json.dumps(s['cues'])}
Return JSON only: {{"safe_cues":["c1","c2","c3","c4","c5"],"safety_note":null}}""")])
    out = json.loads(r.content)
    s['cues'] = out['safe_cues']
    s['safety_note'] = out.get('safety_note')
    if s.get('report'):
        s['report']['coaching_cues'] = out['safe_cues']
        s['report']['safety_note'] = s['safety_note']
    s['log'].append("SAFETY→verified ✅")
    return s

def route(s):
    return 'safety' if s['risk_level'] == 'red' else 'memory'

def build_graph():
    g = StateGraph(State)
    for name, fn in [("planner",planner),("memory",memory),("analyst",analyst),
                     ("injury_risk",injury_risk),("coaching",coaching),("reporter",reporter),("safety",safety)]:
        g.add_node(name, fn)
    g.set_entry_point("planner")
    g.add_conditional_edges("planner", route, {"memory":"memory","safety":"safety"})
    g.add_edge("memory","analyst"); g.add_edge("analyst","injury_risk")
    g.add_edge("injury_risk","coaching"); g.add_edge("coaching","reporter")
    g.add_edge("reporter","safety"); g.add_edge("safety", END)
    return g.compile()

def run_hexai_agents(session_id, athlete_id, athlete_profile, pose_metrics):
    trace = lf.trace(name="hexai", session_id=session_id)
    state = {"session_id":session_id,"athlete_id":athlete_id,
             "athlete_profile":athlete_profile,"pose_metrics":pose_metrics,
             "risk_level":"green","movement_issues":[],"bio_analysis":[],
             "risk_score":0.0,"drills":[],"safety_rules":[],"cues":[],
             "plan":{},"past_sessions":[],"report":{},"safety_note":None,"log":[]}
    result = build_graph().invoke(state)
    trace.update(output=result['report'])
    return result['report']