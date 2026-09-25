import json
from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from database import Base

class User(Base):
    __tablename__ = 'users'

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(120), nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), default="user", nullable=False) # "user" | "admin"
    status = Column(String(20), default="active", nullable=False) # "active" | "suspended"
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    assessments = relationship('Assessment', back_populates='user', cascade='all, delete-orphan', order_by='desc(Assessment.created_at)')
    moods = relationship('MoodEntry', back_populates='user', cascade='all, delete-orphan', order_by='desc(MoodEntry.timestamp)')
    journals = relationship('JournalEntry', back_populates='user', cascade='all, delete-orphan', order_by='desc(JournalEntry.created_at)')
    goals = relationship('Goal', back_populates='user', cascade='all, delete-orphan', order_by='desc(Goal.created_at)')
    chat_messages = relationship('ChatMessage', back_populates='user', cascade='all, delete-orphan', order_by='ChatMessage.created_at')
    password_reset_tokens = relationship('PasswordResetToken', back_populates='user', cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'email': self.email,
            'role': self.role or 'user',
            'status': self.status or 'active',
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else (self.created_at.isoformat() if self.created_at else None)
        }


class Assessment(Base):
    __tablename__ = 'assessments'

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)

    # 12 Assessment Input Fields
    age = Column(Integer, nullable=False)
    gender = Column(String(20), nullable=False)
    country = Column(String(100), nullable=False)
    academic_level = Column(String(50), nullable=False)
    most_used_platform = Column(String(50), nullable=False)
    purpose_of_use = Column(String(50), nullable=False)
    avg_daily_usage_hours = Column(Float, nullable=False)
    daily_unlocks = Column(Integer, nullable=False)
    study_hours = Column(Float, nullable=False)
    physical_activity_hours = Column(Float, nullable=False)
    sleep_hours_per_night = Column(Float, nullable=False)
    stress_level = Column(String(20), nullable=False)

    # Machine Learning Output Fields
    score = Column(Float, nullable=False)           # e.g., 5.97 / 10
    score_100 = Column(Integer, nullable=False)      # e.g., 60 / 100
    prediction = Column(String(100), nullable=False) # e.g., 'Moderate range'
    category = Column(String(50), nullable=False)    # e.g., 'Moderate'

    # Structured details & Recommendations stored as JSON or JSON-encoded text
    recommendations = Column(Text, nullable=True)
    form_data = Column(Text, nullable=True)

    assessment_date = Column(DateTime, default=datetime.utcnow, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship('User', back_populates='assessments')

    def get_recommendations_list(self):
        if not self.recommendations:
            return []
        try:
            return json.loads(self.recommendations)
        except Exception:
            return []

    def get_form_data_dict(self):
        if self.form_data:
            try:
                return json.loads(self.form_data)
            except Exception:
                pass
        return {
            'age': self.age,
            'gender': self.gender,
            'country': self.country,
            'academic_level': self.academic_level,
            'most_used_platform': self.most_used_platform,
            'purpose_of_use': self.purpose_of_use,
            'avg_daily_usage_hours': self.avg_daily_usage_hours,
            'daily_unlocks': self.daily_unlocks,
            'study_hours': self.study_hours,
            'physical_activity_hours': self.physical_activity_hours,
            'sleep_hours_per_night': self.sleep_hours_per_night,
            'stress_level': self.stress_level
        }

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'date': self.assessment_date.isoformat() if self.assessment_date else self.created_at.isoformat(),
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'score': self.score,
            'score_100': self.score_100,
            'prediction': self.prediction,
            'category': self.category,
            'formData': self.get_form_data_dict(),
            'recommendations': self.get_recommendations_list()
        }


class MoodEntry(Base):
    __tablename__ = 'mood_entries'

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    date = Column(String(20), index=True, nullable=False) # 'YYYY-MM-DD'
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)
    mood = Column(Integer, nullable=False) # 1 to 5
    label = Column(String(50), nullable=False)
    emoji = Column(String(10), nullable=False)
    note = Column(Text, nullable=True)
    is_voice_entry = Column(Boolean, default=False, nullable=False)
    transcript = Column(Text, nullable=True)
    text_sentiment_score = Column(Float, nullable=True)
    vocal_tone_score = Column(Float, nullable=True)
    blended_mood_score = Column(Float, nullable=True)
    vocal_metrics = Column(Text, nullable=True) # JSON-encoded text
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship('User', back_populates='moods')

    def get_vocal_metrics_dict(self):
        if not self.vocal_metrics:
            return None
        try:
            return json.loads(self.vocal_metrics)
        except Exception:
            return None

    def to_dict(self):
        return {
            'id': f"m_{self.id}",
            'db_id': self.id,
            'user_id': self.user_id,
            'date': self.date,
            'timestamp': self.timestamp.isoformat() if self.timestamp else self.created_at.isoformat(),
            'mood': self.mood,
            'label': self.label,
            'emoji': self.emoji,
            'note': self.note or '',
            'isVoiceEntry': bool(self.is_voice_entry),
            'transcript': self.transcript,
            'textSentimentScore': self.text_sentiment_score,
            'vocalToneScore': self.vocal_tone_score,
            'blendedMoodScore': self.blended_mood_score,
            'vocalMetrics': self.get_vocal_metrics_dict(),
            'createdAt': self.created_at.isoformat() if self.created_at else None
        }


class JournalEntry(Base):
    __tablename__ = 'journal_entries'

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    date_str = Column(String(20), index=True, nullable=False) # 'YYYY-MM-DD'
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=False)
    ai_reflection = Column(Text, nullable=True) # JSON-encoded reflection
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship('User', back_populates='journals')

    def get_ai_reflection_dict(self):
        if not self.ai_reflection:
            return None
        try:
            return json.loads(self.ai_reflection)
        except Exception:
            return None

    def to_dict(self):
        return {
            'id': f"j_{self.id}",
            'db_id': self.id,
            'user_id': self.user_id,
            'date': self.created_at.isoformat() if self.created_at else datetime.utcnow().isoformat(),
            'dateStr': self.date_str,
            'title': self.title,
            'content': self.content,
            'aiReflection': self.get_ai_reflection_dict(),
            'updatedAt': self.updated_at.isoformat() if self.updated_at else self.created_at.isoformat()
        }


class Goal(Base):
    __tablename__ = 'goals'

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    category = Column(String(50), default="General", nullable=False)
    status = Column(String(20), default="in_progress", nullable=False) # "in_progress" | "completed" | "archived"
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship('User', back_populates='goals')

    def to_dict(self):
        return {
            'id': f"g_{self.id}",
            'db_id': self.id,
            'user_id': self.user_id,
            'title': self.title,
            'category': self.category,
            'status': self.status,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None
        }


class ChatMessage(Base):
    __tablename__ = 'chat_messages'

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    role = Column(String(20), nullable=False) # "user" | "bot"
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship('User', back_populates='chat_messages')

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'role': self.role,
            'content': self.content,
            'createdAt': self.created_at.isoformat() if self.created_at else None
        }


class PasswordResetToken(Base):
    __tablename__ = 'password_reset_tokens'

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    token_hash = Column(String(64), unique=True, index=True, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    used_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship('User', back_populates='password_reset_tokens')

    def is_valid(self) -> bool:
        """Returns True if token has not expired and has not been used."""
        return self.used_at is None and datetime.utcnow() < self.expires_at

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'expires_at': self.expires_at.isoformat() if self.expires_at else None,
            'used_at': self.used_at.isoformat() if self.used_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


