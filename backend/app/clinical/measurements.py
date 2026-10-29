"""
Instrument-based measurements. The doctor must pick the right instrument, the right site and (for pulse and
breathing) count for long enough. Values come from the scenario's own vital signs, so they are always consistent.
"""
from app.clinical import exam_profiles


class MeasureError(ValueError):
    """Wrong instrument / missing site: shown to the student as a teaching message."""


VITAL_REGION = {
    "blood_pressure": "blood_pressure", "temperature": "temperature", "oxygen_saturation": "oxygen_saturation",
    "pulse_rate": "pulse", "respiratory_rate": "respiratory_rate",
}
LABEL = {"blood_pressure": "Blood pressure", "temperature": "Temperature", "oxygen_saturation": "Oxygen saturation",
         "pulse_rate": "Pulse rate", "respiratory_rate": "Respiratory rate"}


def _vitals(scenario) -> dict:
    d = {"blood_pressure": "118/76", "heart_rate": 70, "respiratory_rate": 14, "temperature": 36.7, "oxygen_saturation": 99}
    return {**d, **(scenario.vital_signs or {})}


def measure(scenario, vital: str, instrument, site=None, seconds=None) -> dict:
    if vital not in VITAL_REGION:
        raise MeasureError(f"Unknown measurement '{vital}'.")
    v = _vitals(scenario)
    out = {"vital": vital, "label": LABEL[vital], "region": VITAL_REGION[vital], "site": site, "adequate": True, "note": ""}

    if vital == "blood_pressure":
        if instrument != "bp_cuff":
            raise MeasureError("Blood pressure needs the BP cuff (sphygmomanometer). Select it from the instrument tray first.")
        if site not in ("right_arm", "left_arm"):
            raise MeasureError("Choose an arm: wrap the cuff on the right or the left upper arm.")
        out.update(value=str(v["blood_pressure"]), unit="mmHg",
                   display=f"{v['blood_pressure']} mmHg ({site.replace('_', ' ')})")
        out["note"] = "Measure both arms at least once to look for a difference."

    elif vital == "temperature":
        if instrument != "thermometer":
            raise MeasureError("Temperature needs the thermometer. Select it from the instrument tray first.")
        site = site if site in ("oral", "tympanic", "axilla") else "tympanic"
        t = float(v["temperature"]) - (0.4 if site == "axilla" else 0.0)
        out.update(site=site, value=round(t, 1), unit="C", display=f"{t:.1f} C ({site})")
        if site == "axilla":
            out["note"] = "Axillary readings run slightly lower than core temperature."

    elif vital == "oxygen_saturation":
        if instrument != "pulse_oximeter":
            raise MeasureError("Oxygen saturation needs the pulse oximeter. Select it from the instrument tray first.")
        out.update(site="finger", value=int(v["oxygen_saturation"]), unit="%",
                   display=f"SpO2 {int(v['oxygen_saturation'])}% on room air, pulse {v['heart_rate']}/min")

    elif vital == "pulse_rate":
        if seconds not in (15, 30, 60):
            raise MeasureError("Choose how long to count the radial pulse: 15, 30 or 60 seconds.")
        beats = round(v["heart_rate"] * seconds / 60)
        rate = round(beats * 60 / seconds)
        rhythm = exam_profiles.pulse_rhythm(scenario)
        out.update(value=rate, unit="beats/min", site="radial",
                   display=f"About {rate} beats/min ({beats} beats in {seconds} s)")
        if rhythm != "regular" and seconds < 60:
            out["adequate"] = False
            out["note"] = "The rhythm is irregular, so counting for less than a full minute is unreliable. Count for 60 seconds."
        elif rhythm != "regular":
            out["note"] = "Irregular rhythm: the rate is only accurate over a full minute."

    elif vital == "respiratory_rate":
        if seconds not in (15, 30, 60):
            raise MeasureError("Choose how long to count the breathing: 15, 30 or 60 seconds.")
        breaths = round(v["respiratory_rate"] * seconds / 60)
        rate = round(breaths * 60 / seconds)
        out.update(value=rate, unit="breaths/min", site="observed",
                   display=f"About {rate} breaths/min ({breaths} breaths in {seconds} s)")
        if seconds < 30:
            out["adequate"] = False
            out["note"] = "Count for at least 30 seconds, ideally while appearing to still be feeling the pulse."
    return out
