from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.routes import auth, scenarios, sessions, analytics
from app.core.database import engine
from app.models import Base
from app.core.migrations import run_migrations

# Create tables then migrate
Base.metadata.create_all(bind=engine)
run_migrations()

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    description="AI-Powered 3D Clinical Reasoning & Virtual Patient Learning Platform",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(scenarios.router, prefix="/api")
app.include_router(sessions.router, prefix="/api")
app.include_router(analytics.router, prefix="/api")


@app.get("/")
def root():
    return {"message": "ClinicalSim AI API", "version": settings.VERSION, "status": "healthy"}


@app.get("/health")
def health():
    return {"status": "healthy"}
