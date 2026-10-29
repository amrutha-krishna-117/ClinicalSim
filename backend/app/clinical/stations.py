"""
Guided examination stations (OSCE-style): General, Arterial pulse, Respiratory, Cardiovascular.
Progress is DERIVED from what the student really did (examinations, measurements, words said, hand hygiene),
so there is nothing extra to store and it can never get out of step with the session.
"""
import re
from app.clinical.measurements import VITAL_REGION


def talk(id, title, how, patterns, say):
    return dict(kind="talk", id=id, title=title, how=how, patterns=patterns, say=say, critical=True)


def ex(id, title, how, any_of, instrument=None, critical=True, tip=None):
    return dict(kind="exam", id=id, title=title, how=how, any_of=[list(a) for a in any_of],
                instrument=instrument, critical=critical, tip=tip)


def me(id, title, how, vital, instrument=None, site=None):
    return dict(kind="measure", id=id, title=title, how=how, vital=vital, instrument=instrument, site=site, critical=True)


HYGIENE = dict(kind="action", id="hygiene", title="Wash your hands", how="Hand hygiene before touching the patient.",
               action="hand_hygiene", critical=True)

PREP = [
    talk("intro", "Introduce yourself", "Say who you are and your role. Use the History tab (voice or keyboard).",
         [r"\b(i'?m|i am|my name is|this is)\b.{0,25}\b(dr|doctor|medical student|student)\b", r"\bintroduc"],
         "Hello, I'm Dr Smith, one of the doctors looking after you today."),
    talk("verify_name", "Confirm the patient's name", "Ask the patient to say their full name.",
         [r"your (full |first |last )?name", r"confirm.{0,20}name", r"who am i (speaking|talking)"],
         "Can you please confirm your full name?"),
    talk("verify_dob", "Confirm date of birth", "Ask for the date of birth (or age).",
         [r"date of birth|\bd\.?o\.?b\b|birthday", r"how old|your age"], "And can you tell me your date of birth?"),
    talk("consent", "Explain and gain consent", "Explain what you will do and ask permission.",
         [r"consent|permission", r"\b(okay|ok|alright|fine) (if|to)\b", r"\bis that (okay|ok|alright|fine)\b",
          r"\b(may|can|could) i (examine|check|take|look|listen|feel|measure)", r"\bi('| wi)ll (explain|examine|check|be examining)", r"going to (examine|check|listen)"],
         "I'd like to examine you. I'll explain each step. Is that okay?"),
    HYGIENE,
]

STEPS_GENERAL = PREP + [
    ex("hands", "Inspect the hands", "Nails, palmar creases, colour, tremor, clubbing.", [("hands", "inspect"), ("nails", "inspect"), ("clubbing", "inspect")]),
    me("pulse_rate", "Radial pulse rate", "Feel the radial pulse and count for 15, 30 or 60 seconds.", "pulse_rate"),
    me("resp_rate", "Respiratory rate", "Count breaths without telling the patient (30 to 60 seconds).", "respiratory_rate"),
    ex("eyes", "Eyes", "Pull down the lower lid for pallor; look at the sclerae for jaundice.", [("eyes", "inspect"), ("pallor", "inspect"), ("jaundice", "inspect")], tip="A pen torch helps."),
    ex("teeth", "Teeth and gums", "Dentition, gums, breath.", [("teeth", "inspect")], tip="Use a tongue depressor or pen torch."),
    ex("tongue", "Tongue", "Central cyanosis, hydration, coating, deviation.", [("tongue", "inspect")], tip="Ask the patient to open wide and put the tongue out."),
    me("bp", "Blood pressure", "Cuff on the upper arm, then measure.", "blood_pressure", ["bp_cuff"]),
    me("temp", "Temperature", "Measure with the thermometer.", "temperature", ["thermometer"]),
    me("spo2", "Oxygen saturation", "Pulse oximeter on a finger.", "oxygen_saturation", ["pulse_oximeter"]),
    ex("neck_inspect", "Inspect the neck", "Lumps, bumps, swelling, scars, JVP.", [("neck", "inspect")]),
    ex("neck_nodes", "Palpate the lymph nodes", "Feel the cervical chains from behind.", [("lymph_nodes", "palpate"), ("neck", "palpate")]),
    ex("thyroid", "Thyroid", "Inspect and palpate; ask the patient to swallow.", [("thyroid", "palpate"), ("thyroid", "inspect")], critical=False),
    ex("chest", "Inspect the chest", "Shape, symmetry, breathing pattern, scars.", [("chest", "inspect")]),
    ex("leg_swelling", "Legs: look for swelling", "Compare both legs and ankles.", [("legs", "inspect"), ("edema", "inspect"), ("ankles", "inspect")]),
    ex("pitting", "Legs: press for pitting oedema", "Press for 5 seconds over the shin and ankle.", [("edema", "palpate"), ("legs", "palpate"), ("ankles", "palpate")]),
    ex("leg_pulses", "Leg pulses", "Feel the foot pulses on both sides.", [("foot_pulses", "palpate"), ("popliteal_pulse", "palpate"), ("femoral_pulse", "palpate")]),
]

