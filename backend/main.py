"""
MindCare AI — FastAPI backend

Endpoints:
  POST /predict   -> runs the real trained ML model (Mental_Health_Model.pkl) and
                      returns a predicted_mental_health_score. No mock/fake results.
  POST /chat       -> forwards a message + assessment context to Gemini and returns
                      a supportive, non-diagnostic wellness reply. The Gemini API key
                      never leaves the backend.
  GET  /health     -> simple liveness check the frontend can use to detect that the
                      API is reachable.

Run locally:
  pip install -r requirements.txt
  uvicorn main:app --reload --port 8000
"""

import logging
import os
import hashlib
import secrets
from datetime import datetime, timedelta
from typing import Any, Dict, List, Literal, Optional

import joblib
from dataframe_shim import pd
import json
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Response, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db, init_db, SessionLocal
from models import User, Assessment, PasswordResetToken, MoodEntry, JournalEntry, Goal, ChatMessage
from auth import (
    hash_password, verify_password, create_access_token,
    get_current_user, get_current_admin_user, security_bearer, decode_access_token
)
import report_generator
import email_service
from email_service import EmailDeliveryError

env_path = os.path.join(os.path.dirname(__file__), ".env")
load_dotenv(dotenv_path=env_path)
load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("mindcare-ai")

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

def _get_allowed_origins() -> List[str]:
    # Standard development origins
    default_dev = [
        "http://127.0.0.1:5500",
        "http://localhost:5500",
        "http://127.0.0.1:8000",
        "http://localhost:8000",
        "http://127.0.0.1:3000",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    ]
    frontend_env = os.getenv("FRONTEND_URL", "").strip().rstrip("/")
    if frontend_env and frontend_env not in default_dev:
        default_dev.append(frontend_env)

    custom_origins = os.getenv("ALLOWED_ORIGINS", os.getenv("CORS_ORIGINS", "")).strip()
    if custom_origins:
        if custom_origins == "*":
            return ["*"]
        return [orig.strip().rstrip("/") for orig in custom_origins.split(",") if orig.strip()]

    return default_dev

allowed_origins = _get_allowed_origins()
allow_creds = allowed_origins != ["*"]

app = FastAPI(title="MindCare AI API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=allow_creds,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

# ---------------------------------------------------------------------------
# Database & ML model loading
# ---------------------------------------------------------------------------

MODEL_PATH = os.path.join(os.path.dirname(__file__), "Mental_Health_Model.pkl")
model = None


def bootstrap_admin_user() -> None:
    """Ensure an administrator account exists on startup using environment variables."""
    admin_email = os.getenv("ADMIN_EMAIL", "admin@mindcare.ai").strip().lower()
    admin_password = os.getenv("ADMIN_PASSWORD", "AdminSecurePass2026!")
    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.email == admin_email).first()
        if not admin:
            admin = User(
                name="Administrator",
                email=admin_email,
                password_hash=hash_password(admin_password),
                role="admin",
                status="active",
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )
            db.add(admin)
            db.commit()
            logger.info("Admin account seeded successfully: %s", admin_email)
        else:
            if admin.role != "admin":
                admin.role = "admin"
                db.commit()
                logger.info("Updated existing user %s to admin role.", admin_email)
    except Exception as e:
        logger.warning("Admin bootstrap check notice: %s", e)
        db.rollback()
    finally:
        db.close()


@app.on_event("startup")
def startup_event() -> None:
    """Initialize database tables, seed admin account, log email status, and load the trained ML pipeline at startup."""
    global model
    try:
        init_db()
        logger.info("Database schema checked/initialized.")
        bootstrap_admin_user()
    except Exception:
        logger.exception("Failed to initialize database")

    try:
        email_service.log_email_config_status()
    except Exception as e:
        logger.warning("Could not log email config status: %s", e)

    try:
        model = joblib.load(MODEL_PATH)
        logger.info("Loaded ML model from %s", MODEL_PATH)
    except Exception:
        logger.exception("Failed to load ML model from %s", MODEL_PATH)
        model = None



# ---------------------------------------------------------------------------
# /predict — request/response schema
# ---------------------------------------------------------------------------
#
# IMPORTANT: this schema is intentionally kept identical to the existing
# contract. Field names must not change, or the frontend + model pipeline
# will break.


class StudentData(BaseModel):
    age: int = Field(..., ge=10, le=100)
    gender: Literal["Male", "Female"]
    country: str
    academic_level: Literal["Undergraduate", "Graduate", "High School"]
    most_used_platform: Literal[
        "Facebook",
        "LinkedIn",
        "Instagram",
        "Snapchat",
        "Twitter",
        "YouTube",
        "TikTok",
        "LINE",
        "KakaoTalk",
        "VKontakte",
        "WhatsApp",
        "WeChat",
    ]
    purpose_of_use: Literal["Networking", "Education", "Entertainment", "News"]
    avg_daily_usage_hours: float = Field(..., ge=0, le=24)
    daily_unlocks: int = Field(..., ge=0)
    study_hours: float = Field(..., ge=0, le=24)
    physical_activity_hours: float = Field(..., ge=0, le=24)
    sleep_hours_per_night: float = Field(..., ge=0, le=24)
    stress_level: Literal["Medium", "Low", "Very High", "High"]


class PredictionResponse(BaseModel):
    predicted_mental_health_score: float
    prediction: str = "Moderate range"
    category: str = "Moderate"
    score_100: int = 70


# The trained pipeline (ColumnTransformer + RandomForestRegressor) was fit on a
# dataframe with these exact column names. `country` was grouped into a
# `Grouped_country` feature during training; the categories the encoder was
# fitted on are exactly the ten countries exposed in the assessment UI, so the
# mapping below is a direct rename, not a re-grouping.
FEATURE_COLUMN_MAP = {
    "study_hours": "Study_Hours",
    "age": "Age",
    "avg_daily_usage_hours": "Avg_Daily_Usage_Hours",
    "daily_unlocks": "Daily_Unlocks",
    "physical_activity_hours": "Physical_Activity_Hours",
    "sleep_hours_per_night": "Sleep_Hours_Per_Night",
    "stress_level": "Stress_Level",
    "gender": "Gender",
    "academic_level": "Academic_Level",
    "most_used_platform": "Most_Used_Platform",
    "purpose_of_use": "Purpose_Of_Use",
    "country": "Grouped_country",
}

