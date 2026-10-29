"""
Run:  cd backend && python tests/test_exam_stations.py
Guided examination stations, instrument-based measurements and case-consistent findings.
"""
import sys, os, types
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from fastapi.testclient import TestClient
from app.main import app
from app.clinical.stations import STATIONS
from app.clinical.engine import REGION_METHODS, ALIASES, clinical_engine
from app.clinical.instrument_validation import VALID_COMBINATIONS
from app.core.database import SessionLocal
from app.models import Scenario

c = TestClient(app)
H = {"Authorization": "Bearer " + c.post("/api/auth/login", json={"email": "student@example.com", "password": "student123"}).json()["access_token"]}
SC = {s["title"]: s["id"] for s in c.get("/api/scenarios", headers=H).json()}
failures = []

def check(name, ok, detail=""):
    print(("PASS  " if ok else "FAIL  ") + name + (f"  -> {detail}" if not ok and detail else ""))
    if not ok: failures.append(name)

def new(title): return c.post("/api/sessions", json={"scenario_id": SC[title]}, headers=H).json()["id"]
def post(sid, path, body): return c.post(f"/api/sessions/{sid}/{path}", json=body, headers=H)
def say(sid, t): return post(sid, "conversation", {"message": t, "stage": "general"})
def stations(sid): return {s["id"]: s for s in c.get(f"/api/sessions/{sid}/stations", headers=H).json()}
def done(sid, station): return {x["id"] for x in stations(sid)[station]["steps"] if x["done"]}

# 1. the four stations exist and start empty ----------------------------------------------------------------
sid = new("Normal Adult General Examination")
st = stations(sid)
check("four stations returned", set(st) == {"general", "pulse", "respiratory", "cardiovascular"})
check("nothing is done at the start", all(s["done"] == 0 for s in st.values()))

# 2. station definitions are internally consistent ------------------------------------------------------------
bad = []
for station in STATIONS:
    ids = [s["id"] for s in station["steps"]]
    if len(ids) != len(set(ids)): bad.append((station["id"], "duplicate step ids"))
    for s in station["steps"]:
        for region, method in s.get("any_of", []):
            if method not in REGION_METHODS.get(region, ["inspect"]): bad.append((station["id"], s["id"], region, method))
            if s.get("instrument") and (region, method) not in VALID_COMBINATIONS: bad.append((station["id"], s["id"], "instrument rule missing", region, method))
check("every step uses a valid region/method (and instrument rule)", not bad, str(bad[:3]))

# 3. every step's finding resolves for all 30 scenarios ------------------------------------------------------
db = SessionLocal(); rows = db.query(Scenario).all(); missing = []
for sc in rows:
    for station in STATIONS:
        for s in station["steps"]:
            for region, method in s.get("any_of", []):
                f = clinical_engine.get_examination_finding(sc, region, method)
                if not f.get("finding") or not f.get("description") or "within normal limits" in f["finding"] and region in ("hands", "teeth", "neck", "thyroid", "trachea", "radial_pulse", "foot_pulses"):
                    missing.append((sc.title, region, method))
check(f"all station findings resolve for all {len(rows)} scenarios (no generic placeholders)", not missing, str(missing[:3]))

