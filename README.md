# ClinicalSim AI 🏥

**AI-Powered 3D Clinical Reasoning & Virtual Patient Learning Platform**

A browser-based medical education platform with 3D interactive patients, deterministic clinical findings, and AI-powered conversation and feedback.

---

## 🚀 Quick Start (2 commands)

```bash
cp .env.example .env
# Add your ANTHROPIC_API_KEY to .env (optional — works without it in fallback mode)

docker compose up
```

App at **http://localhost:3000** · API at **http://localhost:8000/docs**

---

## 🔑 Demo Credentials

| Role    | Email                  | Password   |
|---------|------------------------|------------|
| Student | student@example.com    | student123 |
| Faculty | faculty@example.com    | faculty123 |
| Admin   | admin@example.com      | admin123   |

---

## 🧪 Running Locally (no Docker)

**Backend:**
```bash
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python seed.py          # creates DB + 8 scenarios + demo users
uvicorn app.main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
npm run dev             # → http://localhost:3000
```

---

## 🎮 How to Use

1. Login → Student Dashboard
2. Click a scenario (e.g. "Normal Adult General Examination")
3. Click **Start Clinical Simulation**
4. In the 3D room:
   - **Click body regions** on the patient to examine
   - **Select instruments** (stethoscope, BP cuff, etc.) from the tray
   - **Change patient position** (sitting/supine/semi-recumbent) via bottom toolbar
5. Switch tabs: **History** (talk to patient) → **Examine** → **Tests** → **Reasoning** → **Diagnose**
6. Submit diagnosis → receive deterministic score + AI feedback + debriefing

---

## 🏗 Architecture

```
clinicalsim/
├── frontend/                    # Next.js 16 + React + TypeScript
│   ├── app/
│   │   ├── login/               # Auth pages
│   │   ├── dashboard/           # Student dashboard + charts
│   │   ├── scenarios/           # Scenario browser + detail
│   │   ├── simulation/[id]/     # 3D clinical simulation room ← MAIN
│   │   ├── assessment/[id]/     # Results, AI feedback, debriefing
│   │   └── faculty/             # Faculty dashboard
│   ├── components/
│   │   ├── 3d/
│   │   │   ├── SimulationRoom.tsx        # Composes full 3D scene
│   │   │   ├── PatientAvatar.tsx         # Smooth humanoid (capsule-based)
│   │   │   ├── BodyRegions.tsx           # 30+ anatomical exam zones
│   │   │   └── ExaminationInstruments.tsx # 3D instrument tray
│   │   ├── ConversationPanel.tsx
│   │   ├── ExaminationPanel.tsx
│   │   ├── InvestigationPanel.tsx
│   │   └── DiagnosisPanel.tsx
│   └── lib/
│       ├── api.ts               # All API calls
│       └── store.ts             # Zustand auth + simulation state
│
├── backend/                     # FastAPI + Python
│   ├── app/
│   │   ├── main.py
│   │   ├── core/config.py       # Anthropic + OpenAI + SQLite/PostgreSQL
│   │   ├── models/__init__.py   # SQLAlchemy ORM
│   │   ├── clinical/
│   │   │   ├── engine.py        # DETERMINISTIC source of truth
│   │   │   └── seed_scenarios.py # 8 complete clinical scenarios
│   │   ├── ai/provider.py       # AnthropicProvider | OpenAIProvider | FallbackProvider
│   │   └── api/routes/          # REST endpoints
│   └── seed.py
│
├── docker-compose.yml
└── .env.example
```

---

## 🩺 Clinical Scenarios

| # | Scenario | Difficulty |
|---|----------|------------|
| 1 | Normal Adult General Examination | Beginner |
| 2 | Iron Deficiency Anaemia | Beginner |
| 3 | Acute Coronary Syndrome (NSTEMI) | Intermediate |
| 4 | Severe Aortic Stenosis | Intermediate |
| 5 | Community-Acquired Pneumonia | Intermediate |
| 6 | Malignant Pleural Effusion | Intermediate |
| 7 | Alcoholic Cirrhosis with Ascites | Advanced |
| 8 | Acute MCA Ischaemic Stroke | Advanced |

---

## 🤖 AI Architecture

| Component | Type | Notes |
|-----------|------|-------|
| Clinical findings | **Deterministic** | Always from scenario data |
| Vital signs | **Deterministic** | Always from scenario data |
| Investigation results | **Deterministic** | Always from scenario data |
| Scoring | **Deterministic** | Weighted rubric |
| Patient conversation | **AI** | Claude/OpenAI/Fallback |
| Feedback | **AI** | Grounded in recorded actions |
| Debriefing | **AI** | Plus-Delta structured |

**AI provider priority:** `ANTHROPIC_API_KEY` → `OPENAI_API_KEY` → built-in fallback (no API needed)

---

## 📊 Scoring Weights

| Category | Weight |
|----------|--------|
| Communication | 10% |
| History Taking | 15% |
| Examination | 25% |
| Clinical Reasoning | 20% |
| Investigations | 10% |
| Diagnosis | 10% |
| Professionalism | 5% |
| Documentation | 5% |

---

## 🔌 API Endpoints

```
POST /api/auth/register
POST /api/auth/login

GET  /api/scenarios
GET  /api/scenarios/{id}

POST /api/sessions
GET  /api/sessions/{id}
POST /api/sessions/{id}/conversation
GET  /api/sessions/{id}/vitals
GET  /api/sessions/{id}/allowed-methods/{region}
POST /api/sessions/{id}/examination
POST /api/sessions/{id}/investigation
POST /api/sessions/{id}/position
POST /api/sessions/{id}/diagnosis
POST /api/sessions/{id}/complete
GET  /api/sessions/{id}/assessment

GET  /api/analytics/student
GET  /api/analytics/faculty
```

---

## ⚠️ Clinical Disclaimer

All patient cases are **entirely synthetic** — for educational use only. No real patient data. Must not be used for clinical decision-making.
