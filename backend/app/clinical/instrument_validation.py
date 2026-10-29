"""
Deterministic instrument-region-method validation.
Backend is the authority. Frontend validation is advisory only.
"""

# Maps (region, method) → valid instruments
VALID_COMBINATIONS: dict[tuple[str,str], list[str]] = {
    # Auscultation — always requires stethoscope
    ("chest",           "auscultate"): ["stethoscope"],
    ("precordium",      "auscultate"): ["stethoscope"],
    ("lungs",           "auscultate"): ["stethoscope"],
    ("posterior_chest", "auscultate"): ["stethoscope"],
    ("aortic",          "auscultate"): ["stethoscope"],
    ("pulmonary",       "auscultate"): ["stethoscope"],
    ("tricuspid",       "auscultate"): ["stethoscope"],
    ("mitral",          "auscultate"): ["stethoscope"],
    ("abdomen",         "auscultate"): ["stethoscope"],
    ("carotid",         "auscultate"): ["stethoscope"],
    # BP measurement
    ("right_arm",       "measure"):   ["bp_cuff", "pulse_oximeter"],
    ("left_arm",        "measure"):   ["bp_cuff", "pulse_oximeter"],
    ("blood_pressure",  "measure"):   ["bp_cuff"],
    # SpO2 / pulse oximeter
    ("oxygen_saturation","measure"):  ["pulse_oximeter"],
    ("nails",           "measure"):   ["pulse_oximeter"],
    # Temperature
    ("temperature",     "measure"):   ["thermometer"],
    ("general",         "measure"):   ["thermometer", "tape_measure"],
    # Reflexes — reflex hammer
    ("reflexes",        "assess"):    ["reflex_hammer"],
    ("neurological",    "assess"):    ["reflex_hammer", "penlight"],
    ("motor",           "assess"):    ["reflex_hammer"],
    # Eyes / cranial nerves — penlight
    ("eyes",            "inspect"):   ["penlight", None],
    ("cranial_nerves",  "inspect"):   ["penlight", None],
    ("cranial_nerves",  "assess"):    ["penlight", "reflex_hammer"],
    ("tongue",          "inspect"):   ["penlight", "tongue_depressor", None],
    ("teeth",           "inspect"):   ["penlight", "tongue_depressor", None],
    ("femoral_pulse",   "auscultate"): ["stethoscope"],
    # BMI / tape
    ("bmi",             "measure"):   ["tape_measure"],
}

# Regions where inspection/palpation/percussion require NO specific instrument
NO_INSTRUMENT_METHODS = {"inspect", "palpate", "percuss"}

def validate_instrument(region: str, method: str, instrument: str | None) -> tuple[bool, str]:
    """
    Returns (is_valid, error_message).
    is_valid=True means proceed with examination.
    """
    key = (region, method)

    # If no specific requirement → any instrument or none is fine
    if key not in VALID_COMBINATIONS:
        if method in NO_INSTRUMENT_METHODS:
            return True, ""
        # Unknown combo — allow with warning
        return True, ""

    required = VALID_COMBINATIONS[key]

    # None in required list means instrument is optional for this combo
    if None in required:
        return True, ""

    if not instrument:
        # Instrument required but not provided — warn but allow (frontend may not have enforced)
        return True, f"Recommended instrument for {method} on {region}: {required[0]}"

    if instrument not in required:
        return False, f"'{instrument}' is not appropriate for {method} on {region}. Use: {', '.join(r for r in required if r)}"

    return True, ""
