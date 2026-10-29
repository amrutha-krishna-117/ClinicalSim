from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.core.database import get_db
from app.api.deps import get_current_user
from app.models import User, SimulationSession, Scenario, SessionStatus

router = APIRouter(prefix="/analytics", tags=["Analytics"])


@router.get("/student")
def get_student_analytics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sessions = (
        db.query(SimulationSession)
        .filter(
            SimulationSession.user_id == current_user.id,
            SimulationSession.status == SessionStatus.COMPLETED,
        )
        .all()
    )

    total_cases = len(sessions)
    avg_score = sum(s.total_score or 0 for s in sessions) / total_cases if total_cases else 0

    # Competency aggregation
    all_breakdowns = [s.score_breakdown for s in sessions if s.score_breakdown]
    competency_scores = {}
    if all_breakdowns:
        keys = set(k for bd in all_breakdowns for k in bd.keys())
        for key in keys:
            vals = [bd[key] for bd in all_breakdowns if key in bd]
            competency_scores[key] = round(sum(vals) / len(vals), 1)

    # Recent sessions
    recent = sorted(sessions, key=lambda s: s.started_at, reverse=True)[:5]
    recent_data = []
    for s in recent:
        scenario = db.query(Scenario).filter(Scenario.id == s.scenario_id).first()
        recent_data.append({
            "session_id": s.id,
            "scenario_title": scenario.title if scenario else "Unknown",
            "score": s.total_score,
            "date": s.started_at.isoformat(),
            "specialty": scenario.specialty if scenario else "",
        })

    # Performance trend
    trend = []
    for s in sorted(sessions, key=lambda s: s.started_at):
        trend.append({
            "date": s.started_at.strftime("%b %d"),
            "score": s.total_score or 0,
        })

    return {
        "total_cases": total_cases,
        "average_score": round(avg_score, 1),
        "competency_scores": competency_scores,
        "recent_sessions": recent_data,
        "performance_trend": trend,
    }


@router.get("/faculty")
def get_faculty_analytics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # All completed sessions
    sessions = db.query(SimulationSession).filter(
        SimulationSession.status == SessionStatus.COMPLETED
    ).all()

    total = len(sessions)
    avg = sum(s.total_score or 0 for s in sessions) / total if total else 0

    # Per scenario stats
    scenario_stats = {}
    for s in sessions:
        sid = s.scenario_id
        if sid not in scenario_stats:
            scenario_stats[sid] = {"count": 0, "total_score": 0}
        scenario_stats[sid]["count"] += 1
        scenario_stats[sid]["total_score"] += s.total_score or 0

    scenarios_data = []
    for sid, stats in scenario_stats.items():
        scenario = db.query(Scenario).filter(Scenario.id == sid).first()
        if scenario:
            scenarios_data.append({
                "scenario": scenario.title,
                "count": stats["count"],
                "avg_score": round(stats["total_score"] / stats["count"], 1),
            })

    return {
        "total_sessions": total,
        "average_score": round(avg, 1),
        "scenario_stats": scenarios_data,
        "active_students": db.query(func.count(func.distinct(SimulationSession.user_id))).scalar(),
    }


@router.get("/faculty/enhanced")
def get_faculty_enhanced_analytics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Enhanced faculty analytics with student drill-down and scenario stats."""
    if current_user.role.value not in ['FACULTY', 'ADMIN']:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Faculty access required")

    all_sessions = db.query(SimulationSession).all()
    completed = [s for s in all_sessions if s.status == SessionStatus.COMPLETED]

    # Per-student stats
    students = db.query(User).filter(User.role == 'STUDENT').all()
    student_perf = []
    for st in students:
        st_sessions = [s for s in completed if s.user_id == st.id]
        if not st_sessions:
            continue
        scores = [s.total_score or 0 for s in st_sessions]
        dx_correct = sum(1 for s in st_sessions
                         if s.student_diagnosis and s.student_diagnosis.lower() in
                         (db.query(Scenario).filter(Scenario.id == s.scenario_id).first().diagnosis or '').lower())
        last = max(st_sessions, key=lambda s: s.started_at)
        student_perf.append({
            "name": st.full_name, "email": st.email,
            "total_cases": len(st_sessions),
            "average_score": round(sum(scores)/len(scores), 1),
            "diagnosis_accuracy": round(dx_correct/len(st_sessions)*100, 1),
            "last_active": last.started_at.isoformat(),
        })

    # Per-scenario stats
    scenarios = db.query(Scenario).all()
    scenario_stats = []
    for sc in scenarios:
        sc_sessions = [s for s in completed if s.scenario_id == sc.id]
        if not sc_sessions:
            continue
        scores = [s.total_score or 0 for s in sc_sessions]
        dx_ok = sum(1 for s in sc_sessions if s.student_diagnosis and
                    s.student_diagnosis.lower() in (sc.diagnosis or '').lower())
        scenario_stats.append({
            "title": sc.title, "specialty": sc.specialty,
            "difficulty": sc.difficulty.value if hasattr(sc.difficulty,'value') else str(sc.difficulty),
            "count": len(sc_sessions),
            "avg_score": round(sum(scores)/len(scores), 1),
            "diagnosis_rate": round(dx_ok/len(sc_sessions)*100, 1),
        })
    scenario_stats.sort(key=lambda x: x["count"], reverse=True)

    total_sc = len(all_sessions)
    avg_sc = round(sum(s.total_score or 0 for s in completed)/len(completed), 1) if completed else 0

    return {
        "total_sessions": total_sc,
        "completed_sessions": len(completed),
        "active_students": len([u for u in students]),
        "average_score": avg_sc,
        "student_performance": student_perf,
        "scenario_statistics": scenario_stats,
    }