# 4. instruments and technique are enforced -------------------------------------------------------------------
sid = new("Acute Coronary Syndrome")
r = post(sid, "measure", {"vital": "blood_pressure", "instrument": "thermometer", "site": "right_arm"})
check("BP with the wrong instrument is refused with a teaching message", r.status_code == 400 and "BP cuff" in r.json()["detail"], r.text)
r = post(sid, "measure", {"vital": "blood_pressure", "instrument": "bp_cuff"})
check("BP without choosing an arm is refused", r.status_code == 400 and "arm" in r.json()["detail"].lower(), r.text)
r = post(sid, "measure", {"vital": "blood_pressure", "instrument": "bp_cuff", "site": "right_arm"}).json()
check("BP value comes from the case (158/95)", r["value"] == "158/95" and "right arm" in r["display"], str(r))
check("temperature needs the thermometer", post(sid, "measure", {"vital": "temperature", "instrument": "bp_cuff"}).status_code == 400)
t_tym = post(sid, "measure", {"vital": "temperature", "instrument": "thermometer", "site": "tympanic"}).json()["value"]
t_ax = post(sid, "measure", {"vital": "temperature", "instrument": "thermometer", "site": "axilla"}).json()["value"]
check("axillary temperature reads 0.4 lower than tympanic", round(t_tym - t_ax, 1) == 0.4, f"{t_tym} vs {t_ax}")
check("SpO2 from the pulse oximeter matches the case (95%)", post(sid, "measure", {"vital": "oxygen_saturation", "instrument": "pulse_oximeter"}).json()["value"] == 95)
check("SpO2 with the wrong instrument is refused", post(sid, "measure", {"vital": "oxygen_saturation", "instrument": "thermometer"}).status_code == 400)
check("pulse needs a counting time", post(sid, "measure", {"vital": "pulse_rate", "seconds": 7}).status_code == 400)
p15 = post(sid, "measure", {"vital": "pulse_rate", "seconds": 15}).json()
check("regular pulse counted for 15 s is accepted (about 102/min)", p15["adequate"] and abs(p15["value"] - 102) <= 4, str(p15))
check("breaths counted for 15 s are not adequate", post(sid, "measure", {"vital": "respiratory_rate", "seconds": 15}).json()["adequate"] is False)
check("breaths counted for 30 s are adequate (about 22/min)", post(sid, "measure", {"vital": "respiratory_rate", "seconds": 30}).json()["value"] in (22,))

sid_af = new("Acute Ischaemic Stroke")
short = post(sid_af, "measure", {"vital": "pulse_rate", "seconds": 15}).json()
check("irregular (AF) pulse counted for 15 s is flagged inadequate", short["adequate"] is False and "60" in short["note"], str(short))
check("...so the station step stays undone", "pulse_rate" not in done(sid_af, "pulse"))
post(sid_af, "measure", {"vital": "pulse_rate", "seconds": 60})
check("...and is completed by a full-minute count", "pulse_rate" in done(sid_af, "pulse"))

# 5. checklist follows what the student actually does ---------------------------------------------------------
sid = new("Normal Adult General Examination")
prev = stations(sid)["general"]["done"]
say(sid, "Hello, I'm Dr Smith, one of the doctors looking after you today.")
check("introduction is detected from what was said", "intro" in done(sid, "general"))
say(sid, "Can you please confirm your full name?"); say(sid, "And what is your date of birth?")
check("name and date of birth checks are detected", {"verify_name", "verify_dob"} <= done(sid, "general"))
say(sid, "I'd like to examine you now, is that okay?")
check("consent is detected", "consent" in done(sid, "general"))
check("hand hygiene is not done until performed", "hygiene" not in done(sid, "general"))
post(sid, "action", {"action": "hand_hygiene"})
check("hand hygiene recorded", "hygiene" in done(sid, "general"))
check("unknown actions are rejected", post(sid, "action", {"action": "fly"}).status_code == 400)

post(sid, "examination", {"region": "hands", "method": "inspect"})
check("examining the hands ticks the hands step", "hands" in done(sid, "general"))
post(sid, "examination", {"region": "aortic", "method": "auscultate"})
check("listening WITHOUT a stethoscope does not tick the auscultation step", "aortic" not in done(sid, "cardiovascular"))
note = [x for x in stations(sid)["cardiovascular"]["steps"] if x["id"] == "aortic"][0]["note"]
check("...and the student is told why", "stethoscope" in note, note)
post(sid, "examination", {"region": "aortic", "method": "auscultate", "instrument": "stethoscope"})
check("repeating it WITH the stethoscope earns the credit", "aortic" in done(sid, "cardiovascular"))
check("a wrong instrument for a region is refused", post(sid, "examination", {"region": "mitral", "method": "auscultate", "instrument": "thermometer"}).status_code == 400)

for site in ("right_arm", "left_arm"): post(sid, "measure", {"vital": "blood_pressure", "instrument": "bp_cuff", "site": site})
check("BP ticks in every station that asks for it", all("bp" in done(sid, s) for s in ("general", "pulse", "cardiovascular")))
before = stations(sid)["general"]["percent"]
post(sid, "measure", {"vital": "temperature", "instrument": "thermometer"})
check("progress percentage rises as steps are completed", stations(sid)["general"]["percent"] > before)

