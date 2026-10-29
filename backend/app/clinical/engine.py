"""
Deterministic clinical simulation engine.
AI is NEVER the source of truth.
All findings, scores, and states are driven by scenario data.
"""
from typing import Optional
from sqlalchemy.orm.attributes import flag_modified
from app.models import SimulationSession, Scenario, SessionStatus
from app.clinical import exam_profiles


# ─── Examination region → allowed methods mapping ─────────────────────
REGION_METHODS = {
    # General
    "general": ["inspect"],
    "pallor": ["inspect"],
    "jaundice": ["inspect"],
    "cyanosis": ["inspect"],
    "clubbing": ["inspect"],
    "lymph_nodes": ["palpate"],
    "edema": ["inspect", "palpate"],
    "nails": ["inspect"],
    "tongue": ["inspect"],
    "eyes": ["inspect"],
    "face": ["inspect"],
    # Vitals
    "temperature": ["measure"],
    "pulse": ["palpate", "measure"],
    "blood_pressure": ["measure"],
    "respiratory_rate": ["measure"],
    "oxygen_saturation": ["measure"],
    "gcs": ["assess"],
    "bmi": ["measure"],
    # Upper limbs
    "left_arm": ["inspect", "palpate"],
    "right_arm": ["inspect", "palpate", "measure"],
    "radial_pulse": ["palpate"],
    "carotid": ["palpate", "auscultate"],
    "jvp": ["inspect"],
    # Chest / Cardiovascular
    "chest": ["inspect", "palpate", "percuss", "auscultate"],
    "precordium": ["inspect", "palpate", "auscultate"],
    "apex_beat": ["palpate"],
    "heart_sounds": ["auscultate"],
    "aortic": ["auscultate"],
    "pulmonary": ["auscultate"],
    "tricuspid": ["auscultate"],
    "mitral": ["auscultate"],
    # Respiratory
    "lungs": ["inspect", "palpate", "percuss", "auscultate"],
    "posterior_chest": ["inspect", "palpate", "percuss", "auscultate"],
    # Abdomen
    "abdomen": ["inspect", "palpate", "percuss", "auscultate"],
    "liver": ["palpate", "percuss"],
    "spleen": ["palpate", "percuss"],
    "kidneys": ["palpate"],
    "ascites": ["palpate", "percuss"],
    # Lower limbs
    "legs": ["inspect", "palpate"],
    "ankles": ["inspect", "palpate"],
    "foot_pulses": ["palpate"],
    # Neurological
    "neurological": ["inspect", "assess"],
    "cranial_nerves": ["inspect", "assess"],
    "motor": ["inspect", "palpate", "assess"],
    "reflexes": ["assess"],
    "sensation": ["assess"],
    "coordination": ["assess"],
}

