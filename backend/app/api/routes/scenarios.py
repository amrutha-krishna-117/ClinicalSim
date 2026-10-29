from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.api.deps import get_current_user, require_faculty
from app.models import User, Scenario
from app.schemas import ScenarioOut, ScenarioDetail
from typing import Optional

router = APIRouter(prefix="/scenarios", tags=["Scenarios"])


@router.get("", response_model=list[ScenarioOut])
def list_scenarios(
    specialty: Optional[str] = None,
    difficulty: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Scenario).filter(Scenario.is_published == True)
    if specialty:
        query = query.filter(Scenario.specialty == specialty)
    if difficulty:
        query = query.filter(Scenario.difficulty == difficulty)
    return query.all()


@router.get("/{scenario_id}", response_model=ScenarioDetail)
def get_scenario(
    scenario_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return scenario
