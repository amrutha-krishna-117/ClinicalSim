import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import (
    String, Integer, Float, Boolean, Text, DateTime, ForeignKey,
    JSON, Enum as SQLEnum
)
from sqlalchemy.orm import relationship, mapped_column, Mapped
from app.core.database import Base
import enum


def utcnow():
    return datetime.now(timezone.utc)


class UserRole(str, enum.Enum):
    STUDENT = "STUDENT"
    FACULTY = "FACULTY"
    ADMIN = "ADMIN"


class SessionStatus(str, enum.Enum):
    CREATED = "CREATED"
    HISTORY_TAKING = "HISTORY_TAKING"
    EXAMINATION = "EXAMINATION"
    INVESTIGATION = "INVESTIGATION"
    REASONING = "REASONING"
    DIAGNOSIS = "DIAGNOSIS"
    ASSESSMENT = "ASSESSMENT"
    COMPLETED = "COMPLETED"


class Difficulty(str, enum.Enum):
    BEGINNER = "BEGINNER"
    INTERMEDIATE = "INTERMEDIATE"
    ADVANCED = "ADVANCED"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(SQLEnum(UserRole), default=UserRole.STUDENT)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    sessions: Mapped[list["SimulationSession"]] = relationship("SimulationSession", back_populates="user")
    competencies: Mapped[list["StudentCompetency"]] = relationship("StudentCompetency", back_populates="user")


class Scenario(Base):
    __tablename__ = "scenarios"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title: Mapped[str] = mapped_column(String(255))
    specialty: Mapped[str] = mapped_column(String(100))
    difficulty: Mapped[Difficulty] = mapped_column(SQLEnum(Difficulty), default=Difficulty.INTERMEDIATE)
    description: Mapped[str] = mapped_column(Text)
    estimated_duration: Mapped[int] = mapped_column(Integer, default=20)  # minutes
    learning_objectives: Mapped[dict] = mapped_column(JSON, default=list)
    is_published: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    # Patient configuration
    patient_name: Mapped[str] = mapped_column(String(100), default="Patient")
    patient_age: Mapped[int] = mapped_column(Integer, default=45)
    patient_sex: Mapped[str] = mapped_column(String(10), default="male")
    patient_personality: Mapped[str] = mapped_column(String(50), default="cooperative")
    patient_position: Mapped[str] = mapped_column(String(50), default="sitting")
    chief_complaint: Mapped[str] = mapped_column(String(255))
    diagnosis: Mapped[str] = mapped_column(String(255))

    # Clinical data
    history_data: Mapped[dict] = mapped_column(JSON, default=dict)
    vital_signs: Mapped[dict] = mapped_column(JSON, default=dict)
    examination_findings: Mapped[dict] = mapped_column(JSON, default=dict)
    investigations: Mapped[dict] = mapped_column(JSON, default=dict)
    differential_diagnoses: Mapped[list] = mapped_column(JSON, default=list)
    assessment_rubric: Mapped[dict] = mapped_column(JSON, default=dict)

    sessions: Mapped[list["SimulationSession"]] = relationship("SimulationSession", back_populates="scenario")


class SimulationSession(Base):
    __tablename__ = "simulation_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"))
    scenario_id: Mapped[str] = mapped_column(String(36), ForeignKey("scenarios.id"))
    status: Mapped[SessionStatus] = mapped_column(SQLEnum(SessionStatus), default=SessionStatus.CREATED)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Patient position (persisted)
    patient_position: Mapped[str] = mapped_column(String(50), default='supine')

    # Recorded student work
    history_obtained: Mapped[dict] = mapped_column(JSON, default=dict)
    examinations_performed: Mapped[list] = mapped_column(JSON, default=list)
    findings_revealed: Mapped[list] = mapped_column(JSON, default=list)
    investigations_ordered: Mapped[list] = mapped_column(JSON, default=list)
    student_diagnosis: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    student_differentials: Mapped[list] = mapped_column(JSON, default=list)
    student_reasoning: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Score
    total_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    score_breakdown: Mapped[dict] = mapped_column(JSON, default=dict)
    ai_feedback: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    debriefing: Mapped[dict] = mapped_column(JSON, default=dict)

    user: Mapped["User"] = relationship("User", back_populates="sessions")
    scenario: Mapped["Scenario"] = relationship("Scenario", back_populates="sessions")
    messages: Mapped[list["ConversationMessage"]] = relationship(
        "ConversationMessage", back_populates="session", order_by="ConversationMessage.created_at"
    )
    actions: Mapped[list["StudentAction"]] = relationship("StudentAction", back_populates="session")


class ConversationMessage(Base):
    __tablename__ = "conversation_messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id: Mapped[str] = mapped_column(String(36), ForeignKey("simulation_sessions.id"))
    role: Mapped[str] = mapped_column(String(20))  # "student" or "patient"
    content: Mapped[str] = mapped_column(Text)
    stage: Mapped[str] = mapped_column(String(50), default="general")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    session: Mapped["SimulationSession"] = relationship("SimulationSession", back_populates="messages")


class StudentAction(Base):
    __tablename__ = "student_actions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id: Mapped[str] = mapped_column(String(36), ForeignKey("simulation_sessions.id"))
    action_type: Mapped[str] = mapped_column(String(100))
    action_data: Mapped[dict] = mapped_column(JSON, default=dict)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    session: Mapped["SimulationSession"] = relationship("SimulationSession", back_populates="actions")


class StudentCompetency(Base):
    __tablename__ = "student_competencies"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"))
    competency: Mapped[str] = mapped_column(String(100))
    score: Mapped[float] = mapped_column(Float, default=0.0)
    cases_count: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    user: Mapped["User"] = relationship("User", back_populates="competencies")