STEPS_PULSE = PREP + [
    me("pulse_rate", "Radial pulse: rate", "Count for 15, 30 or 60 seconds. Count 60 s if irregular.", "pulse_rate"),
    ex("radial", "Radial pulse: rhythm, volume, character", "Feel with two or three fingers.", [("radial_pulse", "palpate")]),
    ex("radioradial", "Radio-radial delay", "Feel both radial pulses together.", [("radioradial_delay", "assess")]),
    ex("collapsing", "Collapsing pulse", "Raise the arm and feel for the water-hammer pulse.", [("collapsing_pulse", "assess")]),
    ex("brachial", "Brachial pulse", "Feel the volume and character.", [("brachial_pulse", "palpate")]),
    ex("carotid", "Carotid pulse", "Feel one side at a time, never both together.", [("carotid", "palpate")]),
    ex("carotid_bruit", "Listen for carotid bruits", "Ask the patient to hold their breath.", [("carotid", "auscultate")], ["stethoscope"]),
    me("bp", "Blood pressure", "Measure with the BP cuff.", "blood_pressure", ["bp_cuff"]),
    ex("radiofemoral", "Radio-femoral delay", "Feel the radial and femoral pulses together.", [("radiofemoral_delay", "assess")]),
    ex("femoral", "Femoral pulses", "Palpate both groins.", [("femoral_pulse", "palpate")]),
    ex("femoral_bruit", "Listen for femoral bruits", "Over each femoral artery.", [("femoral_pulse", "auscultate")], ["stethoscope"], critical=False),
    ex("popliteal", "Popliteal pulses", "Palpate behind both knees.", [("popliteal_pulse", "palpate")]),
    ex("foot", "Foot pulses", "Dorsalis pedis and posterior tibial on both feet.", [("foot_pulses", "palpate")]),
    ex("cap_refill", "Capillary refill", "Press and release a nail bed.", [("capillary_refill", "assess")], critical=False),
]

STEPS_RESP = PREP + [
    ex("general", "General inspection", "Breathing pattern, accessory muscles, cyanosis, cough, sputum pot.", [("general", "inspect")]),
    ex("hands", "Hands", "Clubbing, tar staining, CO2-retention flap.", [("hands", "inspect"), ("clubbing", "inspect"), ("nails", "inspect")]),
    me("pulse_rate", "Pulse rate", "Count the radial pulse.", "pulse_rate"),
    me("resp_rate", "Respiratory rate", "Count breaths for 30 to 60 seconds.", "respiratory_rate"),
    me("spo2", "Oxygen saturation", "Pulse oximeter on a finger.", "oxygen_saturation", ["pulse_oximeter"]),
    ex("tongue", "Tongue: central cyanosis", "Look under the tongue.", [("tongue", "inspect"), ("cyanosis", "inspect")]),
    ex("trachea", "Trachea", "Is it central? Feel with one finger in the suprasternal notch.", [("trachea", "palpate")]),
    ex("nodes", "Cervical lymph nodes", "Palpate from behind.", [("lymph_nodes", "palpate")], critical=False),
    ex("chest_inspect", "Inspect the chest", "Shape, symmetry, scars, movement.", [("chest", "inspect")]),
    ex("expansion", "Chest expansion and fremitus", "Hands on the chest wall; feel expansion.", [("chest", "palpate"), ("lungs", "palpate")]),
    ex("percuss_front", "Percuss the front", "Compare sides; upper, middle and lower zones.", [("chest", "percuss"), ("lungs", "percuss")]),
    ex("percuss_back", "Percuss the back", "Sit the patient forward.", [("posterior_chest", "percuss")]),
    ex("ausc_front", "Auscultate the front", "Breath sounds and added sounds.", [("chest", "auscultate"), ("lungs", "auscultate")], ["stethoscope"]),
    ex("ausc_back", "Auscultate the back", "Compare sides at each level.", [("posterior_chest", "auscultate")], ["stethoscope"]),
    ex("oedema", "Peripheral oedema", "Look at the ankles and legs.", [("edema", "inspect"), ("legs", "inspect"), ("ankles", "inspect")], critical=False),
]

