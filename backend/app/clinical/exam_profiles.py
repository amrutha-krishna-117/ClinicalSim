"""
Findings for the guided examination stations, derived deterministically from each scenario.

Priority in the engine: (1) findings authored in the scenario, (2) aliases of those (lungs -> chest ...),
(3) this module (hands, pulses, mouth, neck, thyroid, ...), (4) normal defaults.
Pulse RATE always comes from the scenario's own vital signs, so it can never disagree with them.
"""


def F(finding, description, abnormal=False, sig=None):
    return {"finding": finding, "description": description, "is_abnormal": abnormal,
            "clinical_significance": sig or ("Abnormal finding" if abnormal else "Normal")}


# title -> features that differ from normal.  tuple = (finding, description, significance)
PROFILES: dict[str, dict] = {
    "Iron Deficiency Anaemia": dict(
        pulse=("regular", "large", "bounding", "Hyperdynamic circulation compensating for the low haemoglobin.", "Hyperdynamic circulation in anaemia"),
        hands=("Pale palmar creases; koilonychia", "Palmar creases and nail beds pale. Brittle, spoon-shaped nails (koilonychia). No clubbing.", "Chronic iron deficiency"),
        eyes=("Pale conjunctivae", "Marked conjunctival pallor on pulling down the lower lid. Sclerae white, no jaundice.", "Pallor: anaemia"),
        tongue=("Smooth pale tongue; angular stomatitis", "Atrophic glossitis with loss of papillae. Painful cracks at the corners of the mouth.", "Iron-deficiency changes")),
    "Acute Coronary Syndrome": dict(
        hands=("Cool, clammy hands", "Peripherally cool and clammy; the patient is diaphoretic. No clubbing.", "Sympathetic activation")),
    "Aortic Stenosis": dict(
        pulse=("regular", "small", "slow-rising", "Narrow pulse pressure. Slow, anacrotic upstroke.", "Classic of severe aortic stenosis"),
        carotid_palp=("Slow-rising carotid pulse with a thrill", "Small-volume, slow-rising carotid pulse. A thrill is palpable over the carotids.", "Severe aortic stenosis"),
        carotid_ausc=("Ejection systolic murmur radiating to the carotids", "Harsh ejection systolic murmur radiating from the aortic area into both carotid arteries.", "Aortic stenosis")),
    "Pleural Effusion": dict(
        hands=("Finger clubbing; nicotine staining", "Marked finger clubbing. Nicotine staining of the right index and middle fingers.", "Suggests underlying lung malignancy"),
        teeth=("Nicotine-stained teeth", "Yellow-brown staining with gingival recession.", "Heavy smoking")),
    "Chronic Liver Disease with Ascites": dict(
        pulse=("regular", "large", "bounding", "Hyperdynamic circulation of cirrhosis.", "Hyperdynamic circulation"),
        hands=("Palmar erythema, leuconychia, liver flap", "Palmar erythema. White nails (leuconychia). Coarse flapping tremor (asterixis) with wrists extended. Dupuytren's contracture.", "Stigmata of chronic liver disease"),
        eyes=("Icteric sclerae", "Scleral icterus. Conjunctivae mildly pale.", "Jaundice"),
        teeth=("Poor dentition; fetor hepaticus", "Poor oral hygiene. Sweet, musty breath (fetor hepaticus).", "Liver failure")),
    "Acute Ischaemic Stroke": dict(
        pulse=("irregularly irregular", "normal", "normal", "", "Atrial fibrillation: cardio-embolic source"),
        tongue=("Tongue deviates to the left", "Deviates to the left on protrusion. No fasciculation.", "Upper motor neurone deviation: right hemisphere lesion")),
    "Acute Asthma Exacerbation": dict(
        pulse=("regular", "normal", "normal", "Pulse volume falls noticeably on inspiration (pulsus paradoxus).", "Severe asthma")),
    "COPD Exacerbation": dict(
        pulse=("regular", "large", "bounding", "Warm peripheries.", "Bounding pulse suggests CO2 retention"),
        hands=("Tar-stained fingers; CO2-retention flap", "Nicotine-stained fingers. Warm hands. Coarse flapping tremor with wrists extended. No clubbing.", "CO2 retention"),
        tongue=("Central cyanosis", "Bluish discolouration of the tongue and lips.", "Hypoxaemia"),
        teeth=("Nicotine-stained teeth", "Yellow-brown staining; gingival recession.", "Heavy smoking")),
    "Acute Appendicitis": dict(
        tongue=("Dry, furred tongue", "Coated tongue with dry mucous membranes.", "Dehydration / inflammation")),
    "Diabetic Ketoacidosis": dict(
        pulse=("regular", "small", "thready", "Tachycardia with weak volume from dehydration.", "Hypovolaemia"),
        hands=("Cool, dry hands", "Cool peripheries with dry skin. Capillary refill prolonged.", "Dehydration"),
        tongue=("Dry tongue and mucous membranes", "Dry, coated tongue; reduced skin turgor.", "Dehydration"),
        teeth=("Ketotic breath", "Breath smells of acetone (pear drops). Dry mucosa.", "Ketosis"),
        cap=("Capillary refill 4 seconds", "Capillary refill prolonged at about 4 seconds.")),
    "Acute Heart Failure / Pulmonary Oedema": dict(
        pulse=("regular", "small", "thready", "Cool peripheries.", "Low-output state"),
        hands=("Cool, clammy, cyanosed fingertips", "Cool and clammy with peripheral cyanosis of the fingertips.", "Low output / hypoxia"),
        tongue=("Central cyanosis", "Bluish tongue and lips.", "Hypoxaemia"),
        cap=("Capillary refill 4 seconds", "Capillary refill prolonged at about 4 seconds.")),
    "Bacterial Meningitis": dict(meningism=True,
        cap=("Capillary refill 3 seconds", "Capillary refill borderline at about 3 seconds.")),
    "Sepsis": dict(
        pulse=("regular", "small", "thready", "", "Septic shock"),
        hands=("Warm, flushed hands", "Peripherally vasodilated and warm. Capillary refill about 4 seconds.", "Vasodilatory sepsis"),
        tongue=("Dry tongue", "Dry mucous membranes.", "Dehydration"),
        cap=("Capillary refill 4 seconds", "Capillary refill prolonged at about 4 seconds.")),
    "Acute Kidney Injury": dict(
        tongue=("Dry tongue", "Dry mucous membranes; reduced skin turgor.", "Dehydration")),
    "Hypoglycaemia": dict(
        pulse=("regular", "large", "bounding", "", "Adrenergic response"),
        hands=("Sweaty, tremulous hands", "Cool, moist palms with a fine tremor.", "Adrenergic features of hypoglycaemia")),
    "Upper GI Bleeding": dict(
        pulse=("regular", "small", "thready", "", "Hypovolaemia from blood loss"),
        hands=("Pale, cool, clammy hands", "Pale palmar creases. Cool and clammy.", "Acute blood loss"),
        eyes=("Pale conjunctivae", "Conjunctival pallor. Sclerae white.", "Pallor: blood loss"),
        tongue=("Dry tongue", "Dry mucous membranes.", "Hypovolaemia"),
        teeth=("Nicotine-stained teeth", "Yellow-brown staining.", "Smoker"),
        cap=("Capillary refill 4 seconds", "Capillary refill prolonged at about 4 seconds.")),
    "Peripheral Arterial Disease": dict(legs="pad_right",
        hands=("Nicotine-stained fingers", "Yellow-brown staining. No clubbing.", "Smoker"),
        teeth=("Nicotine-stained teeth", "Yellow-brown staining; gingival recession.", "Heavy smoking")),
    "Acute Gastroenteritis": dict(
        pulse=("regular", "small", "thready", "", "Dehydration"),
        tongue=("Dry tongue", "Dry mucous membranes; reduced skin turgor.", "Dehydration"),
        cap=("Capillary refill 3 seconds", "Capillary refill borderline at about 3 seconds.")),
    "Bell's Palsy": dict(
        eyes=("Incomplete right eyelid closure", "Cannot fully close the right eye; the eye rolls upward on attempted closure (Bell's phenomenon). Conjunctiva normal.", "Lower motor neurone facial palsy")),
    "Hyperthyroidism": dict(
        pulse=("regular", "large", "bounding", "Sinus tachycardia; no atrial fibrillation at present.", "Thyrotoxicosis"),
        hands=("Fine tremor; warm, moist palms", "Fine tremor with outstretched hands. Warm, moist palms. Palmar erythema.", "Thyrotoxicosis"),
        eyes=("Lid retraction and lid lag", "Upper lid retraction giving a stare; lid lag on downward gaze.", "Thyroid eye signs"),
        thyroid=("Diffuse smooth goitre", "Diffusely enlarged, smooth, non-tender thyroid that moves on swallowing. A bruit is audible.", "Graves' disease"),
        neck_inspect=("Visible midline neck swelling", "Smooth midline swelling that rises on swallowing.", "Goitre")),
    "Hypothyroidism": dict(
        pulse=("regular", "small", "normal", "Slow rate.", "Bradycardia: hypothyroidism"),
        hands=("Cool, dry hands; positive Tinel's sign", "Cool, dry, coarse skin. Tinel's sign positive at the wrist (carpal tunnel).", "Hypothyroidism"),
        tongue=("Macroglossia", "Enlarged tongue with dental indentations.", "Hypothyroidism"),
        thyroid=("Firm diffuse goitre", "Firm, diffuse, non-tender goitre; no bruit.", "Hashimoto's thyroiditis"),
        neck_inspect=("Visible midline neck swelling", "Smooth, diffuse swelling moving on swallowing.", "Goitre")),
    "Parkinson's Disease Examination": dict(
        hands=("Resting pill-rolling tremor, right hand", "4-6 Hz resting tremor of the right hand that reduces on voluntary movement.", "Parkinson's disease")),
    "Chronic Kidney Disease": dict(
        hands=("Pale hands; half-and-half nails", "Pale palmar creases. Half-and-half nails. No arteriovenous fistula.", "Anaemia of chronic kidney disease"),
        eyes=("Pale conjunctivae", "Mild conjunctival pallor.", "Anaemia of CKD"),
        teeth=("Uraemic fetor", "Ammonia-like breath.", "Uraemia")),
}