# Normal findings database — used when scenario doesn't specify otherwise
NORMAL_FINDINGS = {
    "pallor": {
        "inspect": {"finding": "No pallor", "description": "Conjunctivae pink and well perfused. Palmar creases pink. No pallor detected.", "is_abnormal": False, "clinical_significance": "No evidence of anaemia"}
    },
    "jaundice": {
        "inspect": {"finding": "No jaundice", "description": "Sclerae white and clear. No icterus detected. Skin colour normal.", "is_abnormal": False, "clinical_significance": "No evidence of hepatic disease or haemolysis"}
    },
    "cyanosis": {
        "inspect": {"finding": "No cyanosis", "description": "Lips and peripheries pink. No central or peripheral cyanosis detected.", "is_abnormal": False, "clinical_significance": "Adequate oxygenation"}
    },
    "clubbing": {
        "inspect": {"finding": "No clubbing", "description": "Nail beds normal. Lovibond angle preserved (<180°). No clubbing. Schamroth window present.", "is_abnormal": False, "clinical_significance": "No chronic cardiorespiratory, hepatic or GI disease suggested"}
    },
    "lymph_nodes": {
        "palpate": {"finding": "No lymphadenopathy", "description": "No palpable lymph nodes in cervical, axillary or inguinal chains bilaterally.", "is_abnormal": False, "clinical_significance": "No evidence of infection, lymphoma or malignancy"}
    },
    "edema": {
        "inspect": {"finding": "No peripheral oedema", "description": "No pitting oedema in ankles or legs bilaterally.", "is_abnormal": False, "clinical_significance": "No fluid overload or venous insufficiency"},
        "palpate": {"finding": "No pitting oedema on palpation", "description": "No pitting on 5-second pressure over medial malleolus bilaterally.", "is_abnormal": False, "clinical_significance": "Normal"}
    },
    "nails": {
        "inspect": {"finding": "Normal nails", "description": "No koilonychia, leukonychia, or onycholysis. No nail changes suggesting systemic disease.", "is_abnormal": False, "clinical_significance": "Normal nail examination"}
    },
    "tongue": {
        "inspect": {"finding": "Normal oral cavity", "description": "Tongue pink and moist. No glossitis, angular stomatitis, or ulcers. No central cyanosis.", "is_abnormal": False, "clinical_significance": "Normal"}
    },
    "eyes": {
        "inspect": {"finding": "Normal eye examination", "description": "Sclera white. Conjunctivae pink. No xanthelasma. No Kayser-Fleischer rings.", "is_abnormal": False, "clinical_significance": "Normal"}
    },
    "general": {
        "inspect": {"finding": "Well-appearing adult", "description": "Alert and oriented. No acute distress. Well-nourished and well-hydrated. No obvious dysmorphic features.", "is_abnormal": False, "clinical_significance": "Normal general appearance"}
    },
    "chest": {
        "inspect": {"finding": "Normal chest inspection", "description": "Chest wall symmetrical. Normal AP:lateral ratio. No visible deformity. No scars. Respiratory rate normal.", "is_abnormal": False, "clinical_significance": "Normal"},
        "palpate": {"finding": "Chest expansion equal bilaterally", "description": "Equal bilateral chest expansion. Tactile vocal fremitus equal. Trachea central.", "is_abnormal": False, "clinical_significance": "Normal"},
        "percuss": {"finding": "Resonant throughout", "description": "Resonant note throughout bilateral lung fields. Cardiac dullness in appropriate area.", "is_abnormal": False, "clinical_significance": "Normal"},
        "auscultate": {"finding": "Normal vesicular breath sounds", "description": "Clear vesicular breath sounds throughout. No added sounds. No wheeze or crackles.", "is_abnormal": False, "clinical_significance": "Normal"}
    },
    "precordium": {
        "inspect": {"finding": "No precordial abnormality on inspection", "description": "No visible pulsations other than apex. No scars.", "is_abnormal": False, "clinical_significance": "Normal"},
        "palpate": {"finding": "Apex beat 5th ICS MCL", "description": "Apex beat in 5th intercostal space, midclavicular line. No heave or thrill.", "is_abnormal": False, "clinical_significance": "Normal apex position"},
        "auscultate": {"finding": "Normal heart sounds S1 S2", "description": "Heart sounds S1 and S2 heard clearly. No murmurs. No added sounds.", "is_abnormal": False, "clinical_significance": "Normal cardiovascular examination"}
    },
    "abdomen": {
        "inspect": {"finding": "Abdomen normal on inspection", "description": "Abdomen flat. No distension. No visible masses. No visible peristalsis. No scars.", "is_abnormal": False, "clinical_significance": "Normal"},
        "palpate": {"finding": "Abdomen soft, non-tender", "description": "Soft abdomen. Non-tender throughout. No guarding or rigidity. No organomegaly palpable.", "is_abnormal": False, "clinical_significance": "Normal"},
        "percuss": {"finding": "Normal percussion", "description": "Tympanitic centrally. Dull over liver and spleen in expected areas. No shifting dullness.", "is_abnormal": False, "clinical_significance": "Normal"},
        "auscultate": {"finding": "Normal bowel sounds", "description": "Normal bowel sounds present. No bruit.", "is_abnormal": False, "clinical_significance": "Normal"}
    },
    "legs": {
        "inspect": {"finding": "Normal lower limb inspection", "description": "No oedema, varicosities, or skin changes. Normal colour and temperature.", "is_abnormal": False, "clinical_significance": "Normal"},
        "palpate": {"finding": "No tenderness or swelling", "description": "No calf tenderness. No pitting oedema. Peripheral pulses present.", "is_abnormal": False, "clinical_significance": "Normal"}
    },
    "pulse": {
        "palpate": {"finding": "Regular pulse, normal rate and volume", "description": "Regular rhythm, rate ~70 bpm, normal volume and character. Radial pulse easily palpable bilaterally.", "is_abnormal": False, "clinical_significance": "Normal cardiovascular status"}
    },
    "jvp": {
        "inspect": {"finding": "JVP not elevated", "description": "JVP not elevated at 45°. < 3 cm above sternal angle. Normal waveform.", "is_abnormal": False, "clinical_significance": "No elevated venous pressure"}
    },
    "neurological": {
        "inspect": {"finding": "Neurologically intact on inspection", "description": "Alert and oriented x3. Normal speech. No facial droop. Symmetrical limb movements.", "is_abnormal": False, "clinical_significance": "No obvious neurological deficit"},
        "assess": {"finding": "Normal neurological assessment", "description": "GCS 15. Motor and sensory examination within normal limits.", "is_abnormal": False, "clinical_significance": "Normal"}
    },
}


