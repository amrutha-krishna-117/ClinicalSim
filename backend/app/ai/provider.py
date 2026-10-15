"""
AI Provider abstraction.
DETERMINISTIC: findings, vitals, investigations, scoring, scenario state
AI-ALLOWED: patient conversation, feedback, debriefing, recommendations
"""
from abc import ABC, abstractmethod
from typing import Optional
from app.core.config import settings
import httpx
import json
import re


class BaseAIProvider(ABC):
    @abstractmethod
    async def complete(self, system: str, messages: list[dict], max_tokens: int = 500) -> str:
        pass


class AnthropicProvider(BaseAIProvider):
    def __init__(self):
        self.api_key = settings.ANTHROPIC_API_KEY
        self.model = settings.ANTHROPIC_MODEL

    async def complete(self, system: str, messages: list[dict], max_tokens: int = 500) -> str:
        if not self.api_key:
            raise ValueError("No Anthropic API key")
        headers = {"x-api-key": self.api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"}
        payload = {"model": self.model, "max_tokens": max_tokens, "system": system, "messages": messages}
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post("https://api.anthropic.com/v1/messages", headers=headers, json=payload)
            resp.raise_for_status()
            return resp.json()["content"][0]["text"]


class OpenAIProvider(BaseAIProvider):
    def __init__(self):
        self.api_key = settings.OPENAI_API_KEY
        self.model = settings.OPENAI_MODEL

    async def complete(self, system: str, messages: list[dict], max_tokens: int = 500) -> str:
        if not self.api_key:
            raise ValueError("No OpenAI API key")
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        oai_messages = [{"role": "system", "content": system}] + messages
        payload = {"model": self.model, "messages": oai_messages, "max_tokens": max_tokens}
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload)
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"]


# ─── Scenario-aware fallback conversation banks ───────────────────────
# Each scenario has dedicated responses. NO cross-contamination.