MODEL_FEATURE_ORDER = [
    "Study_Hours",
    "Age",
    "Avg_Daily_Usage_Hours",
    "Daily_Unlocks",
    "Physical_Activity_Hours",
    "Sleep_Hours_Per_Night",
    "Stress_Level",
    "Gender",
    "Academic_Level",
    "Most_Used_Platform",
    "Purpose_Of_Use",
    "Grouped_country",
]


@app.post("/predict", response_model=PredictionResponse)
def predict(payload: StudentData) -> PredictionResponse:
    global model
    if model is None:
        load_model()
    if model is None:
        raise HTTPException(
            status_code=500,
            detail="The prediction model is not available on the server right now.",
        )

    try:
        data = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()
        row = {FEATURE_COLUMN_MAP[k]: v for k, v in data.items()}
        df = pd.DataFrame([row], columns=MODEL_FEATURE_ORDER)

        raw_score = model.predict(df)[0]
        # Clamp defensively — the model is trained on a 0-10 scale, but a
        # regressor can technically extrapolate slightly outside the range.
        score = float(max(0.0, min(10.0, raw_score)))
        score = round(score, 2)

        if score < 4.0:
            category = "Low"
            prediction = "Lower range"
        elif score < 7.0:
            category = "Moderate"
            prediction = "Moderate range"
        else:
            category = "High"
            prediction = "Higher range"

        score_100 = int(round(score * 10))

        return PredictionResponse(
            predicted_mental_health_score=score,
            prediction=prediction,
            category=category,
            score_100=score_100,
        )
    except HTTPException:
        raise
    except Exception:
        logger.exception("Prediction failed")
        raise HTTPException(
            status_code=500,
            detail="Something went wrong while generating your prediction.",
        )


# ---------------------------------------------------------------------------
# Authentication & User Management (Database-backed)
# ---------------------------------------------------------------------------

class RegisterRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=4)


class LoginRequest(BaseModel):
    email: str
    password: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: Dict[str, Any]


@app.post("/auth/register", response_model=AuthResponse)
def register_user(payload: RegisterRequest, db: Session = Depends(get_db)):
    email_clean = payload.email.strip().lower()
    existing = db.query(User).filter(User.email == email_clean).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email already exists."
        )
    pw_hash = hash_password(payload.password)
    user = User(
        name=payload.name.strip(),
        email=email_clean,
        password_hash=pw_hash,
        role="user",
        status="active",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": str(user.id), "email": user.email, "name": user.name, "role": user.role or "user"})
    return AuthResponse(
        access_token=token,
        token_type="bearer",
        user=user.to_dict()
    )


@app.post("/auth/login", response_model=AuthResponse)
def login_user(payload: LoginRequest, db: Session = Depends(get_db)):
    email_clean = payload.email.strip().lower()
    user = db.query(User).filter(User.email == email_clean).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password."
        )
    if user.status and user.status.lower() == "suspended":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been suspended. Please contact support."
        )
    token = create_access_token({"sub": str(user.id), "email": user.email, "name": user.name, "role": user.role or "user"})
    return AuthResponse(
        access_token=token,
        token_type="bearer",
        user=user.to_dict()
    )



@app.get("/auth/me")
def get_me(current_user: User = Depends(get_current_user)):
    return current_user.to_dict()


class ForgotPasswordRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)


class ResetPasswordRequest(BaseModel):
    token: str = Field(..., min_length=1)
    new_password: str


class MessageResponse(BaseModel):
    message: str
    status: Optional[str] = "success"


class TestEmailRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)


class TestEmailResponse(BaseModel):
    success: bool
    message: str
    error: Optional[str] = None


@app.post("/auth/forgot-password", response_model=MessageResponse)
@app.post("/forgot-password", response_model=MessageResponse)
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    email_clean = payload.email.strip().lower()
    logger.info("Forgot password request received for email: %s", email_clean)

    user = db.query(User).filter(User.email == email_clean).first()
    user_found = user is not None
    logger.info("User found: %s", user_found)

    # Security response to prevent email enumeration
    generic_success = MessageResponse(
        message="If an account exists for this email address, a password reset link has been sent.",
        status="success"
    )

    if not user:
        return generic_success

    try:
        # Invalidate any existing unused reset tokens for this user
        db.query(PasswordResetToken).filter(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used_at.is_(None)
        ).update({"used_at": datetime.utcnow()})

        # Generate cryptographically secure single-use token
        raw_token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
        expires_at = datetime.utcnow() + timedelta(minutes=30)
        logger.info("Reset token generated successfully (expires in 30 minutes)")

        reset_record = PasswordResetToken(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=expires_at,
            created_at=datetime.utcnow()
        )
        db.add(reset_record)
        db.commit()

        # Build reset URL using configured frontend URL
        cfg = email_service.get_email_config()
        frontend_url = cfg["frontend_url"]
        reset_url = email_service.build_reset_url(frontend_url, raw_token)
        masked_url = f"{reset_url.split('token=')[0]}token={raw_token[:6]}...{raw_token[-4:]}"
        logger.info("Reset URL generated: %s", masked_url)

        # Dispatch transactional email
        email_service.send_password_reset_email(user.email, reset_url)
        logger.info("Password reset email sent successfully to %s", user.email)
        return generic_success

    except EmailDeliveryError as ede:
        db.rollback()
        logger.error("Email delivery failed for user %s: %s", user.email, ede)
        err_str = str(ede)
        if "SMTP configuration incomplete" in err_str or "SMTP authentication failed" in err_str:
            detail_msg = err_str
        else:
            detail_msg = "Unable to send the reset email right now. Please try again."
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=detail_msg
        )
    except Exception as e:
        db.rollback()
        logger.exception("Unexpected error in forgot_password: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to send the reset email right now. Please try again."
        )


@app.get("/auth/verify-reset-token")
@app.get("/verify-reset-token")
def verify_reset_token(token: str, db: Session = Depends(get_db)):
    if not token or len(token) < 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid password reset token format."
        )

    token_hash = hashlib.sha256(token.strip().encode("utf-8")).hexdigest()
    record = db.query(PasswordResetToken).filter(PasswordResetToken.token_hash == token_hash).first()

    if not record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired password reset link. Please request a new one."
        )

    if record.used_at is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This password reset link has already been used. Please request a new one."
        )

    if record.expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This password reset link has expired after 30 minutes. Please request a new one."
        )

    return {"status": "valid", "message": "Token is valid and active."}