# regions added for the guided examination stations
REGION_METHODS.update({
    "hands": ["inspect", "palpate"], "teeth": ["inspect"],
    "neck": ["inspect", "palpate", "assess"], "thyroid": ["inspect", "palpate"], "trachea": ["palpate"],
    "brachial_pulse": ["palpate"], "femoral_pulse": ["palpate", "auscultate"], "popliteal_pulse": ["palpate"],
    "radioradial_delay": ["assess"], "radiofemoral_delay": ["assess"], "collapsing_pulse": ["assess"],
    "capillary_refill": ["assess"],
})

# a sick patient's chest findings must be found wherever the doctor listens or taps
ALIASES = {
    "lungs": ["chest"], "posterior_chest": ["chest"],
    "heart_sounds": ["precordium"], "aortic": ["precordium"], "pulmonary": ["precordium"],
    "tricuspid": ["precordium"], "mitral": ["precordium"], "apex_beat": ["precordium"],
    "ankles": ["edema", "legs"],
}


class ClinicalEngine:
    """Deterministic scenario engine. Single source of truth for all clinical facts."""

    def get_allowed_methods(self, region: str) -> list[str]:
        return REGION_METHODS.get(region, ["inspect"])

    @staticmethod
    def _authored(scenario: Scenario, region: str, method: str) -> Optional[dict]:
        region_data = (scenario.examination_findings or {}).get(region, {})
        if isinstance(region_data, dict):
            m = region_data.get(method) or region_data.get("default")
            if m:
                if isinstance(m, dict):
                    return m
                return {"finding": str(m), "description": str(m), "is_abnormal": True,
                        "clinical_significance": f"Abnormal {method} finding in {region}"}
        return None

    def get_examination_finding(self, scenario: Scenario, region: str, method: str) -> dict:
        """Deterministic finding: authored -> aliased -> derived from the case -> normal default."""
        found = self._authored(scenario, region, method)
        if found:
            return found
        for alias in ALIASES.get(region, []):
            found = self._authored(scenario, alias, method)
            if found:
                return found
        derived = exam_profiles.derive(scenario, region, method)
        if derived:
            return derived
        for r in [region, *ALIASES.get(region, [])]:
            normal = NORMAL_FINDINGS.get(r, {}).get(method)
            if normal:
                return normal
        return {
            "finding": f"{region.replace('_', ' ').title()} — within normal limits",
            "description": f"No abnormality detected on {method} of {region.replace('_', ' ')}.",
            "is_abnormal": False,
            "clinical_significance": "Normal finding",
        }

    def get_vital_signs(self, scenario: Scenario) -> dict:
        defaults = {
            "blood_pressure": "118/76", "heart_rate": 70, "respiratory_rate": 14,
            "temperature": 36.7, "oxygen_saturation": 99, "blood_glucose": 4.8,
            "bmi": 23.5, "weight_kg": 75, "height_cm": 178, "gcs": 15,
        }
        return {**defaults, **scenario.vital_signs}

    def get_investigation_result(self, scenario: Scenario, investigation: str) -> dict:
        investigations = scenario.investigations
        inv_key = investigation.upper().replace(" ", "_")
        result = investigations.get(inv_key) or investigations.get(investigation)
        if not result:
            return {
                "name": investigation, "result": {"status": "Normal — within reference range"},
                "interpretation": "All values within normal limits",
                "is_appropriate": False,
                "feedback": "Consider whether this investigation changes your management.",
                "turnaround_time": "2–4 hours",
            }
        return {
            "name": investigation,
            "result": result.get("values", result),
            "interpretation": result.get("interpretation", "See results"),
            "is_appropriate": result.get("is_appropriate", True),
            "feedback": result.get("feedback", ""),
            "turnaround_time": result.get("turnaround_time", "1–2 hours"),
        }

    def evaluate_diagnosis(self, scenario: Scenario, student_diagnosis: str, differentials: list) -> dict:
        if not student_diagnosis:
            return {"is_correct": False, "correct_diagnosis": scenario.diagnosis,
                    "diagnosis_score": 0.0, "differential_score": 0.0,
                    "matched_differentials": [], "missed_differentials": scenario.differential_diagnoses}

        correct = scenario.diagnosis.lower().strip()
        student = student_diagnosis.lower().strip()

        is_correct = correct in student or student in correct or self._fuzzy_match(correct, student)
        in_diffs = any(correct in d.lower() or d.lower() in correct for d in differentials)
        diagnosis_score = 1.0 if is_correct else (0.5 if in_diffs else 0.0)

        expected = scenario.differential_diagnoses
        matched = [exp for exp in expected if any(exp.lower() in d.lower() or d.lower() in exp.lower() for d in differentials)]
        missed = [d for d in expected if d not in matched]

        diff_score = len(matched) / max(len(expected), 1) if expected else 0.5

        return {
            "is_correct": is_correct, "correct_diagnosis": scenario.diagnosis,
            "diagnosis_score": diagnosis_score, "differential_score": diff_score,
            "matched_differentials": matched, "missed_differentials": missed,
        }

    def calculate_score(self, session: SimulationSession, scenario: Scenario) -> dict:
        rubric = scenario.assessment_rubric or {}
        weights = rubric.get("weights", {
            "communication": 0.10, "history": 0.15, "examination": 0.25,
            "clinical_reasoning": 0.20, "investigation": 0.10,
            "diagnosis": 0.10, "professionalism": 0.05, "documentation": 0.05,
        })

        history_score = self._score_history(session, scenario)
        exam_score, exam_detail = self._score_examination_detailed(session, scenario)
        inv_score = self._score_investigations(session, scenario)
        diag_result = self.evaluate_diagnosis(scenario, session.student_diagnosis or "", session.student_differentials or [])
        diag_score = diag_result["diagnosis_score"] * 100
        reasoning_score = diag_result["differential_score"] * 100
        comm_score = self._score_communication(session)
        prof_score = 80.0  # Default professionalism score
        doc_score = 70.0 if session.student_reasoning else 40.0

        breakdown = {
            "communication": round(comm_score, 1),
            "history": round(history_score, 1),
            "examination": round(exam_score, 1),
            "clinical_reasoning": round(reasoning_score, 1),
            "investigation": round(inv_score, 1),
            "diagnosis": round(diag_score, 1),
            "professionalism": round(prof_score, 1),
            "documentation": round(doc_score, 1),
        }

        total = sum(breakdown.get(cat, 0) * weights.get(cat, 0) for cat in weights)

        return {
            "total_score": round(total, 1),
            "breakdown": breakdown,
            "diagnosis_evaluation": diag_result,
            "examination_detail": exam_detail,
        }

    def _score_history(self, session: SimulationSession, scenario: Scenario) -> float:
        required = scenario.history_data.get("required_items", [])
        obtained = session.history_obtained or {}
        if not required:
            cats = ["presenting_complaint", "hpi", "past_history", "medications", "allergies", "family_history", "social_history"]
            covered = sum(1 for c in cats if c in str(obtained).lower())
            return (covered / len(cats)) * 100
        obtained_str = (str(list(obtained.keys())) + " " + str(list(obtained.values()))).lower()
        matched = sum(1 for item in required if item.lower() in obtained_str)
        return (matched / len(required)) * 100

    def _score_examination_detailed(self, session: SimulationSession, scenario: Scenario) -> tuple[float, dict]:
        performed = session.examinations_performed or []
        expected = scenario.examination_findings.get("expected_examinations", [])
        findings_found = session.findings_revealed or []

        completed = [f"{p.get('region')}.{p.get('method')}" for p in performed]
        completed += [f"{a}.{p.get('method')}" for p in performed for a in ALIASES.get(p.get('region'), [])]
        correct_list = []
        missed_list = []

        if expected:
            for exp in expected:
                if any(exp.lower() in c for c in completed):
                    correct_list.append(exp)
                else:
                    missed_list.append(exp)
            score = (len(correct_list) / len(expected)) * 100 if expected else 0
        else:
            if not performed:
                return 20.0, {"correct": [], "missed": [], "note": "No examination performed"}
            score = min(len(performed) * 8, 70) + min(len(findings_found) * 5, 30)
            correct_list = [f"{p.get('region')} - {p.get('method')}" for p in performed]

        return min(score, 100), {"correct": correct_list, "missed": missed_list,
                                  "performed_count": len(performed), "findings_count": len(findings_found)}

    def _score_investigations(self, session: SimulationSession, scenario: Scenario) -> float:
        ordered = session.investigations_ordered or []
        if not ordered:
            return 30.0
        appropriate = sum(1 for inv in ordered if scenario.investigations.get(inv.upper().replace(" ", "_"), {}).get("is_appropriate", True))
        unnecessary = len(ordered) - appropriate
        return max((appropriate / len(ordered)) * 100 - unnecessary * 10, 0)

    def _score_communication(self, session: SimulationSession) -> float:
        msgs = getattr(session, 'messages', [])
        student_msgs = [m for m in msgs if hasattr(m, 'role') and m.role == "student"]
        if not student_msgs:
            return 50.0
        score = min(len(student_msgs) * 8, 75)
        if session.history_obtained:
            score = min(score + 25, 100)
        return score

    def _fuzzy_match(self, a: str, b: str) -> bool:
        a_words = set(a.split())
        b_words = set(b.split())
        if not a_words or not b_words:
            return False
        return len(a_words & b_words) / min(len(a_words), len(b_words)) > 0.55


clinical_engine = ClinicalEngine()