SCENARIO_BANKS: dict[str, dict[tuple, str]] = {

    # 1. Normal Adult General Examination
    "normal": {
        ("hello", "hi ", "good morning", "greet", "how are"): "Hello, doctor. I'm here for my routine annual check-up. I'm generally feeling quite well, thank you.",
        ("bring", "complaint", "reason", "here", "today"): "Just my routine annual check-up. No specific complaints — I've been feeling well.",
        ("symptom", "any problem", "anything wrong", "issue"): "No, I haven't had any significant symptoms. I've been feeling well in myself.",
        ("pain",): "No pain at all, thankfully. Everything feels fine.",
        ("past", "medical history", "condition", "ever had"): "Nothing significant. I've been healthy — no major illnesses or hospital admissions.",
        ("medication", "tablet", "drug", "taking"): "I'm not on any regular medications. Just the occasional paracetamol if I get a headache.",
        ("allerg",): "No known allergies.",
        ("family",): "My father has mild hypertension, well controlled. Mother is generally well. No family history of serious illness.",
        ("smoke",): "I don't smoke.",
        ("alcohol", "drink"): "Occasionally — maybe a glass of wine with dinner at weekends.",
        ("work", "job", "occup"): "I work in an office — desk job, software developer.",
        ("exercise", "active", "sport"): "I try to exercise three times a week — usually running or cycling.",
        ("weight", "diet"): "My weight has been stable. I eat reasonably healthily.",
        ("sleep",): "Sleep is generally good — about seven to eight hours a night.",
        ("worry", "concern", "anxious"): "Not really — I just like to keep on top of my health with regular check-ups.",
    },

    # 2. Iron Deficiency Anaemia
    "anaemia": {
        ("hello", "hi ", "greet", "how are"): "Hello doctor. I've been feeling really tired lately — it's been going on for a while now.",
        ("bring", "complaint", "reason", "here", "today"): "I've been extremely fatigued for the past three months. I get breathless just climbing the stairs and I've noticed I look very pale.",
        ("tired", "fatigue", "energy", "lethargy"): "Yes, I'm exhausted all the time. Even small tasks leave me breathless. I used to be quite active but now I struggle.",
        ("breath", "breathless", "dyspnoea"): "Yes, especially on exertion. Even walking up stairs leaves me quite short of breath.",
        ("pale", "pallor", "colour", "look"): "People keep telling me I look pale. I've noticed it myself in the mirror.",
        ("period", "menstrual", "bleed", "heavy"): "Yes, my periods have been very heavy for the past year — I soak through pads quickly and they last seven to eight days.",
        ("diet", "eating", "food", "vegetarian", "vegan"): "I'm vegetarian. I don't eat meat or fish. I try to eat well but perhaps I'm not getting enough iron.",
        ("palpitat", "heart", "racing"): "Yes, I've noticed my heart racing sometimes, even at rest.",
        ("past", "medical history"): "No major medical history. I had a tonsillectomy as a child.",
        ("medication",): "I'm not on any regular medications. I've tried over-the-counter iron supplements but they upset my stomach.",
        ("allerg",): "No known drug allergies.",
        ("family",): "My mother had anaemia during pregnancy. No other significant family history.",
        ("smoke",): "No, I don't smoke.",
        ("nail", "hair", "brittle"): "Actually yes — my nails have become quite brittle and my hair has been falling out more than usual.",
        ("symptom",): "Tiredness, breathlessness, palpitations, and I've been having headaches as well.",
    },

    # 3. Acute Coronary Syndrome
    "acs": {
        ("hello", "hi ", "greet"): "Please help me — I've got this terrible chest pain. It came on about two hours ago.",
        ("bring", "complaint", "reason", "here", "pain", "chest"): "I've had crushing chest pain for the last two hours. It came on suddenly while I was watching TV. It's the worst pain I've ever felt.",
        ("describe", "character", "feel like", "type of pain"): "It's like a heavy weight on my chest — crushing, squeezing. It radiates up to my jaw and down my left arm.",
        ("radiat", "spread", "arm", "jaw", "neck"): "Yes, it goes up to my jaw and down my left arm. The whole left side feels heavy.",
        ("sweat", "perspir"): "Yes, I've been sweating profusely. My shirt is soaked.",
        ("nausea", "sick", "vomit"): "Yes, I feel very nauseous. I nearly was sick on the way here.",
        ("breath", "breathless"): "Yes, I'm quite short of breath — worse than usual.",
        ("past", "medical", "condition"): "I have high blood pressure, diabetes, and high cholesterol.",
        ("medication",): "Amlodipine for blood pressure, metformin for diabetes, atorvastatin for cholesterol.",
        ("allerg",): "Aspirin gives me a rash — I'm allergic to aspirin.",
        ("family",): "My father had a heart attack at 55 and died from it. My brother has angina.",
        ("smoke",): "I used to smoke — about 20 cigarettes a day for 20 years. I stopped five years ago.",
        ("alcohol",): "I drink occasionally — not much.",
        ("scale", "severe", "score", "out of"): "It's a 10 out of 10. The worst pain of my life.",
        ("better", "worse", "relief"): "Nothing makes it better. I tried sitting forward but it didn't help at all.",
    },

    # 4. Aortic Stenosis
    "aortic": {
        ("hello", "hi ", "greet"): "Hello doctor. I've been having some problems lately — mainly with my breathing and I fainted twice.",
        ("bring", "complaint", "reason", "here", "today"): "I've been having exertional breathlessness, chest tightness on exertion, and I've fainted twice in the past month.",
        ("faint", "syncope", "collaps", "blackout"): "Yes, twice. Both times it happened when I was walking — I just blacked out briefly. Very frightening.",
        ("breath", "breathless"): "Yes, especially when I climb stairs or walk any distance. I've had to slow right down.",
        ("chest", "pain", "angina"): "I get a tight chest when I exert myself. It goes away with rest.",
        ("past", "medical", "history"): "High blood pressure. I also had rheumatic fever as a child — I was about twelve years old.",
        ("medication",): "Just a water tablet — bendroflumethiazide.",
        ("allerg",): "No known allergies.",
        ("family",): "No family history of heart disease that I know of.",
        ("smoke",): "I've never smoked.",
        ("exercise", "activity", "limit"): "I've had to limit myself quite a lot. I used to walk a mile every day but now I struggle to get to the end of the street.",
        ("symptom", "problem"): "Mainly the breathlessness, the chest tightness on exertion, and those two episodes of fainting.",
    },

    # 5. Community-Acquired Pneumonia
    "pneumonia": {
        ("hello", "hi ", "greet"): "Hello doctor. I've been feeling dreadful for the past four days — fever, cough, and I can barely breathe properly.",
        ("bring", "complaint", "reason", "here", "today"): "I've had a high fever, a productive cough, and right-sided chest pain for four days. I'm really struggling to breathe.",
        ("cough",): "Yes, a lot. It's productive — yellow-green sputum. Sometimes there's a bit of blood-streaking in it which frightened me.",
        ("sputum", "phlegm", "colour"): "Yellow-green, quite thick. Occasionally with a tiny streak of blood.",
        ("fever", "temperature", "hot"): "Yes, very high — I measured it at 39 degrees at home. Rigors and chills too.",
        ("chest", "pain"): "Yes, right-sided, sharp chest pain that's worse when I breathe in deeply — pleuritic pain.",
        ("breath", "breathless"): "I'm quite breathless. I can't take a deep breath without pain.",
        ("past", "medical"): "I have mild asthma, well controlled.",
        ("medication",): "Just a salbutamol inhaler when needed.",
        ("allerg",): "I'm allergic to penicillin — it caused anaphylaxis.",
        ("family",): "Nothing relevant.",
        ("smoke",): "I don't smoke.",
        ("contact", "unwell", "around"): "Several colleagues were unwell at work last week — one was confirmed with a chest infection.",
        ("travel",): "No recent travel.",
    },

    # 6. Pleural Effusion
    "effusion": {
        ("hello", "hi ", "greet"): "Hello. I've been getting increasingly breathless over the past few weeks and I have this dull ache in my left chest.",
        ("bring", "complaint", "reason", "here", "today"): "Progressive breathlessness over three weeks, left-sided chest ache, and I've lost quite a bit of weight.",
        ("breath", "breathless"): "It's been getting worse — I'm breathless just sitting now. I can't lie flat.",
        ("weight", "lost", "loss"): "Yes, about eight kilograms in the past three months, without trying.",
        ("pain", "chest"): "A dull ache on the left side. Not sharp like a pleurisy — just a persistent dull heaviness.",
        ("night sweat", "sweat"): "Yes, drenching night sweats — I wake up soaked.",
        ("cough",): "A dry cough, non-productive. No sputum.",
        ("past", "medical"): "I have mild COPD. I'm an ex-smoker.",
        ("medication",): "Salbutamol and tiotropium inhalers.",
        ("allerg",): "No known allergies.",
        ("smoke", "history"): "Ex-smoker — forty pack-years. Stopped two years ago.",
        ("work", "job", "asbestos", "exposure"): "I worked on building sites for twenty years. There was a lot of asbestos — this was before proper safety regulations.",
        ("family",): "No family history of cancer.",
        ("appetite",): "My appetite has dropped off significantly. I'm not interested in food.",
    },

    # 7. Chronic Liver Disease / Ascites
    "liver": {
        ("hello", "hi ", "greet"): "Hello doctor. My stomach has been swelling up for weeks and my wife noticed my eyes are yellow.",
        ("bring", "complaint", "reason", "here", "today"): "My abdomen has been swelling progressively for six weeks, I've gone yellow, and I've been confused at times.",
        ("abdomen", "stomach", "swell", "distension"): "Yes, my belly has become enormous. My trousers don't fit anymore. It started about six weeks ago and keeps getting worse.",
        ("yellow", "jaundice", "icteric", "eyes"): "Yes, my wife noticed my eyes were yellow about two weeks ago. My skin looks yellow too.",
        ("confus", "memory", "thinking"): "I've been muddled — especially at night. My wife says I've been saying strange things.",
        ("alcohol", "drink"): "I've been drinking heavily for twenty years — about two bottles of wine a day. I know I need to stop.",
        ("past", "medical"): "I have alcoholic cirrhosis. I had a bleed from my oesophagus about a year ago.",
        ("medication",): "Propranolol, spironolactone, and lactulose.",
        ("allerg",): "No known allergies.",
        ("family",): "My father was also a heavy drinker.",
        ("ankle", "edema", "swelling", "legs"): "Yes, my ankles and legs have also been swelling.",
        ("appetite",): "Very poor appetite. I've lost a lot of weight over the past few months.",
        ("urine", "dark", "colour"): "Yes, my urine has been quite dark — brown-coloured.",
        ("vomit", "blood", "haematemesis"): "I had a major bleed from my gullet last year — that was terrifying. I nearly didn't make it.",
    },

    # 8. Acute Ischaemic Stroke
    "stroke": {
        ("hello", "hi ", "greet"): "Hel... hello. I... I'm finding it hard to... to get my words out.",
        ("bring", "complaint", "reason", "here", "today", "wrong", "happen"): "It happened suddenly... about an hour ago. My arm went weak and I... I couldn't get my words out properly.",
        ("arm", "weakness", "strong"): "My left arm... it's so weak. I can barely lift it. And my left leg too.",
        ("speech", "word", "talk", "speak"): "I know what I want to say but... the words won't come out right. It's frightening.",
        ("face", "droop", "mouth"): "My husband said my face was drooping on the left side.",
        ("headache",): "Yes... a sudden headache when it started. Not like any headache I've had before.",
        ("past", "medical"): "Atrial fibrillation... and high blood pressure. I had a TIA two years ago as well.",
        ("medication",): "Warfarin for my heart condition... ramipril and bisoprolol as well.",
        ("allerg",): "No... no allergies.",
        ("family",): "My mother had a stroke.",
        ("smoke",): "I've never smoked.",
        ("sudden", "onset", "when", "start"): "It was sudden... at breakfast. I was pouring my tea and my arm just gave way.",
        ("vision", "sight", "eye"): "My vision seems... I don't know... things look strange on the left side.",
    },
}

