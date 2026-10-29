from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload
from sqlalchemy.orm.attributes import flag_modified
from app.core.database import get_db
from app.api.deps import get_current_user
from app.models import User, Scenario, SimulationSession, ConversationMessage, StudentAction, SessionStatus
from app.schemas import (
    CreateSessionRequest, SessionOut, ConversationRequest, ConversationResponse,
    ExaminationRequest, ExaminationResult, InvestigationRequest, DiagnosisRequest,
    AssessmentOut, MessageOut
)
from app.clinical.engine import clinical_engine
from app.clinical.instrument_validation import validate_instrument
from app.clinical import measurements, stations as exam_stations
from app.schemas import MeasureRequest, ActionRequest
from app.ai.provider import ai_provider
import asyncio
from datetime import datetime, timezone

router = APIRouter(prefix="/sessions", tags=["Simulation Sessions"])


def get_session_or_404(session_id: str, user_id: str, db: Session) -> SimulationSession:
    session = (
        db.query(SimulationSession)
        .options(selectinload(SimulationSession.messages))
        .filter(SimulationSession.id == session_id, SimulationSession.user_id == user_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


def log_action(db: Session, session_id: str, action_type: str, action_data: dict):
    db.add(StudentAction(session_id=session_id, action_type=action_type, action_data=action_data))


@router.post("", response_model=SessionOut)
def create_session(data: CreateSessionRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    scenario = db.query(Scenario).filter(Scenario.id == data.scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    session = SimulationSession(
        user_id=current_user.id,
        scenario_id=data.scenario_id,
        status=SessionStatus.CREATED,
        patient_position=scenario.patient_position or "supine",
    )
    db.add(session)
    db.flush()
    log_action(db, session.id, "scenario_started", {"scenario_id": data.scenario_id, "title": scenario.title})
    db.commit()
    db.refresh(session)
    return session


@router.get("/{session_id}", response_model=SessionOut)
def get_session(session_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return get_session_or_404(session_id, current_user.id, db)


@router.get("/{session_id}/messages", response_model=list[MessageOut])
def get_messages(session_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    get_session_or_404(session_id, current_user.id, db)
    return (db.query(ConversationMessage)
            .filter(ConversationMessage.session_id == session_id)
            .order_by(ConversationMessage.created_at.asc())
            .all())


@router.post("/{session_id}/conversation", response_model=ConversationResponse)
def send_message(session_id: str, data: ConversationRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    session = get_session_or_404(session_id, current_user.id, db)
    scenario = db.query(Scenario).filter(Scenario.id == session.scenario_id).first()

    if session.status == SessionStatus.CREATED:
        session.status = SessionStatus.HISTORY_TAKING

    # Special trigger: patient opens the consultation in their own words (spoken aloud by the browser)
    if data.message == '[START_CONSULTATION]':
        already = (db.query(ConversationMessage).filter(ConversationMessage.session_id == session_id)
                   .order_by(ConversationMessage.created_at.asc()).first())
        if already:
            return ConversationResponse(patient_response=already.content if already.role == 'patient' else '', stage='greeting', history_items_obtained=[])
        from app.ai.patient_voice import opening_line
        opening = opening_line({
            "scenario_title": scenario.title, "patient_name": scenario.patient_name,
            "patient_age": scenario.patient_age, "patient_personality": scenario.patient_personality,
            "history_data": scenario.history_data,
        }) or ("Hello, doctor. " + (scenario.chief_complaint or "I haven't been feeling well") + ".")
        patient_msg = ConversationMessage(
            session_id=session_id, role="patient", content=opening, stage="greeting"
        )
        db.add(patient_msg)
        db.commit()
        return ConversationResponse(patient_response=opening, stage="greeting", history_items_obtained=[])

    student_msg = ConversationMessage(session_id=session_id, role="student", content=data.message, stage=data.stage)
    db.add(student_msg)
    db.flush()

    history = [
        {"role": "user" if m.role == "student" else "assistant", "content": m.content}
        for m in session.messages if m.id != student_msg.id
    ][-12:]

    scenario_dict = {
        "patient_name": scenario.patient_name, "patient_age": scenario.patient_age,
        "patient_sex": scenario.patient_sex, "chief_complaint": scenario.chief_complaint,
        "patient_personality": scenario.patient_personality, "diagnosis": scenario.diagnosis,
        "history_data": scenario.history_data, "emotional_state": scenario.patient_personality,
        "scenario_title": scenario.title,
    }

    try:
        loop = asyncio.new_event_loop()
        patient_response = loop.run_until_complete(
            ai_provider.generate_patient_response(scenario_dict, history, data.message, data.stage)
        )
        loop.close()
    except Exception:
        patient_response = "Could you repeat that? I'm feeling a little distracted."

    db.add(ConversationMessage(session_id=session_id, role="patient", content=patient_response, stage=data.stage))

    # Extract history items
    history_obtained = dict(session.history_obtained or {})
    msg_lower = data.message.lower()
    if any(w in msg_lower for w in ["pain", "complaint", "problem", "reason", "here", "bother", "bring"]):
        history_obtained["presenting_complaint"] = patient_response[:120]
    if any(w in msg_lower for w in ["how long", "when", "start", "duration", "began", "since"]):
        history_obtained["hpi"] = patient_response[:120]
    if any(w in msg_lower for w in ["past", "history", "before", "previous", "medical", "condition"]):
        history_obtained["past_medical_history"] = patient_response[:120]
    if any(w in msg_lower for w in ["medication", "tablet", "drug", "medicine", "taking", "pill"]):
        history_obtained["medications"] = patient_response[:120]
    if any(w in msg_lower for w in ["allerg", "reaction"]):
        history_obtained["allergies"] = patient_response[:120]
    if any(w in msg_lower for w in ["family", "parent", "sibling", "father", "mother"]):
        history_obtained["family_history"] = patient_response[:120]
    if any(w in msg_lower for w in ["smoke", "alcohol", "drink", "work", "occup", "social"]):
        history_obtained["social_history"] = patient_response[:120]

    session.history_obtained = history_obtained
    flag_modified(session, "history_obtained")
    log_action(db, session_id, "question_asked", {"question": data.message, "stage": data.stage})
    db.commit()

    return ConversationResponse(
        patient_response=patient_response, stage=data.stage,
        history_items_obtained=list(history_obtained.keys()),
    )


@router.post("/{session_id}/examination", response_model=ExaminationResult)
def perform_examination(session_id: str, data: ExaminationRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    session = get_session_or_404(session_id, current_user.id, db)
    scenario = db.query(Scenario).filter(Scenario.id == session.scenario_id).first()

    # Validate allowed methods for region
    allowed = clinical_engine.get_allowed_methods(data.region)
    if data.method not in allowed:
        raise HTTPException(status_code=400, detail=f"'{data.method}' is not applicable to '{data.region}'. Allowed: {allowed}")

    # Validate instrument (backend is authoritative)
    is_valid, msg = validate_instrument(data.region, data.method, data.instrument)
    if not is_valid:
        raise HTTPException(status_code=400, detail=msg)

    if session.status in [SessionStatus.CREATED, SessionStatus.HISTORY_TAKING]:
        session.status = SessionStatus.EXAMINATION

    finding = clinical_engine.get_examination_finding(scenario, data.region, data.method)

    exams_done = list(session.examinations_performed or [])
    already_done = any(e.get("region") == data.region and e.get("method") == data.method for e in exams_done)

    if not already_done:
        exams_done.append({
            "region": data.region, "method": data.method,
            "instrument": data.instrument, "key": f"{data.region}.{data.method}",
        })
        session.examinations_performed = exams_done
        flag_modified(session, "examinations_performed")

        if finding.get("is_abnormal"):
            findings = list(session.findings_revealed or [])
            findings.append({
                "region": data.region, "method": data.method,
                "finding": finding["finding"], "is_abnormal": True,
            })
            session.findings_revealed = findings
            flag_modified(session, "findings_revealed")

        log_action(db, session_id, "examination_performed", {
            "region": data.region, "method": data.method,
            "instrument": data.instrument,
            "finding": finding["finding"], "abnormal": finding.get("is_abnormal", False),
        })

    if already_done and data.instrument:
        for e in exams_done:
            if e.get("region") == data.region and e.get("method") == data.method and not e.get("instrument"):
                e["instrument"] = data.instrument
                session.examinations_performed = exams_done
                flag_modified(session, "examinations_performed")

    db.commit()
    result = ExaminationResult(
        finding=finding["finding"],
        description=finding["description"],
        is_abnormal=finding["is_abnormal"],
        clinical_significance=finding.get("clinical_significance", ""),
        recorded=not already_done,
    )
    if msg:  # instrument warning (non-blocking)
        result.instrument_note = msg
    return result


@router.get("/{session_id}/vitals")
def get_vitals(session_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    session = get_session_or_404(session_id, current_user.id, db)
    scenario = db.query(Scenario).filter(Scenario.id == session.scenario_id).first()
    vitals = clinical_engine.get_vital_signs(scenario)
    log_action(db, session_id, "vitals_checked", {"vitals": vitals})
    db.commit()
    return vitals


def _station_inputs(db: Session, session: SimulationSession):
    said = [m.content for m in db.query(ConversationMessage)
            .filter(ConversationMessage.session_id == session.id, ConversationMessage.role == "student").all()]
    actions = {a.action_type for a in db.query(StudentAction).filter(StudentAction.session_id == session.id).all()}
    return said, actions


@router.post("/{session_id}/measure")
def measure_vital(session_id: str, data: MeasureRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Take a vital sign with the right instrument, at the right site, for long enough."""
    session = get_session_or_404(session_id, current_user.id, db)
    scenario = db.query(Scenario).filter(Scenario.id == session.scenario_id).first()
    try:
        r = measurements.measure(scenario, data.vital, data.instrument, data.site, data.seconds)
    except measurements.MeasureError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if session.status in [SessionStatus.CREATED, SessionStatus.HISTORY_TAKING]:
        session.status = SessionStatus.EXAMINATION
    exams = list(session.examinations_performed or [])
    entry = {"region": r["region"], "method": "measure", "instrument": data.instrument, "site": r.get("site"),
             "key": f"{r['region']}.measure", "adequate": r["adequate"]}
    existing = next((e for e in exams if e.get("region") == entry["region"] and e.get("method") == "measure"
                     and e.get("site") == entry["site"]), None)
    if existing is None:
        exams.append(entry)
    elif r["adequate"] and not existing.get("adequate", True):
        existing.update(entry)
    session.examinations_performed = exams
    flag_modified(session, "examinations_performed")
    log_action(db, session_id, "measurement_performed", {"vital": data.vital, "instrument": data.instrument,
                                                         "site": r.get("site"), "value": r.get("value"), "adequate": r["adequate"]})
    db.commit()
    return r


@router.post("/{session_id}/action")
def station_action(session_id: str, data: ActionRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    session = get_session_or_404(session_id, current_user.id, db)
    if data.action not in ("hand_hygiene",):
        raise HTTPException(status_code=400, detail=f"Unknown action '{data.action}'")
    log_action(db, session_id, data.action, {})
    db.commit()
    return {"action": data.action, "message": "You wash your hands thoroughly with soap and water."}


@router.get("/{session_id}/stations")
def get_stations(session_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    session = get_session_or_404(session_id, current_user.id, db)
    said, actions = _station_inputs(db, session)
    return exam_stations.evaluate(session, said, actions)


@router.get("/{session_id}/allowed-methods/{region}")
def get_allowed_methods(session_id: str, region: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return {"region": region, "allowed_methods": clinical_engine.get_allowed_methods(region)}


@router.post("/{session_id}/investigation")
def order_investigation(session_id: str, data: InvestigationRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    session = get_session_or_404(session_id, current_user.id, db)
    scenario = db.query(Scenario).filter(Scenario.id == session.scenario_id).first()

    if session.status in [SessionStatus.CREATED, SessionStatus.HISTORY_TAKING, SessionStatus.EXAMINATION]:
        session.status = SessionStatus.INVESTIGATION

    result = clinical_engine.get_investigation_result(scenario, data.investigation)
    ordered = list(session.investigations_ordered or [])
    if data.investigation not in ordered:
        ordered.append(data.investigation)
        session.investigations_ordered = ordered
        flag_modified(session, "investigations_ordered")

    log_action(db, session_id, "investigation_ordered", {"investigation": data.investigation})
    db.commit()
    return result


@router.post("/{session_id}/position")
def update_position(session_id: str, position: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Persist patient position in session state."""
    session = get_session_or_404(session_id, current_user.id, db)
    valid_positions = ["standing", "sitting", "supine", "semi_recumbent"]
    pos = position.get("position", "supine")
    if pos not in valid_positions:
        raise HTTPException(status_code=400, detail=f"Invalid position. Must be one of: {valid_positions}")

    session.patient_position = pos  # PERSISTED to database
    log_action(db, session_id, "position_changed", {"position": pos})
    db.commit()
    return {"position": pos, "persisted": True}


@router.post("/{session_id}/diagnosis")
def submit_diagnosis(session_id: str, data: DiagnosisRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    session = get_session_or_404(session_id, current_user.id, db)
    scenario = db.query(Scenario).filter(Scenario.id == session.scenario_id).first()

    session.student_diagnosis = data.primary_diagnosis
    session.student_differentials = data.differentials
    session.student_reasoning = data.reasoning
    session.status = SessionStatus.DIAGNOSIS

    evaluation = clinical_engine.evaluate_diagnosis(scenario, data.primary_diagnosis, data.differentials)
    log_action(db, session_id, "diagnosis_submitted", {"diagnosis": data.primary_diagnosis, "is_correct": evaluation["is_correct"]})
    db.commit()
    return {"status": "submitted", "evaluation": evaluation}


@router.post("/{session_id}/complete", response_model=AssessmentOut)
def complete_session(session_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    session = db.query(SimulationSession).options(
        selectinload(SimulationSession.messages),
        selectinload(SimulationSession.actions),
    ).filter(SimulationSession.id == session_id, SimulationSession.user_id == current_user.id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    scenario = db.query(Scenario).filter(Scenario.id == session.scenario_id).first()
    score_result = clinical_engine.calculate_score(session, scenario)
    session.total_score = score_result["total_score"]
    session.score_breakdown = score_result["breakdown"]
    session.status = SessionStatus.COMPLETED
    session.completed_at = datetime.now(timezone.utc)

    session_dict = {
        "total_score": session.total_score, "score_breakdown": session.score_breakdown,
        "history_obtained": session.history_obtained, "examinations_performed": session.examinations_performed,
        "findings_revealed": session.findings_revealed, "investigations_ordered": session.investigations_ordered,
        "student_diagnosis": session.student_diagnosis, "student_differentials": session.student_differentials,
        "student_reasoning": session.student_reasoning,
    }
    scenario_dict = {"title": scenario.title, "diagnosis": scenario.diagnosis,
                     "differential_diagnoses": scenario.differential_diagnoses}

    try:
        loop = asyncio.new_event_loop()
        feedback = loop.run_until_complete(ai_provider.generate_feedback(session_dict, scenario_dict))
        debriefing = loop.run_until_complete(ai_provider.generate_debriefing(session_dict, scenario_dict))
        loop.close()
    except Exception:
        feedback = f"You completed {scenario.title} with {session.total_score:.1f}%."
        debriefing = {
            "what_went_well": ["Completed simulation"],
            "areas_to_improve": ["Systematic examination"],
            "missed_findings": [], "reasoning_errors": [],
            "learning_points": ["Be systematic"],
            "reflection_questions": ["What would you change?"],
            "correct_diagnosis_explanation": f"Correct diagnosis: {scenario.diagnosis}",
            "key_differentials": scenario.differential_diagnoses[:3],
        }

    said, actions = _station_inputs(db, session)
    debriefing["exam_checklists"] = exam_stations.summary(session, said, actions)
    session.ai_feedback = feedback
    session.debriefing = debriefing
    flag_modified(session, "debriefing")
    log_action(db, session_id, "scenario_completed", {"score": session.total_score})
    db.commit()

    breakdown = score_result["breakdown"]
    strengths = [f"Strong in {cat}" for cat, sc in breakdown.items() if sc >= 70]
    weaknesses = [f"Improve {cat}" for cat, sc in breakdown.items() if sc < 50]

    return AssessmentOut(
        session_id=session_id, total_score=session.total_score, score_breakdown=breakdown,
        ai_feedback=feedback, debriefing=debriefing,
        strengths=strengths, weaknesses=weaknesses,
        recommendations=debriefing.get("learning_points", [])[:3],
    )


@router.get("/{session_id}/assessment", response_model=AssessmentOut)
def get_assessment(session_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    session = get_session_or_404(session_id, current_user.id, db)
    if session.status != SessionStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Session not yet completed")
    breakdown = session.score_breakdown or {}
    debriefing = session.debriefing or {}
    return AssessmentOut(
        session_id=session_id, total_score=session.total_score or 0, score_breakdown=breakdown,
        ai_feedback=session.ai_feedback or "", debriefing=debriefing,
        strengths=[f"Strong in {cat}" for cat, sc in breakdown.items() if sc >= 70],
        weaknesses=[f"Improve {cat}" for cat, sc in breakdown.items() if sc < 50],
        recommendations=debriefing.get("learning_points", [])[:3],
    )
