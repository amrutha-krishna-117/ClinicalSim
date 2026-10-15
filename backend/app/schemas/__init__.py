from pydantic import BaseModel, EmailStr
from typing import Optional, Any
from datetime import datetime
from app.models import UserRole, SessionStatus, Difficulty


# Auth
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: UserRole = UserRole.STUDENT


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"


class UserOut(BaseModel):
    id: str
    email: str
    full_name: str
    role: UserRole
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# Scenarios
class ScenarioOut(BaseModel):
    id: str
    title: str
    specialty: str
    difficulty: Difficulty
    description: str
    estimated_duration: int
    learning_objectives: list
    patient_age: int
    patient_sex: str
    patient_position: str
    chief_complaint: str
    diagnosis: str
    is_published: bool

    model_config = {"from_attributes": True}


class ScenarioDetail(ScenarioOut):
    history_data: dict
    vital_signs: dict
    examination_findings: dict
    investigations: dict
    differential_diagnoses: list
    assessment_rubric: dict


# Sessions
class CreateSessionRequest(BaseModel):
    scenario_id: str


class SessionOut(BaseModel):
    id: str
    user_id: str
    scenario_id: str
    status: SessionStatus
    started_at: datetime
    completed_at: Optional[datetime]
    history_obtained: dict
    examinations_performed: list
    findings_revealed: list
    investigations_ordered: list
    patient_position: str
    student_diagnosis: Optional[str]
    student_differentials: list
    total_score: Optional[float]
    score_breakdown: dict

    model_config = {"from_attributes": True}


# Conversation
class ConversationRequest(BaseModel):
    message: str
    stage: str = "general"


class ConversationResponse(BaseModel):
    patient_response: str
    stage: str
    history_items_obtained: list[str] = []


class MessageOut(BaseModel):
    id: str
    role: str
    content: str
    stage: str
    created_at: datetime

    model_config = {"from_attributes": True}


# Examination
class ExaminationRequest(BaseModel):
    region: str
    method: str  # inspect, palpate, percuss, auscultate, measure
    instrument: Optional[str] = None  # stethoscope, bp_cuff, etc.
    patient_position: Optional[str] = None  # supine, sitting, etc.


class ExaminationResult(BaseModel):
    finding: str
    description: str
    is_abnormal: bool
    clinical_significance: str
    recorded: bool
    instrument_note: Optional[str] = None


# Investigation
class InvestigationRequest(BaseModel):
    investigation: str


class InvestigationResult(BaseModel):
    name: str
    result: dict
    interpretation: str
    is_appropriate: bool


# Diagnosis
class DiagnosisRequest(BaseModel):
    primary_diagnosis: str
    differentials: list[str]
    confidence: int  # 0-100
    reasoning: str


# Assessment
class AssessmentOut(BaseModel):
    session_id: str
    total_score: float
    score_breakdown: dict
    ai_feedback: str
    debriefing: dict
    strengths: list[str]
    weaknesses: list[str]
    recommendations: list[str]


# Analytics
class StudentAnalytics(BaseModel):
    total_cases: int
    average_score: float
    competency_scores: dict
    recent_sessions: list


TokenResponse.model_rebuild()