def _get_scenario_bank(scenario_title: str) -> dict[tuple, str]:
    """Map scenario title to correct conversation bank."""
    title_lower = scenario_title.lower()
    if "normal" in title_lower or "general examination" in title_lower:
        return SCENARIO_BANKS["normal"]
    if "iron" in title_lower or "anaemia" in title_lower or "anemia" in title_lower:
        return SCENARIO_BANKS["anaemia"]
    if "coronary" in title_lower or "acs" in title_lower or "nstemi" in title_lower or "stemi" in title_lower:
        return SCENARIO_BANKS["acs"]
    if "aortic" in title_lower:
        return SCENARIO_BANKS["aortic"]
    if "pneumonia" in title_lower:
        return SCENARIO_BANKS["pneumonia"]
    if "pleural" in title_lower or "effusion" in title_lower:
        return SCENARIO_BANKS["effusion"]
    if "liver" in title_lower or "cirrhosis" in title_lower or "ascites" in title_lower:
        return SCENARIO_BANKS["liver"]
    if "stroke" in title_lower or "ischaemic" in title_lower or "mca" in title_lower:
        return SCENARIO_BANKS["stroke"]
    return SCENARIO_BANKS["normal"]  # safe default


class FallbackProvider(BaseAIProvider):
    """Scenario-aware deterministic fallback. No cross-scenario contamination."""

    def _match(self, message: str, bank: dict[tuple, str]) -> str:
        msg = message.lower()
        for keywords, response in bank.items():
            if any(kw in msg for kw in keywords):
                return response
        return "I'm sorry, could you say that again? I'm finding it a little hard to concentrate."

    async def complete(self, system: str, messages: list[dict], max_tokens: int = 500) -> str:
        last = messages[-1]["content"] if messages else ""

        if "patient" in system.lower():
            # Extract scenario title from system prompt
            title_match = re.search(r'Scenario.*?:\s*([^\n]+)', system, re.IGNORECASE)
            title = title_match.group(1).strip() if title_match else ""
            chief_match = re.search(r'Chief Complaint:\s*([^\n]+)', system)
            chief = chief_match.group(1) if chief_match else ""

            bank = _get_scenario_bank(title)
            response = self._match(last, bank)
            return response

        return "Thank you for completing this simulation. Your performance has been recorded."