STEPS_CVS = PREP + [
    ex("general", "General inspection", "Colour, breathlessness, cyanosis, scars.", [("general", "inspect")]),
    ex("hands", "Hands", "Clubbing, splinter haemorrhages, capillary refill, temperature.", [("hands", "inspect"), ("clubbing", "inspect"), ("nails", "inspect")]),
    me("pulse_rate", "Radial pulse: rate", "Count the pulse.", "pulse_rate"),
    ex("radial", "Radial pulse: rhythm and character", "Feel rhythm, volume and character.", [("radial_pulse", "palpate")]),
    me("bp", "Blood pressure", "Measure with the BP cuff.", "blood_pressure", ["bp_cuff"]),
    ex("jvp", "JVP", "Patient at 45 degrees, head turned slightly left.", [("jvp", "inspect")]),
    ex("carotid", "Carotid pulse", "Character and volume, one side at a time.", [("carotid", "palpate")]),
    ex("precordium_inspect", "Inspect the precordium", "Scars, deformity, visible pulsation.", [("precordium", "inspect")]),
    ex("apex", "Palpate the apex beat", "Position, character; heaves and thrills.", [("apex_beat", "palpate"), ("precordium", "palpate")]),
    ex("aortic", "Auscultate: aortic area", "2nd right intercostal space.", [("aortic", "auscultate")], ["stethoscope"]),
    ex("pulmonary", "Auscultate: pulmonary area", "2nd left intercostal space.", [("pulmonary", "auscultate")], ["stethoscope"]),
    ex("tricuspid", "Auscultate: tricuspid area", "Left lower sternal edge.", [("tricuspid", "auscultate")], ["stethoscope"]),
    ex("mitral", "Auscultate: mitral area", "At the apex.", [("mitral", "auscultate")], ["stethoscope"]),
    ex("carotid_bruit", "Listen for carotid bruits", "Ask the patient to hold their breath.", [("carotid", "auscultate")], ["stethoscope"]),
    ex("lung_bases", "Listen to the lung bases", "Crackles of heart failure.", [("posterior_chest", "auscultate")], ["stethoscope"]),
    ex("oedema", "Ankle and sacral oedema", "Press for 5 seconds.", [("edema", "palpate"), ("legs", "palpate"), ("ankles", "palpate")]),
    ex("foot_pulses", "Peripheral pulses", "Feel the foot pulses.", [("foot_pulses", "palpate")], critical=False),
]

STATIONS = [
    dict(id="general", title="General examination", steps=STEPS_GENERAL,
         summary="Introduction and identification, hands, pulse, breathing, eyes, teeth, tongue, BP, temperature, SpO2, neck, chest and legs."),
    dict(id="pulse", title="Arterial pulse examination", steps=STEPS_PULSE,
         summary="Radial, brachial, carotid, femoral, popliteal and foot pulses, delays, bruits and perfusion."),
    dict(id="respiratory", title="Respiratory examination", steps=STEPS_RESP,
         summary="Inspection, hands, rate, SpO2, trachea, expansion, percussion and auscultation front and back."),
    dict(id="cardiovascular", title="Cardiovascular examination", steps=STEPS_CVS,
         summary="Hands, pulse, BP, JVP, precordium, four valve areas, carotids, lung bases and oedema."),
]


def _entries(session) -> list[dict]:
    return list(session.examinations_performed or [])


def _step_status(step: dict, entries: list[dict], said: list[str], actions: set[str]) -> dict:
    done, note = False, ""
    kind = step["kind"]
    if kind == "talk":
        done = any(re.search(p, m, re.I) for p in step["patterns"] for m in said)
    elif kind == "action":
        done = step["action"] in actions
    elif kind == "measure":
        region = VITAL_REGION[step["vital"]]
        hits = [e for e in entries if e.get("region") == region and e.get("method") == "measure"]
        if step.get("site"):
            hits = [e for e in hits if e.get("site") == step["site"]]
        done = any(e.get("adequate", True) for e in hits)
        if hits and not done:
            note = "Counted for too short a time. Repeat for longer."
    else:
        wanted = {tuple(a) for a in step["any_of"]}
        hits = [e for e in entries if (e.get("region"), e.get("method")) in wanted]
        need = step.get("instrument")
        if hits and need:
            done = any(e.get("instrument") in need for e in hits)
            if not done:
                note = f"Examined without the right instrument. Use the {need[0].replace('_', ' ')}."
        else:
            done = bool(hits)
    return {"id": step["id"], "title": step["title"], "how": step["how"], "kind": kind, "done": done, "note": note,
            "critical": step.get("critical", True), "instrument": step.get("instrument"), "tip": step.get("tip"),
            "say": step.get("say"), "vital": step.get("vital"), "site": step.get("site"), "action": step.get("action"),
            "targets": step.get("any_of")}


def evaluate(session, said: list[str], actions: set[str]) -> list[dict]:
    entries = _entries(session)
    out = []
    for st in STATIONS:
        steps = [_step_status(s, entries, said, actions) for s in st["steps"]]
        done = sum(1 for s in steps if s["done"])
        out.append({"id": st["id"], "title": st["title"], "summary": st["summary"], "steps": steps,
                    "done": done, "total": len(steps), "percent": round(100 * done / len(steps))})
    return out


def summary(session, said: list[str], actions: set[str]) -> list[dict]:
    """Compact version for the assessment report: only stations the student started."""
    res = []
    for st in evaluate(session, said, actions):
        if st["done"] == 0:
            continue
        res.append({"id": st["id"], "title": st["title"], "done": st["done"], "total": st["total"], "percent": st["percent"],
                    "missed": [s["title"] for s in st["steps"] if not s["done"] and s["critical"]]})
    return res
