"""
HEXAi Vector Store
Voyage AI embeddings → Pinecone → Cohere reranking
"""
import os, json, cohere, voyageai
from pinecone import Pinecone, ServerlessSpec
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

voyage  = voyageai.Client(api_key=os.getenv("VOYAGE_API_KEY"))
co      = cohere.Client(os.getenv("COHERE_API_KEY"))
pc      = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
IDX     = os.getenv("PINECONE_INDEX_NAME", "hexai-knowledge")

def get_index():
    if IDX not in [i.name for i in pc.list_indexes()]:
        pc.create_index(IDX, dimension=1024, metric="cosine",
                        spec=ServerlessSpec(cloud="aws", region="us-east-1"))
    return pc.Index(IDX)

def embed(texts, input_type="document"):
    return voyage.embed(texts=texts, model="voyage-3", input_type=input_type).embeddings

def load_knowledge_base():
    idx = get_index()
    print("Loading knowledge base into Pinecone...")

    dp = Path("../knowledge_base/drills/exercises.json")
    if dp.exists():
        drills = json.loads(dp.read_text())
        texts, ids, metas = [], [], []
        for d in drills:
            t = f"Exercise: {d['name']}\nSport: {d['sport']}\nTargets: {','.join(d['targets'])}\nDescription: {d['description']}\nCues: {','.join(d['coaching_cues'])}\nSafe for: {','.join(d['injury_safe_for'])}"
            texts.append(t); ids.append(f"drill_{d['id']}")
            metas.append({"type":"drill","name":d['name'],"sport":d['sport'],
                          "difficulty":d['difficulty'],"targets":",".join(d['targets']),
                          "injury_safe_for":",".join(d['injury_safe_for']),"full_text":t})
        embs = embed(texts)
        idx.upsert(vectors=[{"id":ids[i],"values":embs[i],"metadata":metas[i]} for i in range(len(texts))], namespace="drills")
        print(f"✅ {len(drills)} drills loaded")

    rp = Path("../knowledge_base/safety_rules/rules.json")
    if rp.exists():
        rules = json.loads(rp.read_text())
        texts, ids, metas = [], [], []
        for r in rules:
            t = f"Trigger: {r['trigger']}. {r['message']} {r['clinical_note']}"
            texts.append(t); ids.append(f"rule_{r['id']}")
            metas.append({"type":"rule","trigger":r['trigger'],"level":r['level'],"full_text":t})
        embs = embed(texts)
        idx.upsert(vectors=[{"id":ids[i],"values":embs[i],"metadata":metas[i]} for i in range(len(texts))], namespace="safety")
        print(f"✅ {len(rules)} safety rules loaded")

def search(query, namespace="drills", sport=None, top_k=10):
    idx = get_index()
    qe  = embed([query], "query")[0]
    f   = {"sport":{"$in":[sport,"general"]}} if sport and sport!="general" else None
    res = idx.query(vector=qe, top_k=top_k, namespace=namespace, filter=f, include_metadata=True)
    return [{"id":m.id,"score":m.score,"metadata":m.metadata,"text":m.metadata.get("full_text","")} for m in res.matches]

def rerank(query, candidates, top_n=3):
    if not candidates: return []
    r = co.rerank(query=query, documents=[c['text'] for c in candidates],
                  top_n=top_n, model="rerank-english-v3.0", return_documents=True)
    return [{**candidates[x.index], "rerank_score": x.relevance_score} for x in r.results]

def get_best_drills(query, sport=None, top_n=3):
    return rerank(query, search(query, "drills", sport), top_n)

def get_safety_rules(issues):
    q = f"safety rules for: {', '.join(issues)}"
    return rerank(q, search(q, "safety"), top_n=2)

def store_session(session_id, athlete_id, summary):
    idx = get_index()
    e   = embed([summary])[0]
    idx.upsert(vectors=[{"id":f"sess_{session_id}","values":e,
               "metadata":{"athlete_id":athlete_id,"session_id":session_id,"summary":summary}}],
               namespace="sessions")

def find_similar(athlete_id, summary, top_k=3):
    idx = get_index()
    e   = embed([summary], "query")[0]
    res = idx.query(vector=e, top_k=top_k+1, namespace="sessions",
                    filter={"athlete_id":athlete_id}, include_metadata=True)
    return [{"summary":m.metadata.get("summary"),"score":m.score} for m in res.matches][:top_k]