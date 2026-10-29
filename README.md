# ClinicalSim

Browser-based clinical simulation for medical students: examine a virtual patient in a 3D hospital room,
talk to them (typing or by voice), order tests, make a diagnosis, and get a scored debrief.

* 30 clinical scenarios across 16 specialties, each with its own patient, history and findings
* Four guided examination stations: General, Arterial pulse, Respiratory, Cardiovascular
* Voice consultation: speak to the patient, the patient answers aloud
* Findings, vital signs, test results and scoring are deterministic (from the scenario data); only the
  patient's conversation can use AI, and it works fully without an API key

## Run it (any computer with Docker Desktop)

```bash
cp .env.example .env
# Open .env and add the key for your selected AI_PROVIDER (Groq by default)
docker compose up --build
```

Create an API key in the selected provider's official developer console. For the default Groq setup,
create a Groq API key and paste it after `GROQ_API_KEY=` in the root `.env` file. For OpenAI or
Anthropic, change `AI_PROVIDER` and fill `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` instead. Keep the key
in `.env`; do not paste it into source files, chat, or GitHub. The root `.env` is ignored by Git.
After changing the key, restart the backend with `docker compose up -d --force-recreate backend`.

First build downloads everything and takes several minutes (internet needed). When the logs say the
frontend is ready, open **http://localhost:3000** in **Google Chrome**. API docs: http://localhost:8000/docs

| Role | Email | Password |
|---|---|---|
| Student | student@example.com | student123 |
| Faculty | faculty@example.com | faculty123 |
| Admin | admin@example.com | admin123 |

Stop with Ctrl+C. Start completely fresh (wipes saved sessions): `docker compose down -v`.

### Things to know before a demo
* **Use Chrome or Edge, on the same computer that runs Docker, at `localhost`.** Voice input needs a secure
  context; `localhost` counts, a network address like `http://192.168.1.5:3000` does not.
* **Speech recognition needs internet** (Chrome sends the audio to Google). Typing always works.
* **Allow the microphone** when Chrome asks.
* **Patient model:** CC0 human patient meshes are included under `frontend/public/assets/patients/`.
  The sitting version is generated from the same patient mesh so pose changes preserve the patient's appearance.
* With a valid provider key, patient replies are generated dynamically but stay in character and are grounded in the selected synthetic case. Without a key, or if the API is unavailable, scenario scripts answer common questions offline.
* The same patient identity is used for every position. Sitting uses a pose baked from the shared model and places the patient at the open long side of the bed.
* Ports used: 3000 (web) and 8000 (API). Database and cache are not exposed to the host.

## How a session works
1. **Scenarios** page: pick a case (search and filter by specialty and difficulty).
2. **History tab**: talk to the patient. Press *Start voice consultation* to speak and hear replies.
3. **Examine tab**
   * *Guided stations*: an ordered checklist per examination. Each step names the instrument it needs.
     Wrong instrument, no arm chosen for blood pressure, or counting an irregular pulse for only 15 seconds
     is refused or flagged with a teaching message. The patient moves into position (arm out for the
     pulse, mouth open for teeth and tongue, chin up for the neck, and so on).
   * *Free examination*: click any region and method.
4. **Tests**, **Reasoning**, **Diagnose**: order investigations, record differentials, submit a diagnosis.
5. **Assessment**: score, competency chart, feedback, per-station checklists with missed steps, and the full
   consultation transcript.

Faculty accounts get a dashboard with per-student and per-scenario analytics and CSV export.

## Tests
```bash
cd backend && python tests/test_voice_conversations.py     # conversations, ordering, every scenario
cd backend && python tests/test_exam_stations.py           # stations, instruments, measurements, findings
cd frontend && bash tests/run-avatar-tests.sh              # avatar poses and model loader, no browser needed
```
Backend tests need `pip install -r requirements.txt` and `python seed.py` once.

## Working on the code
```bash
# backend (when running without Docker, put provider variables in backend/.env)
cd backend && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
python seed.py && uvicorn app.main:app --reload --port 8000
# frontend
cd frontend && npm install && echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local && npm run dev
```
If VS Code shows hundreds of red errors such as *JSX.IntrinsicElements does not exist*, run `npm install`
inside `frontend/` (the editor needs the packages locally even though Docker has its own copy), then
*TypeScript: Restart TS Server*.

## Layout
```
frontend/   Next.js 16, React, TypeScript, React Three Fiber
  app/                simulation/[id] (main screen), assessment, scenarios, dashboard, faculty, login
  components/         ConversationPanel (voice), StationPanel (guided exams), ExaminationPanel, 3d/*
  lib/                api.ts, store.ts, voice.ts, voiceUtils.ts, outbox.ts (send queue), poseMath.ts
backend/    FastAPI, SQLAlchemy, PostgreSQL
  app/clinical/       engine.py, seed_scenarios.py, stations.py, measurements.py, exam_profiles.py,
                      instrument_validation.py, patient answers in app/ai/patient_voice.py
  tests/
```

## Clinical disclaimer
All patient cases are synthetic and for education only. Do not use for clinical decisions.