def get_ai_provider() -> BaseAIProvider:
    if settings.ANTHROPIC_API_KEY:
        return AnthropicProvider()
    if settings.OPENAI_API_KEY:
        return OpenAIProvider()
    return FallbackProvider()


class ClinicalAIProvider:
    """High-level clinical AI. AI assists — never determines clinical truth."""

    def __init__(self):
        self._provider: Optional[BaseAIProvider] = None

    @property
    def provider(self) -> BaseAIProvider:
        if self._provider is None:
            self._provider = get_ai_provider()
        return self._provider

    async def _safe(self, system: str, messages: list[dict], max_tokens: int = 500) -> str:
        try:
            return await self.provider.complete(system, messages, max_tokens)
        except Exception:
            fallback = FallbackProvider()
            return await fallback.complete(system, messages, max_tokens)

    async def generate_patient_response(self, scenario: dict, history: list[dict], message: str, stage: str) -> str:
        system = f"""You are playing the role of a patient in a medical education simulation. Stay in character at ALL times.

Scenario: {scenario.get('scenario_title', scenario.get('title', ''))}
Patient: {scenario.get('patient_name')}, {scenario.get('patient_age')}y {scenario.get('patient_sex')}
Chief Complaint: {scenario.get('chief_complaint')}
Personality: {scenario.get('patient_personality')}
Stage: {stage}

HISTORY (reveal naturally only when asked — never volunteer everything):
{json.dumps(scenario.get('history_data', {}), indent=2)}

RULES:
- Respond as the patient ONLY — not as a doctor
- 2-4 sentences maximum
- Show appropriate emotion
- Do NOT reveal the diagnosis
- Stay consistent with the history above
- Do NOT introduce symptoms or history not in the scenario above"""

        msgs = history[-10:] + [{"role": "user", "content": message}]
        return await self._safe(system, msgs, 250)

    async def generate_feedback(self, session_data: dict, scenario: dict) -> str:
        system = "You are a clinical educator providing structured feedback based ONLY on the recorded student actions provided. Do not invent performance."
        content = f"""Feedback for: {scenario.get('title')} | Correct Dx: {scenario.get('diagnosis')}
Score: {session_data.get('total_score', 0):.1f}%
Breakdown: {json.dumps(session_data.get('score_breakdown', {}))}
History: {json.dumps(session_data.get('history_obtained', {}))}
Examinations: {json.dumps(session_data.get('examinations_performed', []))}
Findings: {json.dumps(session_data.get('findings_revealed', []))}
Investigations: {json.dumps(session_data.get('investigations_ordered', []))}
Diagnosis submitted: {session_data.get('student_diagnosis')}

Give structured feedback: overall, history, examination, reasoning, investigations, diagnosis, 3 learning points."""
        return await self._safe(system, [{"role": "user", "content": content}], 900)

    async def generate_debriefing(self, session_data: dict, scenario: dict) -> dict:
        system = """Clinical educator running Plus-Delta debrief. Return ONLY valid JSON:
{"what_went_well":[],"areas_to_improve":[],"missed_findings":[],"reasoning_errors":[],"learning_points":[],"reflection_questions":[],"correct_diagnosis_explanation":"","key_differentials":[]}"""
        content = f"Scenario: {scenario.get('title')} | Dx: {scenario.get('diagnosis')} | Score: {session_data.get('total_score', 0):.1f}%\nExams: {json.dumps(session_data.get('examinations_performed', []))}\nFindings: {json.dumps(session_data.get('findings_revealed', []))}\nDx: {session_data.get('student_diagnosis')}"
        try:
            raw = await self._safe(system, [{"role": "user", "content": content}], 700)
            raw = raw.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
            return json.loads(raw)
        except Exception:
            return {
                "what_went_well": ["Completed the simulation"],
                "areas_to_improve": ["Systematic examination approach"],
                "missed_findings": [], "reasoning_errors": [],
                "learning_points": ["Approach each case systematically", "Use all examination techniques", "Consider the full differential"],
                "reflection_questions": ["What would you do differently?", "Which findings were most diagnostic?"],
                "correct_diagnosis_explanation": f"The correct diagnosis is {scenario.get('diagnosis', 'unknown')}.",
                "key_differentials": scenario.get("differential_diagnoses", [])[:3],
            }


ai_provider = ClinicalAIProvider()