def _pulse(hr, rhythm, volume, character, extra, sig):
    rate = "tachycardia" if hr > 100 else "bradycardia" if hr < 60 else "normal rate"
    abnormal = hr > 100 or hr < 60 or rhythm != "regular" or volume != "normal" or character != "normal" or bool(extra)
    finding = f"{rate.capitalize()}, {rhythm}, {volume} volume" + ("" if character == "normal" else f", {character}")
    desc = f"Rate {hr}/min ({rate}), {rhythm}. {volume.capitalize()} volume, {character} character. {extra}".strip()
    return F(finding, desc, abnormal, sig or ("Normal pulse" if not abnormal else "Abnormal pulse"))


def _prof(scenario):
    return PROFILES.get(scenario.title, {})


def _hr(scenario):
    return (scenario.vital_signs or {}).get("heart_rate", 70)


def pulse_rhythm(scenario) -> str:
    p = _prof(scenario).get("pulse")
    return p[0] if p else "regular"


def _authored(scenario, region, method):
    d = (scenario.examination_findings or {}).get(region)
    if isinstance(d, dict):
        m = d.get(method) or d.get("default")
        if isinstance(m, dict):
            return m
    return None


def derive(scenario, region: str, method: str):
    p = _prof(scenario)
    hr = _hr(scenario)
    pulse = p.get("pulse") or ("regular", "normal", "normal", "", None)

    if (region, method) in {("radial_pulse", "palpate"), ("brachial_pulse", "palpate"), ("pulse", "palpate")}:
        r = _pulse(hr, *pulse)
        if region == "radial_pulse":
            r["description"] += " No radio-radial delay."
        return r
    if (region, method) == ("carotid", "palpate"):
        c = p.get("carotid_palp")
        return F(*c[:2], True, c[2]) if c else F("Normal carotid pulse", "Carotid pulse of normal volume and upstroke. No thrill.")
    if (region, method) == ("carotid", "auscultate"):
        c = p.get("carotid_ausc")
        return F(*c[:2], True, c[2]) if c else F("No carotid bruit", "No bruit over either carotid artery.")
    if (region, method) == ("radioradial_delay", "assess"):
        return F("No radio-radial delay", "Both radial pulses felt together arrive at the same time.")
    if (region, method) == ("radiofemoral_delay", "assess"):
        return F("No radio-femoral delay", "Right radial and right femoral pulses arrive together.")
    if (region, method) == ("collapsing_pulse", "assess"):
        if pulse[2] == "bounding":
            return F("Bounding but not collapsing", "With the arm raised the pulse remains full; no water-hammer character.", True, "Hyperdynamic circulation")
        return F("Not collapsing", "No water-hammer character with the arm raised.")
    if (region, method) == ("capillary_refill", "assess"):
        c = p.get("cap")
        if p.get("legs") == "pad_right":
            return F("Right foot refill 4 s, left 2 s", "Capillary refill is delayed in the right foot (about 4 seconds); left foot normal.", True, "Right leg ischaemia")
        return F(*c, True, "Poor peripheral perfusion") if c else F("Capillary refill under 2 seconds", "Brisk capillary refill in the fingers and toes.")

    legs = p.get("legs")
    if (region, method) == ("femoral_pulse", "palpate"):
        return F("Femoral pulses present and equal", "Both femoral pulses easily palpable, equal volume.")
    if (region, method) == ("femoral_pulse", "auscultate"):
        return F("Right femoral bruit", "Soft systolic bruit over the right femoral artery.", True, "Atherosclerotic disease") if legs else F("No femoral bruit", "No bruit over either femoral artery.")
    if (region, method) == ("popliteal_pulse", "palpate"):
        return F("Right popliteal pulse absent", "Right popliteal pulse not palpable; left present and normal.", True, "Superficial femoral artery occlusion") if legs else F("Popliteal pulses present", "Both popliteal pulses palpable and equal.")
    if (region, method) == ("foot_pulses", "palpate"):
        return F("Right foot pulses absent", "Right dorsalis pedis and posterior tibial pulses absent; left both present. Right foot cool and pale.", True, "Right leg peripheral arterial disease") if legs else F("Foot pulses present", "Dorsalis pedis and posterior tibial pulses palpable and equal on both sides.")

    if (region, method) in {("hands", "inspect"), ("hands", "palpate")}:
        h = p.get("hands")
        out = F(*h[:2], True, h[2]) if h else F("Hands normal", "Warm, pink palms. Nails normal. No clubbing, tremor or palmar erythema.")
        extra = [a for r in ("clubbing", "nails") if (a := _authored(scenario, r, "inspect"))]
        for a in extra:
            out["description"] += " " + a.get("description", a.get("finding", ""))
            out["is_abnormal"] = out["is_abnormal"] or bool(a.get("is_abnormal"))
        return out
    if (region, method) == ("teeth", "inspect"):
        t = p.get("teeth")
        return F(*t[:2], True, t[2]) if t else F("Teeth and gums normal", "Good dentition. Gums healthy; no caries or gingivitis.")
    if (region, method) == ("tongue", "inspect"):
        t = p.get("tongue")
        return F(*t[:2], True, t[2]) if t else F("Tongue normal", "Moist, pink tongue. No central cyanosis, ulcers or coating.")
    if (region, method) == ("eyes", "inspect"):
        e = p.get("eyes")
        return F(*e[:2], True, e[2]) if e else F("Eyes normal", "Conjunctivae pink, sclerae white. Pupils equal and reactive.")

    if (region, method) == ("neck", "inspect"):
        n = p.get("neck_inspect")
        return F(*n[:2], True, n[2]) if n else F("Neck normal on inspection", "No visible lumps, swelling or scars. JVP not elevated.")
    if (region, method) == ("neck", "assess"):
        return (F("Neck stiffness", "Unable to flex the neck: the chin cannot reach the chest, with pain and resistance on passive flexion. Kernig's sign positive.", True, "Meningism: meningitis")
                if p.get("meningism") else F("No neck stiffness", "The neck flexes freely and the chin reaches the chest."))
    if (region, method) == ("neck", "palpate"):
        return F("No neck lumps", "No palpable lymph nodes or masses in the anterior or posterior triangles.")
    if (region, method) in {("thyroid", "inspect"), ("thyroid", "palpate")}:
        t = p.get("thyroid")
        return F(*t[:2], True, t[2]) if t else F("Thyroid not enlarged", "No visible swelling. Thyroid not palpable; no nodules, no bruit.")
    if (region, method) == ("trachea", "palpate"):
        return F("Trachea central", "The trachea is central with equal gaps either side.")
    return None
