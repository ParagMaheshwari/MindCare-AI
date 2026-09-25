# MindCare AI — Production Deployment Guide

This guide provides step-by-step instructions to deploy the MindCare AI platform to production environments (such as Render, Railway, AWS, DigitalOcean, Heroku, Vercel, Netlify, or Docker).

---

## Architecture Overview

- **Backend API**: Python 3.10+ / FastAPI / SQLAlchemy / Uvicorn.
- **Machine Learning**: Scikit-Learn RandomForest Pipeline (`backend/Mental_Health_Model.pkl`).
- **Database**: MySQL 8.0+ (with automatic SQLite fallback for maximum resilience).
- **Authentication**: JWT (HS256) + salted bcrypt (12 rounds) passwords + SHA-256 password reset tokens.
- **Frontend**: Pure modern static HTML5, CSS3, and ES6+ JavaScript.
- **AI Wellness Assistant**: Google Gemini API (`gemini-2.5-flash` with grounded wellness fallback).
- **Email Service**: Gmail SMTP (STARTTLS on port 587) or transactional email providers.

---

## 1. Prerequisites

- Python 3.10, 3.11, or 3.12
- MySQL 8.0+ database (or use cloud-managed database on AWS RDS, Railway, Render, etc.)
- Google Gemini API Key (optional, for real-time AI reflections and chat)
- Gmail account with 2-Step Verification and a 16-character Google App Password (for password reset emails)

---

## 2. Environment Variables Configuration

Copy `backend/.env.example` to `backend/.env` (or configure these variables directly in your hosting platform dashboard):

```bash
# Server & Network Configuration
PORT=8000
HOST=0.0.0.0
# Set this to your actual production frontend URL (e.g. https://mindcare.yourdomain.com)
ALLOWED_ORIGINS=https://mindcare.yourdomain.com
# Set this to your public frontend URL to generate accurate password reset links
FRONTEND_URL=https://mindcare.yourdomain.com

# Gemini AI API Configuration
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash

# Database Configuration (Option A: Recommended for Cloud Hosting)
DATABASE_URL=mysql+pymysql://username:password@hostname:3306/mindcare_db

# Database Configuration (Option B: Granular parameters)
# DB_HOST=your_mysql_host
# DB_PORT=3306
# DB_USER=your_db_user
# DB_PASSWORD=your_db_password
# DB_NAME=mindcare_db

# Security & JWT Authentication
# Generate a strong 64-char key: python -c "import secrets; print(secrets.token_hex(32))"
SECRET_KEY=your_64_character_random_jwt_secret_key_here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440

# Transactional Email (Gmail SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your_gmail_address@gmail.com
SMTP_PASSWORD=your_16_digit_google_app_password
MAIL_FROM=MindCare AI <your_gmail_address@gmail.com>
SMTP_USE_TLS=true
SMTP_USE_SSL=false

# Administrator Bootstrap Account
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=your_strong_admin_password_here
```

---

## 3. Backend Deployment

### Step A: Install Dependencies
```bash
cd backend
python -m venv .venv
# On Linux/macOS:
source .venv/bin/activate
# On Windows:
.venv\Scripts\activate

pip install --upgrade pip
pip install -r requirements.txt
```

### Step B: Verify the ML Model
Ensure that `backend/Mental_Health_Model.pkl` (approx. 25 MB) is located in the `backend/` directory. The FastAPI backend loads this model automatically on startup.

### Step C: Start the Backend Service

**For Local Production-Like Testing:**
```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

**For Production Linux / PaaS Platforms (Render, Railway, Heroku):**
Use the provided `Procfile` or run:
```bash
uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 2
```

**For Docker Deployments:**
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

---

## 4. Frontend Deployment

The frontend consists of static assets located in the `frontend/` directory.

### Step A: Configure Backend API Endpoint
Edit `frontend/js/config.js` (or inject it during your CI/CD build):
```javascript
window.MINDCARE_CONFIG = {
  // If your backend is hosted on a separate domain:
  API_BASE_URL: "https://your-mindcare-backend.onrender.com"
  
  // If your frontend and backend share the same domain / reverse-proxy:
  // API_BASE_URL: ""
};
```

### Step B: Deploy Static Files
Deploy the contents of the `frontend/` directory to any static web host:
- **Vercel / Netlify**: Connect repository, set publish directory to `frontend`.
- **Cloudflare Pages**: Set build output directory to `frontend`.
- **Nginx**:
  ```nginx
  server {
      listen 80;
      server_name mindcare.yourdomain.com;
      root /var/www/mindcare/frontend;
      index index.html;

      location / {
          try_files $uri $uri/ $uri.html /index.html;
      }

      location /api/ {
          proxy_pass http://127.0.0.1:8000/;
          proxy_set_header Host $host;
          proxy_set_header X-Real-IP $remote_addr;
      }
  }
  ```

---

## 5. Post-Deployment Verification Checklist

1. **Backend Health**: `GET https://your-backend-domain.com/health` returns `{"status": "ok", "model_loaded": true}`.
2. **Interactive Docs**: Visit `https://your-backend-domain.com/docs` to test Swagger UI.
3. **Frontend Connectivity**: Open your deployed frontend URL in the browser and complete an assessment to verify prediction generation and report download.
4. **Auth & Isolation**: Register a test user account and confirm dashboard metrics load properly.
5. **Password Reset**: Use the "Forgot Password" link on the login page to confirm email dispatch and password reset flow.
