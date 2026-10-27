"""
Run:  cd backend && python tests/test_voice_conversations.py
Checks the spoken doctor<->patient conversation end to end through the real API.
"""
import sys, re, os, datetime
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from fastapi.testclient import TestClient
from app.main import app
from app.core.database import SessionLocal
from app.models import ConversationMessage

c = TestClient(app)
tok = c.post("/api/auth/login", json={"email": "student@example.com", "password": "student123"}).json()["access_token"]
H = {"Authorization": f"Bearer {tok}"}
SC = {s["title"]: s["id"] for s in c.get("/api/scenarios", headers=H).json()}
BAD = re.compile(r"not sure what you mean|don't follow|catch that|ask that again|ask again|say that again|put that differently", re.I)
failures = []

def new_session(title):
    return c.post("/api/sessions", json={"scenario_id": SC[title]}, headers=H).json()["id"]

def say(sid, text, stage="general"):
    r = c.post(f"/api/sessions/{sid}/conversation", json={"message": text, "stage": stage}, headers=H)
    assert r.status_code == 200, (text, r.text)
    return r.json()["patient_response"]

def check(name, ok, detail=""):
    print(("PASS  " if ok else "FAIL  ") + name + (f"  -> {detail}" if detail and not ok else ""))
    if not ok: failures.append(name)

# 1. every message is stored and returned, in the order it was said -------------------------------
sid = new_session("Acute Coronary Syndrome")
say(sid, "[START_CONSULTATION]", "greeting")
say(sid, "[START_CONSULTATION]", "greeting")            # page reload / double effect must not duplicate the opening
qs = [f"Question number {i}" for i in range(1, 26)]
for q in qs: say(sid, q)
msgs = c.get(f"/api/sessions/{sid}/messages", headers=H).json()
student = [m["content"] for m in msgs if m["role"] == "student"]
check("opening line is not duplicated", sum(1 for m in msgs if m["stage"] == "greeting" and m["role"] == "patient") == 1)
check("all 25 doctor questions are stored, none lost", student == qs, f"{len(student)} stored")
check("every question has exactly one patient reply", len(msgs) == 1 + 25 * 2, f"{len(msgs)} messages")
roles = [m["role"] for m in msgs]
check("conversation strictly alternates doctor/patient", roles[1:] == ["student", "patient"] * 25)

# 2. API sorts by TIME, not by whatever order the database happens to return rows ------------------
#    Prove it: give the rows timestamps in the REVERSE of insertion order; the API must return them reversed.
db = SessionLocal()
rows = db.query(ConversationMessage).filter(ConversationMessage.session_id == sid).all()
base = datetime.datetime(2026, 1, 1, tzinfo=datetime.timezone.utc)
insertion = {m["id"]: i for i, m in enumerate(msgs)}
n = len(msgs)
for r in rows:
    r.created_at = base + datetime.timedelta(seconds=(n - 1 - insertion[r.id]))
db.commit(); db.close()
again = c.get(f"/api/sessions/{sid}/messages", headers=H).json()
check("GET /messages is sorted by timestamp (reversed-time test)", [m["id"] for m in again] == [m["id"] for m in reversed(msgs)])

# 3. everyday questions get an answer in character ------------------------------------------------
everyday = ["Do you feel okay?", "Have you had any injuries?", "How is your sleep?", "How is your mood?", "Any recent travel?",
            "Any trouble swallowing?", "Is it okay if I take your blood pressure?", "Do you have back pain?", "Any problems with your stomach?",
            "Do you exercise?", "Are you up to date with vaccinations?"]
unanswered = []
for title in SC:
    sid = new_session(title)
    for q in everyday:
        a = say(sid, q)
        if BAD.search(a): unanswered.append((title, q, a))
check(f"30 scenarios x {len(everyday)} everyday questions all answered", not unanswered, str(unanswered[:3]))

# 4. targeted correctness --------------------------------------------------------------------------
T = [
 ("Normal Adult General Examination", "Is it okay if I take your blood pressure?", "go ahead", "nothing like that"),
 ("Acute Coronary Syndrome", "Do you have back pain?", "my back", "crushing"),
 ("Acute Coronary Syndrome", "Does it go into your arm?", "left arm", None),
 ("Urinary Tract Infection / Pyelonephritis", "Do you have back pain?", "back", "my back's been fine"),
 ("Acute Appendicitis", "Any problems with your stomach?", "right", "healthy"),
 ("Acute Appendicitis", "Do you have any chest pain?", "no", None),
 ("Normal Adult General Examination", "Do you exercise?", "three times", "smoke"),
 ("Diabetic Ketoacidosis", "How long has this been going on?", "twelve hours", "diabetes for years"),
 ("Acute Heart Failure / Pulmonary Oedema", "Do you drink alcohol?", None, "drinking more than"),
 ("Upper GI Bleeding", "Do you have high blood pressure?", "blood pressure", "coffee"),
 ("Deep Vein Thrombosis", "Are you short of breath, or any chest pain?", "no", None),
 ("Acute Asthma Exacerbation", "Does anything set it off?", "cat at home", None),
 ("Acute Asthma Exacerbation", "What medicines do you use?", "salbutamol inhaler", "mdi"),
 ("Hyperthyroidism", "How much weight have you lost?", "eight kilos", None),
 ("Pneumothorax", "Did you injure your chest or have any accident?", "no", None),
 ("Migraine", "What medications are you on?", "contraceptive pill", "ocp"),
 ("Normal Adult General Examination", "Are you pregnant?", "man", None),
]
for title, q, must, mustnot in T:
    a = say(new_session(title), q).lower()
    check(f"[{title[:26]}] {q}", (must is None or must in a) and (mustnot is None or mustnot not in a), a)

# 5. spoken sweep: no 'did not understand' on core history questions, and every patient is different ---
core = ["Hello, I'm Dr Smith, what brings you in today?", "How long has this been going on?", "Can you describe the problem for me?",
        "On a scale of one to ten how bad is it?", "Does anything make it better or worse?", "Do you have any medical problems?",
        "What medications do you take?", "Do you have any allergies?", "Is there any illness in your family?", "Do you smoke or drink?",
        "What do you do for work?", "Have you had a fever?", "What worries you most?", "I'd like to examine you now."]
bad, openings = [], set()
for title in SC:
    sid = new_session(title)
    openings.add(say(sid, "[START_CONSULTATION]", "greeting"))
    for q in core:
        a = say(sid, q)
        if BAD.search(a): bad.append((title, q))
check(f"30 scenarios x {len(core)} core questions: none misunderstood", not bad, str(bad[:3]))
check("every patient opens differently (30/30)", len(openings) == 30, str(len(openings)))

print(f"\n{'ALL PASSED' if not failures else str(len(failures)) + ' FAILED: ' + ', '.join(failures)}")
sys.exit(1 if failures else 0)