# complete the whole general station and reach 100%
for region, method in [("nails", "inspect"), ("eyes", "inspect"), ("teeth", "inspect"), ("tongue", "inspect"), ("lymph_nodes", "palpate"),
                       ("neck", "inspect"), ("chest", "inspect"), ("legs", "inspect"), ("edema", "palpate"), ("foot_pulses", "palpate"), ("thyroid", "palpate")]:
    post(sid, "examination", {"region": region, "method": method})
post(sid, "measure", {"vital": "pulse_rate", "seconds": 30}); post(sid, "measure", {"vital": "respiratory_rate", "seconds": 60})
post(sid, "measure", {"vital": "oxygen_saturation", "instrument": "pulse_oximeter"})
g = stations(sid)["general"]
check("completing every step gives 100%", g["percent"] == 100, f"{g['done']}/{g['total']} missing: {[s['id'] for s in g['steps'] if not s['done']]}")

# 6. the report carries the checklists --------------------------------------------------------------------------
post(sid, "diagnosis", {"primary_diagnosis": "Normal", "differentials": [], "confidence": 80, "reasoning": "Normal exam"})
post(sid, "complete", {})
chk = c.get(f"/api/sessions/{sid}/assessment", headers=H).json()["debriefing"].get("exam_checklists")
gen = next((s for s in chk if s["id"] == "general"), None)
check("assessment includes exam checklists for started stations", gen is not None and gen["percent"] == 100, str(chk)[:200])
check("stations never started are left out of the report", all(s["id"] != "pulse" or s["done"] > 0 for s in chk))

# 7. clinical content matches each case --------------------------------------------------------------------------
def finding(title, region, method): return c.post(f"/api/sessions/{new(title)}/examination", json={"region": region, "method": method}, headers=H).json()
check("aortic stenosis: slow-rising pulse", "slow-rising" in finding("Aortic Stenosis", "radial_pulse", "palpate")["finding"])
check("aortic stenosis: murmur radiates to carotids", "carotid" in finding("Aortic Stenosis", "carotid", "auscultate")["finding"].lower())
check("stroke: irregularly irregular pulse", "irregularly irregular" in finding("Acute Ischaemic Stroke", "radial_pulse", "palpate")["finding"])
check("PAD: right foot pulses absent", "absent" in finding("Peripheral Arterial Disease", "foot_pulses", "palpate")["finding"])
check("hyperthyroidism: goitre", "goitre" in finding("Hyperthyroidism", "thyroid", "palpate")["finding"].lower())
check("meningitis: neck stiffness", "stiff" in finding("Bacterial Meningitis", "neck", "assess")["finding"].lower())
check("normal patient: normal pulse and hands", not finding("Normal Adult General Examination", "radial_pulse", "palpate")["is_abnormal"] and not finding("Normal Adult General Examination", "hands", "inspect")["is_abnormal"])
pn = {m: finding("Community-Acquired Pneumonia", r, "auscultate")["finding"] for m, r in (("chest", "chest"), ("lungs", "lungs"), ("back", "posterior_chest"))}
check("pneumonia: crackles heard at chest, lungs AND back (no longer 'normal')", len({v for v in pn.values()}) == 1 and "crepitations" in pn["lungs"], str(pn))

# 8. examining the lungs counts toward the expected 'chest' examination --------------------------------------------
pneu = next(s for s in rows if s.title.startswith("Community-Acquired"))
fake = types.SimpleNamespace(examinations_performed=[{"region": "lungs", "method": "auscultate"}], findings_revealed=[])
score, detail = clinical_engine._score_examination_detailed(fake, pneu)
check("lungs.auscultate earns credit for the expected chest exam", "chest" in detail.get("correct", []), str(detail))

print(f"\n{'ALL PASSED' if not failures else str(len(failures)) + ' FAILED: ' + '; '.join(failures)}")
sys.exit(1 if failures else 0)
