"""
Seed the database with demo users and clinical scenarios.
Run: python seed.py
"""
import sys
sys.path.insert(0, ".")

from app.core.database import SessionLocal, engine
from app.models import Base, User, Scenario, UserRole, Difficulty
from app.core.security import hash_password
from app.clinical.seed_scenarios import SCENARIOS


def seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        # Demo users
        users_data = [
            {"email": "student@example.com", "password": "student123", "full_name": "Alex Student", "role": UserRole.STUDENT},
            {"email": "faculty@example.com", "password": "faculty123", "full_name": "Dr. Sarah Faculty", "role": UserRole.FACULTY},
            {"email": "admin@example.com", "password": "admin123", "full_name": "Admin User", "role": UserRole.ADMIN},
        ]

        for u_data in users_data:
            existing = db.query(User).filter(User.email == u_data["email"]).first()
            if not existing:
                user = User(
                    email=u_data["email"],
                    hashed_password=hash_password(u_data["password"]),
                    full_name=u_data["full_name"],
                    role=u_data["role"],
                )
                db.add(user)
                print(f"Created user: {u_data['email']}")

        db.flush()

        # Get faculty user for scenario authorship
        faculty = db.query(User).filter(User.email == "faculty@example.com").first()

        # Seed scenarios
        for s_data in SCENARIOS:
            existing = db.query(Scenario).filter(Scenario.title == s_data["title"]).first()
            if not existing:
                scenario = Scenario(
                    title=s_data["title"],
                    specialty=s_data["specialty"],
                    difficulty=Difficulty[s_data["difficulty"]],
                    description=s_data["description"],
                    estimated_duration=s_data["estimated_duration"],
                    learning_objectives=s_data["learning_objectives"],
                    patient_name=s_data["patient_name"],
                    patient_age=s_data["patient_age"],
                    patient_sex=s_data["patient_sex"],
                    patient_personality=s_data["patient_personality"],
                    patient_position=s_data["patient_position"],
                    chief_complaint=s_data["chief_complaint"],
                    diagnosis=s_data["diagnosis"],
                    history_data=s_data["history_data"],
                    vital_signs=s_data["vital_signs"],
                    examination_findings=s_data["examination_findings"],
                    investigations=s_data["investigations"],
                    differential_diagnoses=s_data["differential_diagnoses"],
                    assessment_rubric=s_data["assessment_rubric"],
                    is_published=True,
                    created_by=faculty.id if faculty else None,
                )
                db.add(scenario)
                print(f"Created scenario: {s_data['title']}")

        db.commit()
        print("\n✅ Database seeded successfully!")
        print("\nDemo credentials:")
        print("  student@example.com / student123")
        print("  faculty@example.com / faculty123")
        print("  admin@example.com / admin123")

    except Exception as e:
        db.rollback()
        print(f"Error seeding: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