@app.post("/auth/reset-password", response_model=MessageResponse)
@app.post("/reset-password", response_model=MessageResponse)
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    logger.info("Reset password request received")
    if len(payload.new_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 6 characters long."
        )

    logger.info("Token validation started")
    token_hash = hashlib.sha256(payload.token.strip().encode("utf-8")).hexdigest()
    record = db.query(PasswordResetToken).filter(PasswordResetToken.token_hash == token_hash).first()

    if not record:
        logger.warning("Token validation failed: token not found or invalid")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired password reset token."
        )

    if record.used_at is not None:
        logger.warning("Token validation failed: token already used")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This password reset token has already been used. Please request a new link."
        )

    if record.expires_at < datetime.utcnow():
        logger.warning("Token validation failed: token expired")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This password reset token has expired. Please request a new link."
        )

    logger.info("Token valid: true")

    user = db.query(User).filter(User.id == record.user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Associated user account not found."
        )

    # Hash new password using bcrypt
    user.password_hash = hash_password(payload.new_password)
    # Mark single-use token as redeemed
    record.used_at = datetime.utcnow()

    db.commit()
    logger.info("Password updated successfully for user_id=%s", user.id)

    return MessageResponse(
        message="Password has been successfully reset. You can now log in with your new password.",
        status="success"
    )


@app.post("/test-email", response_model=TestEmailResponse)
@app.post("/auth/test-email", response_model=TestEmailResponse)
def test_email_endpoint(
    payload: TestEmailRequest,
    admin: User = Depends(get_current_admin_user)
):
    """
    Administrative endpoint to verify SMTP credentials and deliverability without going through the complete reset flow.
    """
    target_email = payload.email.strip().lower()
    logger.info("Development test-email endpoint invoked for recipient: %s", target_email)
    try:
        result = email_service.send_test_email(target_email)
        provider = result.get("provider", "email service")
        logger.info("Test email delivered successfully via %s to %s", provider, target_email)
        return TestEmailResponse(
            success=True,
            message=f"Test email sent successfully to {target_email} via {provider}."
        )
    except Exception as e:
        logger.error("Test email delivery failed for recipient %s: %s", target_email, e)
        return TestEmailResponse(
            success=False,
            message="SMTP error",
            error=str(e)
        )




# ---------------------------------------------------------------------------
# Recommendations generator helper
# ---------------------------------------------------------------------------

def generate_recommendations(score: float, category: str, form_data: dict) -> list:
    """Generate tailored evidence-based recommendations based on score and habit inputs."""
    recs = []
    if score >= 7.0:
        recs.append({
            "title": "Maintain Balanced Study Cadence",
            "desc": "Your mental wellness score is strong. Continue pacing large assignments with 50-minute blocks and structured recovery intervals."
        })
    elif score >= 4.0:
        recs.append({
            "title": "Targeted Stress De-escalation",
            "desc": "Your score reflects moderate pressure. Integrate 10-minute restorative intervals between classes to lower autonomic tension."
        })
    else:
        recs.append({
            "title": "Immediate Cognitive Recovery",
            "desc": "Elevated fatigue and stress detected. Prioritize reducing commitments, setting strict sleep windows, and connecting with campus counselors."
        })

    sleep_h = float(form_data.get("sleep_hours_per_night", 7.0))
    if sleep_h < 7.0:
        recs.append({
            "title": "Circadian Synchronization",
            "desc": f"You reported {sleep_h} hours of nightly sleep. Aim for at least 7.5 hours with a 30-minute screen blackout before bed to stimulate melatonin."
        })

    screen_h = float(form_data.get("avg_daily_usage_hours", 4.0))
    if screen_h > 5.0:
        recs.append({
            "title": "Dopamine & Notification Hygiene",
            "desc": f"Your daily screen usage is {screen_h} hours. Set app limits on high-frequency social feeds and designate phone-free meal times."
        })

    activity_h = float(form_data.get("physical_activity_hours", 1.0))
    if activity_h < 1.0:
        recs.append({
            "title": "Daily Cortisol Breakdown",
            "desc": "Incorporate 20 minutes of daily aerobic movement (brisk walking, cycling) to physically burn off study-induced cortisol."
        })

    return recs


# ---------------------------------------------------------------------------
# /assessments — Database-backed Assessment CRUD & History
# ---------------------------------------------------------------------------

@app.post("/assessments")
def create_assessment(
    payload: StudentData,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    global model
    if model is None:
        load_model()
    if model is None:
        raise HTTPException(
            status_code=500,
            detail="The prediction model is not available on the server right now.",
        )

    try:
        data = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()
        row = {FEATURE_COLUMN_MAP[k]: v for k, v in data.items()}
        df = pd.DataFrame([row], columns=MODEL_FEATURE_ORDER)

        raw_score = model.predict(df)[0]
        score = float(max(0.0, min(10.0, raw_score)))
        score = round(score, 2)

        if score < 4.0:
            category = "Low"
            prediction = "Lower range"
        elif score < 7.0:
            category = "Moderate"
            prediction = "Moderate range"
        else:
            category = "High"
            prediction = "Higher range"

        score_100 = int(round(score * 10))
        recommendations = generate_recommendations(score, category, data)

        assessment = Assessment(
            user_id=current_user.id,
            age=payload.age,
            gender=payload.gender,
            country=payload.country,
            academic_level=payload.academic_level,
            most_used_platform=payload.most_used_platform,
            purpose_of_use=payload.purpose_of_use,
            avg_daily_usage_hours=payload.avg_daily_usage_hours,
            daily_unlocks=payload.daily_unlocks,
            study_hours=payload.study_hours,
            physical_activity_hours=payload.physical_activity_hours,
            sleep_hours_per_night=payload.sleep_hours_per_night,
            stress_level=payload.stress_level,
            score=score,
            score_100=score_100,
            prediction=prediction,
            category=category,
            recommendations=json.dumps(recommendations),
            form_data=json.dumps(data),
            assessment_date=datetime.utcnow(),
            created_at=datetime.utcnow()
        )
        db.add(assessment)
        db.commit()
        db.refresh(assessment)

        return assessment.to_dict()
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to create assessment in database")
        raise HTTPException(
            status_code=500,
            detail="Something went wrong while evaluating and storing your assessment.",
        )


@app.get("/assessments")
def list_user_assessments(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    records = (
        db.query(Assessment)
        .filter(Assessment.user_id == current_user.id)
        .order_by(Assessment.created_at.desc())
        .all()
    )
    return [r.to_dict() for r in records]


def _parse_entity_id(val: Any) -> int:
    try:
        s = str(val).strip()
        for prefix in ("g_", "m_", "j_", "a_", "u_"):
            if s.startswith(prefix):
                s = s[len(prefix):]
                break
        return int(s)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid ID format.")


@app.get("/assessments/{assessment_id}")
def get_assessment(
    assessment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    parsed_id = _parse_entity_id(assessment_id)
    record = db.query(Assessment).filter(Assessment.id == parsed_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Assessment not found.")
    if record.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied. You can only view your own assessments.")
    return record.to_dict()


@app.get("/assessments/{assessment_id}/report")
def get_assessment_report_pdf(
    assessment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    parsed_id = _parse_entity_id(assessment_id)
    record = db.query(Assessment).filter(Assessment.id == parsed_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Assessment not found.")
    if record.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied. You can only view your own assessments.")

    form_dict = record.get_form_data_dict()
    recs = record.get_recommendations_list()
    ass_date = record.assessment_date.isoformat() if hasattr(record.assessment_date, "isoformat") else str(record.assessment_date or record.created_at or datetime.utcnow().isoformat())
    pdf_bytes = report_generator.build_pdf_report(
        user_name=current_user.name,
        user_email=current_user.email,
        assessment_id=f"a_{record.id}",
        assessment_date=ass_date,
        score=record.score,
        score_100=record.score_100,
        prediction=record.prediction,
        form_data=form_dict,
        recommendations=recs
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="MindCare_Mental_Wellness_Report_a_{record.id}.pdf"',
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


# ---------------------------------------------------------------------------
# User Central Data Synchronization
# ---------------------------------------------------------------------------

@app.get("/user/data-sync")
def sync_user_data(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Return the user's complete cloud state (profile, assessments, moods, journals, goals)."""
    assessments = [a.to_dict() for a in current_user.assessments]
    moods = [m.to_dict() for m in current_user.moods]
    journals = [j.to_dict() for j in current_user.journals]
    goals = [g.to_dict() for g in current_user.goals]
    return {
        "user": current_user.to_dict(),
        "assessments": assessments,
        "moods": moods,
        "journals": journals,
        "goals": goals
    }


# ---------------------------------------------------------------------------
# Daily Mood Check-In APIs (Database-backed)
# ---------------------------------------------------------------------------

class MoodPayload(BaseModel):
    date: Optional[str] = None
    mood: int = Field(..., ge=1, le=5)
    label: Optional[str] = None
    emoji: Optional[str] = None
    note: Optional[str] = ""
    is_voice_entry: Optional[bool] = False
    transcript: Optional[str] = None
    text_sentiment_score: Optional[float] = None
    vocal_tone_score: Optional[float] = None
    blended_mood_score: Optional[float] = None
    vocal_metrics: Optional[Dict[str, Any]] = None

MOOD_LABELS = {
    5: ("Great", "😄"),
    4: ("Good", "🙂"),
    3: ("Okay", "😐"),
    2: ("Low", "😟"),
    1: ("Very Low", "😔")
}


@app.post("/moods")
def save_mood_entry(
    payload: MoodPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    date_str = payload.date or datetime.utcnow().strftime("%Y-%m-%d")
    def_label, def_emoji = MOOD_LABELS.get(payload.mood, ("Okay", "😐"))
    label = payload.label or def_label
    emoji = payload.emoji or def_emoji

    # Check if entry already exists for this date to update
    existing = db.query(MoodEntry).filter(
        MoodEntry.user_id == current_user.id,
        MoodEntry.date == date_str
    ).first()

    vocal_metrics_json = json.dumps(payload.vocal_metrics) if payload.vocal_metrics else None

    if existing:
        existing.mood = payload.mood
        existing.label = label
        existing.emoji = emoji
        existing.note = (payload.note or "").strip()
        existing.is_voice_entry = bool(payload.is_voice_entry)
        existing.transcript = payload.transcript
        existing.text_sentiment_score = payload.text_sentiment_score
        existing.vocal_tone_score = payload.vocal_tone_score
        existing.blended_mood_score = payload.blended_mood_score
        existing.vocal_metrics = vocal_metrics_json
        existing.timestamp = datetime.utcnow()
        db.commit()
        db.refresh(existing)
        return existing.to_dict()

    entry = MoodEntry(
        user_id=current_user.id,
        date=date_str,
        timestamp=datetime.utcnow(),
        mood=payload.mood,
        label=label,
        emoji=emoji,
        note=(payload.note or "").strip(),
        is_voice_entry=bool(payload.is_voice_entry),
        transcript=payload.transcript,
        text_sentiment_score=payload.text_sentiment_score,
        vocal_tone_score=payload.vocal_tone_score,
        blended_mood_score=payload.blended_mood_score,
        vocal_metrics=vocal_metrics_json,
        created_at=datetime.utcnow()
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry.to_dict()


@app.get("/moods")
def list_mood_entries(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    records = db.query(MoodEntry).filter(
        MoodEntry.user_id == current_user.id
    ).order_by(MoodEntry.timestamp.desc()).all()
    return [r.to_dict() for r in records]


@app.delete("/moods/{mood_id}")
def delete_mood_entry(
    mood_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    parsed_id = _parse_entity_id(mood_id)
    record = db.query(MoodEntry).filter(MoodEntry.id == parsed_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Mood entry not found.")
    if record.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied.")
    db.delete(record)
    db.commit()
    return {"status": "deleted", "id": mood_id}


# ---------------------------------------------------------------------------
# Private Journal APIs (Database-backed)
# ---------------------------------------------------------------------------

class JournalCreatePayload(BaseModel):
    title: Optional[str] = "Untitled Reflection"
    content: str = Field(..., min_length=1)
    date_str: Optional[str] = None
    ai_reflection: Optional[Dict[str, Any]] = None


@app.post("/journals")
def save_journal_entry(
    payload: JournalCreatePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    date_str = payload.date_str or datetime.utcnow().strftime("%Y-%m-%d")
    ai_ref_json = json.dumps(payload.ai_reflection) if payload.ai_reflection else None

    entry = JournalEntry(
        user_id=current_user.id,
        date_str=date_str,
        title=(payload.title or "Untitled Reflection").strip(),
        content=payload.content.strip(),
        ai_reflection=ai_ref_json,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry.to_dict()


@app.get("/journals")
def list_journal_entries(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    records = db.query(JournalEntry).filter(
        JournalEntry.user_id == current_user.id
    ).order_by(JournalEntry.created_at.desc()).all()
    return [r.to_dict() for r in records]


@app.get("/journals/{journal_id}")
def get_journal_entry(
    journal_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    parsed_id = _parse_entity_id(journal_id)
    record = db.query(JournalEntry).filter(JournalEntry.id == parsed_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Journal entry not found.")
    if record.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied.")
    return record.to_dict()


@app.delete("/journals/{journal_id}")
def delete_journal_entry(
    journal_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    parsed_id = _parse_entity_id(journal_id)
    record = db.query(JournalEntry).filter(JournalEntry.id == parsed_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Journal entry not found.")
    if record.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied.")
    db.delete(record)
    db.commit()
    return {"status": "deleted", "id": journal_id}


# ---------------------------------------------------------------------------
# Wellness Goals APIs (Database-backed)
# ---------------------------------------------------------------------------

class GoalCreatePayload(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    category: Optional[str] = "General"
    status: Optional[str] = "in_progress"


class GoalStatusUpdatePayload(BaseModel):
    status: str = Field(..., pattern="^(in_progress|completed|archived)$")


@app.post("/goals")
def create_goal(
    payload: GoalCreatePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    goal = Goal(
        user_id=current_user.id,
        title=payload.title.strip(),
        category=(payload.category or "General").strip(),
        status=payload.status or "in_progress",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return goal.to_dict()


@app.get("/goals")
def list_goals(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    records = db.query(Goal).filter(
        Goal.user_id == current_user.id
    ).order_by(Goal.created_at.desc()).all()
    return [r.to_dict() for r in records]


@app.patch("/goals/{goal_id}/status")
@app.patch("/goals/{goal_id}")
def update_goal_status(
    goal_id: str,
    payload: GoalStatusUpdatePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    parsed_id = _parse_entity_id(goal_id)
    goal = db.query(Goal).filter(Goal.id == parsed_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found.")
    if goal.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied.")
    goal.status = payload.status
    goal.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(goal)
    return goal.to_dict()


@app.delete("/goals/{goal_id}")
def delete_goal(
    goal_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    parsed_id = _parse_entity_id(goal_id)
    goal = db.query(Goal).filter(Goal.id == parsed_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found.")
    if goal.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied.")
    db.delete(goal)
    db.commit()
    return {"status": "deleted", "id": goal_id}


# ---------------------------------------------------------------------------
# Admin Dashboard APIs (Strictly Protected by get_current_admin_user)
# ---------------------------------------------------------------------------

@app.get("/admin/stats")
def get_admin_stats(
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin_user)
):
    total_users = db.query(User).count()
    total_assessments = db.query(Assessment).count()
    total_moods = db.query(MoodEntry).count()
    total_journals = db.query(JournalEntry).count()
    total_goals = db.query(Goal).count()

    # Active users in past 24h
    since_24h = datetime.utcnow() - timedelta(hours=24)
    active_assessments = db.query(Assessment.user_id).filter(Assessment.created_at >= since_24h).distinct()
    active_moods = db.query(MoodEntry.user_id).filter(MoodEntry.created_at >= since_24h).distinct()
    active_user_ids = set([r[0] for r in active_assessments.all()] + [r[0] for r in active_moods.all()])

    # Score breakdown
    high_count = db.query(Assessment).filter(Assessment.score >= 7.0).count()
    mod_count = db.query(Assessment).filter(Assessment.score >= 4.0, Assessment.score < 7.0).count()
    low_count = db.query(Assessment).filter(Assessment.score < 4.0).count()

    # Recent activity stream
    recent_assessments = db.query(Assessment).order_by(Assessment.created_at.desc()).limit(10).all()
    recent_activity = []
    for a in recent_assessments:
        u = a.user
        recent_activity.append({
            "type": "assessment",
            "title": f"{u.name if u else 'User'} completed assessment ({a.score:.2f}/10 - {a.prediction})",
            "user_id": a.user_id,
            "user_name": u.name if u else "User",
            "user_email": u.email if u else "",
            "timestamp": a.created_at.isoformat() if a.created_at else None,
            "score": a.score,
            "category": a.category
        })

    recent_moods = db.query(MoodEntry).order_by(MoodEntry.timestamp.desc()).limit(8).all()
    for m in recent_moods:
        u = m.user
        recent_activity.append({
            "type": "mood",
            "title": f"{u.name if u else 'User'} logged mood: {m.label} {m.emoji}",
            "user_id": m.user_id,
            "user_name": u.name if u else "User",
            "user_email": u.email if u else "",
            "timestamp": m.timestamp.isoformat() if m.timestamp else None,
            "mood": m.mood
        })

    recent_activity.sort(key=lambda x: x["timestamp"] or "", reverse=True)

    return {
        "total_users": total_users,
        "total_assessments": total_assessments,
        "total_moods": total_moods,
        "total_journals": total_journals,
        "total_goals": total_goals,
        "active_users_24h": len(active_user_ids),
        "score_distribution": {
            "high": high_count,
            "moderate": mod_count,
            "low": low_count
        },
        "recent_activity": recent_activity[:15]
    }


@app.get("/admin/users")
def get_admin_users(
    q: Optional[str] = None,
    role: Optional[str] = None,
    status_filter: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin_user)
):
    query = db.query(User)
    if q:
        search = f"%{q.strip().lower()}%"
        query = query.filter((User.name.ilike(search)) | (User.email.ilike(search)))
    if role:
        query = query.filter(User.role == role)
    if status_filter:
        query = query.filter(User.status == status_filter)

    total = query.count()
    users = query.order_by(User.created_at.desc()).offset(offset).limit(limit).all()

    user_list = []
    for u in users:
        last_assess = u.assessments[0] if u.assessments else None
        last_mood = u.moods[0] if u.moods else None
        last_act = u.created_at
        if last_assess and last_assess.created_at and last_assess.created_at > last_act:
            last_act = last_assess.created_at
        if last_mood and last_mood.timestamp and last_mood.timestamp > last_act:
            last_act = last_mood.timestamp

        user_list.append({
            "id": u.id,
            "name": u.name,
            "email": u.email,
            "role": u.role,
            "status": u.status,
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "updated_at": u.updated_at.isoformat() if u.updated_at else None,
            "assessments_count": len(u.assessments),
            "moods_count": len(u.moods),
            "journals_count": len(u.journals),
            "goals_count": len(u.goals),
            "latest_score": last_assess.score if last_assess else None,
            "latest_prediction": last_assess.prediction if last_assess else None,
            "last_activity": last_act.isoformat() if last_act else None
        })

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "users": user_list
    }


@app.get("/admin/users/{user_id}")
def get_admin_user_detail(
    user_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin_user)
):
    parsed_id = _parse_entity_id(user_id)
    user = db.query(User).filter(User.id == parsed_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    return {
        "user": user.to_dict(),
        "assessments": [a.to_dict() for a in user.assessments],
        "moods": [m.to_dict() for m in user.moods],
        "journals": [j.to_dict() for j in user.journals],
        "goals": [g.to_dict() for g in user.goals]
    }


@app.get("/admin/assessments")
def get_admin_all_assessments(
    q: Optional[str] = None,
    category: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin_user)
):
    query = db.query(Assessment).join(User, Assessment.user_id == User.id)
    if q:
        search = f"%{q.strip().lower()}%"
        query = query.filter((User.name.ilike(search)) | (User.email.ilike(search)))
    if category:
        query = query.filter(Assessment.category == category)

    total = query.count()
    records = query.order_by(Assessment.created_at.desc()).offset(offset).limit(limit).all()

    items = []
    for r in records:
        d = r.to_dict()
        d["user_name"] = r.user.name if r.user else "User"
        d["user_email"] = r.user.email if r.user else ""
        items.append(d)

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "assessments": items
    }


@app.get("/admin/export/users")
def export_users_csv(
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin_user)
):
    import io
    import csv

    users = db.query(User).order_by(User.id.asc()).all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ID", "Name", "Email", "Role", "Status", "Created At", "Assessments Count", "Moods Count", "Journals Count", "Goals Count"])

    for u in users:
        writer.writerow([
            u.id,
            u.name,
            u.email,
            u.role,
            u.status,
            u.created_at.isoformat() if u.created_at else "",
            len(u.assessments),
            len(u.moods),
            len(u.journals),
            len(u.goals)
        ])

    csv_data = output.getvalue()
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="MindCare_Users_Export_{datetime.utcnow().strftime("%Y%m%d_%H%M%S")}.csv"',
            "Access-Control-Expose-Headers": "Content-Disposition"
        }
    )


@app.get("/admin/export/assessments")
def export_assessments_csv(
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin_user)
):
    import io
    import csv

    records = db.query(Assessment).order_by(Assessment.created_at.desc()).all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Assessment ID", "User ID", "User Name", "User Email", "Date",
        "Score", "Score 100", "Prediction", "Category", "Age", "Gender",
        "Country", "Academic Level", "Platform", "Study Hours",
        "Physical Activity Hours", "Sleep Hours", "Stress Level", "Daily Unlocks", "Screen Time"
    ])

    for a in records:
        u = a.user
        writer.writerow([
            a.id,
            a.user_id,
            u.name if u else "",
            u.email if u else "",
            a.assessment_date.isoformat() if a.assessment_date else a.created_at.isoformat(),
            a.score,
            a.score_100,
            a.prediction,
            a.category,
            a.age,
            a.gender,
            a.country,
            a.academic_level,
            a.most_used_platform,
            a.study_hours,
            a.physical_activity_hours,
            a.sleep_hours_per_night,
            a.stress_level,
            a.daily_unlocks,
            a.avg_daily_usage_hours
        ])

    csv_data = output.getvalue()
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="MindCare_Assessments_Export_{datetime.utcnow().strftime("%Y%m%d_%H%M%S")}.csv"',
            "Access-Control-Expose-Headers": "Content-Disposition"
        }
    )


# ---------------------------------------------------------------------------
# /report/pdf — Download Complete Assessment Report (Direct Request)
# ---------------------------------------------------------------------------



class ReportRequest(BaseModel):
    user_name: Optional[str] = "Student"
    user_email: Optional[str] = "student@mindcare.ai"
    assessment_id: Optional[Any] = None
    assessment_date: Optional[Any] = None
    score: float
    score_100: Optional[int] = None
    prediction: Optional[str] = None
    category: Optional[str] = None
    form_data: Optional[Dict[str, Any]] = None
    recommendations: Optional[List[Any]] = None
    additional_data: Optional[Dict[str, Any]] = None


@app.post("/report/pdf")
def generate_pdf_report(payload: ReportRequest):
    try:
        score_100 = payload.score_100 if payload.score_100 is not None else int(round(payload.score * 10))
        prediction_val = payload.prediction or payload.category or (
            "Higher range" if payload.score >= 7.0 else ("Moderate range" if payload.score >= 4.0 else "Lower range")
        )
        ass_id = payload.assessment_id if payload.assessment_id is not None else f"a_{int(datetime.now().timestamp())}"
        ass_date = payload.assessment_date if payload.assessment_date is not None else datetime.now().isoformat()
        if hasattr(ass_date, "isoformat"):
            ass_date = ass_date.isoformat()
        else:
            ass_date = str(ass_date)

        pdf_bytes = report_generator.build_pdf_report(
            user_name=payload.user_name or "Student",
            user_email=payload.user_email or "student@mindcare.ai",
            assessment_id=str(ass_id),
            assessment_date=ass_date,
            score=float(payload.score),
            score_100=score_100,
            prediction=prediction_val,
            form_data=payload.form_data or {},
            recommendations=payload.recommendations or [],
            additional_data=payload.additional_data or {},
        )
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="MindCare_Mental_Wellness_Report_{ass_id}.pdf"',
                "Access-Control-Expose-Headers": "Content-Disposition",
            },
        )
    except Exception:
        logger.exception("Failed to generate PDF report")
        raise HTTPException(
            status_code=500,
            detail="Unable to generate the report. Please try again.",
        )


# ---------------------------------------------------------------------------
# /chat — Gemini-powered wellness assistant
# ---------------------------------------------------------------------------

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
GEMINI_MODEL_NAME = os.environ.get("GEMINI_MODEL", "gemini-flash-lite-latest")

SYSTEM_PROMPT = """You are MindCare AI, a compassionate, supportive student mental wellness companion.

STRICT INSTRUCTIONS:
1. TOPIC-SPECIFIC & RELEVANT: You must directly answer the user's specific question or concern.
   - If the user asks about sleep, give concrete sleep hygiene and circadian rhythm advice.
   - If the user asks about exam stress, give specific test-taking and study-pacing strategies.
   - If the user asks about screen time, give practical digital detox and boundary tips.
   - If the user asks about breathing or exercises, provide the actual step-by-step exercise.
   - DO NOT repeat the same generic formula or bullet points across different topics.
2. ACTIONABLE & CONCISE: Provide 3 to 4 clear, high-impact bullet points or steps tailored specifically to their issue. Keep the tone warm, empathetic, and encouraging.
3. LENGTH: Keep responses concise (under 150 words) so they are easy to read and listen to on mobile devices.
4. NON-DIAGNOSTIC: You provide educational, supportive wellness guidance. Do not diagnose conditions or prescribe medications.
5. CRISIS SAFETY: If the user indicates immediate danger, self-harm, or severe crisis, immediately provide the 988 Suicide & Crisis Lifeline (call/text 988) or emergency services."""

# Lightweight, backend-side safety net. This does not replace Gemini's own
# judgement — it guarantees a caring, resource-forward reply even if the
# upstream model call fails or is misconfigured.
CRISIS_KEYWORDS = [
    "suicide",
    "kill myself",
    "end my life",
    "self harm",
    "self-harm",
    "hurt myself",
    "want to die",
    "no reason to live",
]

CRISIS_RESPONSE = (
    "It sounds like you're going through something really painful right now, "
    "and I'm glad you said something. I'm not able to provide crisis support, "
    "but please reach out right now to a crisis line, local emergency services, "
    "or someone you trust — you deserve immediate support from a real person. "
    "If you are in the US, you can call or text 988 (Suicide & Crisis Lifeline) "
    "any time. If you are outside the US, please contact your local emergency "
    "number or a crisis line in your country."
)


class ChatContext(BaseModel):
    score: Optional[float] = None
    age: Optional[int] = None
    academic_level: Optional[str] = None
    avg_daily_usage_hours: Optional[float] = None
    study_hours: Optional[float] = None
    physical_activity_hours: Optional[float] = None
    sleep_hours_per_night: Optional[float] = None
    stress_level: Optional[str] = None


class ChatMessageItem(BaseModel):
    role: Literal["user", "model", "assistant"]
    content: str


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    history: Optional[List[ChatMessageItem]] = []
    context: Optional[ChatContext] = None


class ChatResponse(BaseModel):
    response: str


def _contains_crisis_language(message: str) -> bool:
    lowered = message.lower()
    return any(keyword in lowered for keyword in CRISIS_KEYWORDS)


def _build_context_note(context: Optional[ChatContext]) -> str:
    if context is None:
        return ""
    parts = []
    if context.score is not None:
        parts.append(f"wellness score: {context.score}/10")
    if context.stress_level:
        parts.append(f"stress level: {context.stress_level}")
    if context.sleep_hours_per_night is not None:
        parts.append(f"sleep: {context.sleep_hours_per_night}h/night")
    if context.study_hours is not None:
        parts.append(f"study hours: {context.study_hours}h/day")
    if context.physical_activity_hours is not None:
        parts.append(f"physical activity: {context.physical_activity_hours}h/day")
    if context.avg_daily_usage_hours is not None:
        parts.append(f"social media use: {context.avg_daily_usage_hours}h/day")
    if context.academic_level:
        parts.append(f"academic level: {context.academic_level}")
    if not parts:
        return ""
    return "For context, here is this user's latest self-reported assessment data: " + "; ".join(parts) + "."


def _get_candidate_models() -> List[str]:
    """Return an ordered, deduplicated list of candidate Gemini models to try."""
    configured = os.environ.get("GEMINI_MODEL", "").strip()
    candidates = [
        configured,
        "gemini-flash-lite-latest",
        "gemini-3.5-flash-lite",
        "gemini-3.8-flash",
        "gemini-3.7-flash",
        "gemini-3.6-flash",
        "gemini-3.5-flash",
    ]
    unique_models: List[str] = []
    for m in candidates:
        if m and m not in unique_models:
            unique_models.append(m)
    return unique_models


def _sanitize_gemini_history(history_items: Optional[List[ChatMessageItem]]) -> List[dict]:
    """Ensure history turns strictly alternate between 'user' and 'model' and start with 'user'."""
    if not history_items:
        return []
    sanitized: List[dict] = []
    for item in history_items:
        role = "user" if item.role in ("user",) else "model"
        content = (item.content or "").strip()
        if not content:
            continue
        if sanitized and sanitized[-1]["role"] == role:
            sanitized[-1]["parts"][0] += f"\n\n{content}"
        else:
            sanitized.append({"role": role, "parts": [content]})

    while sanitized and sanitized[0]["role"] != "user":
        sanitized.pop(0)
    while sanitized and sanitized[-1]["role"] != "model":
        sanitized.pop(-1)
    return sanitized


def _call_gemini_with_fallback(
    api_key: str,
    system_instruction: str,
    prompt: str,
    history: Optional[List[dict]] = None,
) -> str:
    """Attempt generation with candidate models sequentially to handle quota/availability issues."""
    import google.generativeai as genai

    genai.configure(api_key=api_key, transport="rest")
    models = _get_candidate_models()
    last_exc = None

    for model_name in models:
        try:
            gemini_model = genai.GenerativeModel(
                model_name=model_name,
                system_instruction=system_instruction,
            )
            req_opts = {"timeout": 12}
            if history:
                chat_session = gemini_model.start_chat(history=history)
                result = chat_session.send_message(prompt, request_options=req_opts)
            else:
                result = gemini_model.generate_content(prompt, request_options=req_opts)

            text = (result.text or "").strip()
            if text:
                return text
        except Exception as exc:
            last_exc = exc
            logger.warning("Gemini model '%s' failed (%s); trying fallback candidate...", model_name, exc)

    if last_exc:
        raise last_exc
    raise ValueError("No response received from any candidate Gemini model.")


def _record_chat_if_auth(db: Session, auth_header, user_msg: str, bot_reply: str):
    try:
        if auth_header and auth_header.credentials:
            payload = decode_access_token(auth_header.credentials)
            if payload and payload.get("sub"):
                uid = int(payload.get("sub"))
                msg_user = ChatMessage(user_id=uid, role="user", content=user_msg, created_at=datetime.utcnow())
                msg_bot = ChatMessage(user_id=uid, role="bot", content=bot_reply, created_at=datetime.utcnow())
                db.add(msg_user)
                db.add(msg_bot)
                db.commit()
    except Exception as e:
        logger.warning("Could not persist chat message: %s", e)
        db.rollback()


@app.post("/chat", response_model=ChatResponse)
def chat(
    payload: ChatRequest,
    db: Session = Depends(get_db),
    auth_header: Optional[Any] = Depends(security_bearer)
) -> ChatResponse:
    if _contains_crisis_language(payload.message):
        reply = CRISIS_RESPONSE
        _record_chat_if_auth(db, auth_header, payload.message, reply)
        return ChatResponse(response=reply)

    api_key = os.environ.get("GEMINI_API_KEY") or GEMINI_API_KEY

    try:
        if not api_key:
            raise ValueError("GEMINI_API_KEY is not configured")

        context_note = _build_context_note(payload.context)

        # Build clean multi-turn history for Gemini
        gemini_history = _sanitize_gemini_history(payload.history)

        prompt = payload.message if not context_note else f"{context_note}\n\nUser: {payload.message}"

        text = _call_gemini_with_fallback(
            api_key=api_key,
            system_instruction=SYSTEM_PROMPT,
            prompt=prompt,
            history=gemini_history if gemini_history else None,
        )

        _record_chat_if_auth(db, auth_header, payload.message, text)
        return ChatResponse(response=text)
    except Exception as exc:
        logger.warning("Gemini chat request failed (%s); returning transparent error message.", exc)
        fallback_reply = (
            "I'm temporarily having trouble connecting to my AI service. "
            "Please check your internet connection and try again in a moment."
        )
        _record_chat_if_auth(db, auth_header, payload.message, fallback_reply)
        return ChatResponse(response=fallback_reply)




# ---------------------------------------------------------------------------
# /journal/reflect — AI Journal Reflection
# ---------------------------------------------------------------------------

class JournalReflectRequest(BaseModel):
    title: Optional[str] = None
    content: str = Field(..., min_length=1, max_length=5000)


class JournalReflectResponse(BaseModel):
    emotional_reflection: str
    observations: str
    coping_suggestions: List[str]
    next_steps: List[str]


JOURNAL_SYSTEM_PROMPT = (
    "You are a supportive, reflective mental wellness AI companion.\n"
    "You are reflecting on a user's private personal journal entry.\n"
    "Your goal is to provide warm emotional reflection, constructive observations, "
    "healthy coping suggestions, and practical next steps.\n\n"
    "CRITICAL GUIDELINES:\n"
    "1. Do NOT diagnose the user with any medical or psychiatric condition. Never claim to detect disorders.\n"
    "2. Use gentle, supportive phrasing like 'You mentioned...', 'It may help to consider...', 'Some people find...'.\n"
    "3. Provide realistic, healthy coping ideas and simple, achievable next steps.\n"
    "4. Return ONLY a valid JSON object with the exact keys: "
    "'emotional_reflection' (string), 'observations' (string), "
    "'coping_suggestions' (array of strings), and 'next_steps' (array of strings). Do not include any other text."
)


@app.post("/journal/reflect", response_model=JournalReflectResponse)
def reflect_journal(payload: JournalReflectRequest) -> JournalReflectResponse:
    if _contains_crisis_language(payload.content):
        return JournalReflectResponse(
            emotional_reflection="It sounds like you are going through a deeply distressing moment right now.",
            observations="Your safety and wellbeing are the most important priority.",
            coping_suggestions=[
                "Please connect immediately with a trusted person, counselor, or crisis specialist.",
                "In the US/Canada, you can call or text 988 any time for free, confidential support.",
            ],
            next_steps=[
                "Reach out to emergency services or call 988 if you feel in immediate danger."
            ],
        )

    api_key = os.environ.get("GEMINI_API_KEY") or GEMINI_API_KEY
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="The AI assistant is temporarily unavailable. Please try again later.",
        )

    try:
        import json
        import re

        prompt = f"Journal Title: {payload.title or 'Untitled'}\n\nJournal Content:\n{payload.content}"
        raw_text = _call_gemini_with_fallback(
            api_key=api_key,
            system_instruction=JOURNAL_SYSTEM_PROMPT,
            prompt=prompt,
            history=None,
        )

        # Clean JSON markdown if present
        clean_text = re.sub(r"^```json\s*", "", raw_text, flags=re.IGNORECASE)
        clean_text = re.sub(r"^```\s*", "", clean_text)
        clean_text = re.sub(r"\s*```$", "", clean_text)

        parsed = json.loads(clean_text)
        return JournalReflectResponse(
            emotional_reflection=parsed.get("emotional_reflection", "Thank you for sharing your thoughts in your journal."),
            observations=parsed.get("observations", "Reflecting on your daily experiences is an important step in self-awareness."),
            coping_suggestions=parsed.get("coping_suggestions", ["Take a few moments for slow, deep breaths.", "Step away for a short walk."]),
            next_steps=parsed.get("next_steps", ["Acknowledge how much you accomplished today, even in small ways."]),
        )
    except Exception:
        logger.exception("Journal reflection failed")
        # Graceful fallback response
        return JournalReflectResponse(
            emotional_reflection="Thank you for taking the time to put your thoughts into words.",
            observations="Writing about how you feel can help create clarity and perspective around challenging days.",
            coping_suggestions=[
                "Try pairing this reflection with a 5-minute break away from screens.",
                "A short breathing exercise can help ground your nervous system."
            ],
            next_steps=[
                "Choose one small, kind thing you can do for yourself today."
            ],
        )


@app.get("/health")
def health():
    global model
    if model is None:
        try:
            model = joblib.load(MODEL_PATH)
        except Exception:
            logger.exception("Failed to load ML model in /health")
    return {"status": "ok", "model_loaded": model is not None}


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", "8000"))
    host = os.environ.get("HOST", "0.0.0.0")
    logger.info("Starting MindCare AI API on %s:%s", host, port)
    uvicorn.run("main:app", host=host, port=port, reload=False)
