"""
email_service.py — Robust Transactional Email Service for MindCare AI

Supports:
  1. Standard / Gmail SMTP (SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, MAIL_FROM)
  2. Resend API (RESEND_API_KEY or EMAIL_API_KEY)
  3. Brevo API (BREVO_API_KEY)
  4. SendGrid API (SENDGRID_API_KEY)
  5. Test sink mode (TEST_EMAIL_SINK=true) for automated integration testing
"""

import json
import logging
import os
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Dict, Any, Optional, Tuple
import urllib.request
import urllib.error
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))
load_dotenv()

logger = logging.getLogger("mindcare-email")

# In-memory email sink for testing / local verification
SENT_EMAILS_LOG = []


class EmailDeliveryError(Exception):
    """Raised when an email provider fails to dispatch a message."""
    pass


def get_email_config() -> Dict[str, Any]:
    """
    Reads transactional email configuration from environment variables.
    Dynamically reloads backend/.env with override=True on each call so credential
    updates are picked up immediately.
    Supports SMTP_USERNAME / SMTP_USER / GMAIL_USERNAME and SMTP_PASSWORD / GMAIL_APP_PASSWORD.
    Sanitizes Gmail App Passwords by stripping accidental spaces.
    """
    env_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if os.path.exists(env_file):
        load_dotenv(dotenv_path=env_file, override=True)
    else:
        load_dotenv(override=True)

    smtp_host = os.getenv("SMTP_HOST", os.getenv("GMAIL_HOST", "smtp.gmail.com")).strip()
    smtp_port_raw = os.getenv("SMTP_PORT", os.getenv("GMAIL_PORT", "587")).strip()
    try:
        smtp_port = int(smtp_port_raw)
    except ValueError:
        smtp_port = 587

    smtp_user_raw = os.getenv("SMTP_USERNAME", os.getenv("SMTP_USER", os.getenv("GMAIL_USERNAME", os.getenv("GMAIL_USER", "")))).strip()
    # Google App Passwords are 16 chars often copied with spaces (e.g. 'abcd efgh ijkl mnop')
    smtp_password_raw = os.getenv("SMTP_PASSWORD", os.getenv("GMAIL_APP_PASSWORD", os.getenv("GMAIL_PASSWORD", os.getenv("SMTP_PASS", "")))).strip().replace(" ", "")

    # Filter out template placeholders
    placeholder_tokens = ("your_gmail", "your_16_digit", "your_app_password", "example.com", "xxxxxxxx")
    smtp_user = "" if any(p in smtp_user_raw.lower() for p in placeholder_tokens) else smtp_user_raw
    smtp_password = "" if any(p in smtp_password_raw.lower() for p in placeholder_tokens) else smtp_password_raw

    # Mail sender address resolution
    raw_from = os.getenv("MAIL_FROM", os.getenv("EMAIL_FROM", os.getenv("GMAIL_FROM", ""))).strip()
    if raw_from and not any(p in raw_from.lower() for p in placeholder_tokens) and "resend.dev" not in raw_from:
        if "<" in raw_from and ">" in raw_from:
            mail_from = raw_from
        else:
            mail_from = f"MindCare AI <{raw_from}>"
    elif smtp_user:
        mail_from = f"MindCare AI <{smtp_user}>"
    else:
        mail_from = "MindCare AI <no-reply@mindcare.ai>"

    frontend_url = os.getenv("FRONTEND_URL", "http://127.0.0.1:5500").strip().rstrip("/")

    smtp_use_tls = os.getenv("SMTP_USE_TLS", "true").lower() in ("true", "1", "yes")
    smtp_use_ssl = os.getenv("SMTP_USE_SSL", "false").lower() in ("true", "1", "yes") or smtp_port == 465

    return {
        "smtp_host": smtp_host,
        "smtp_port": smtp_port,
        "smtp_user": smtp_user,
        "smtp_password": smtp_password,
        "email_from": mail_from,
        "frontend_url": frontend_url,
        "smtp_use_tls": smtp_use_tls,
        "smtp_use_ssl": smtp_use_ssl,
        "resend_api_key": os.getenv("RESEND_API_KEY", os.getenv("EMAIL_API_KEY", "")).strip(),
        "brevo_api_key": os.getenv("BREVO_API_KEY", "").strip(),
        "sendgrid_api_key": os.getenv("SENDGRID_API_KEY", "").strip(),
        "test_email_sink": os.getenv("TEST_EMAIL_SINK", "false").lower() in ("true", "1", "yes"),
    }


def log_email_config_status() -> None:
    """Logs the status of transactional email configuration without printing sensitive credentials."""
    cfg = get_email_config()
    smtp_host_set = bool(cfg["smtp_host"])
    smtp_port_set = bool(cfg["smtp_port"])
    smtp_user_set = bool(cfg["smtp_user"])
    smtp_pw_set = bool(cfg["smtp_password"])
    mail_from_set = bool(cfg["email_from"] and "no-reply@mindcare.ai" not in cfg["email_from"])
    frontend_url_set = bool(cfg["frontend_url"])

    logger.info("==================================================")
    logger.info("MindCare AI — Email Service Configuration Status:")
    logger.info("  SMTP_HOST configured:     %s (%s)", smtp_host_set, cfg["smtp_host"] or "not set")
    logger.info("  SMTP_PORT configured:     %s (%s)", smtp_port_set, cfg["smtp_port"])
    logger.info("  SMTP_USERNAME configured: %s", smtp_user_set)
    logger.info("  SMTP_PASSWORD configured: %s", smtp_pw_set)
    logger.info("  MAIL_FROM configured:     %s (%s)", mail_from_set, cfg["email_from"])
    logger.info("  FRONTEND_URL configured:  %s (%s)", frontend_url_set, cfg["frontend_url"])
    
    if smtp_host_set and (not smtp_user_set or not smtp_pw_set):
        logger.error(
            "  CONFIGURATION ERROR: SMTP_HOST is set to '%s' but SMTP_USERNAME or SMTP_PASSWORD is missing in backend/.env!",
            cfg["smtp_host"]
        )
    elif smtp_host_set and smtp_user_set and smtp_pw_set:
        logger.info("  Active Email Provider:    Gmail SMTP (%s:%s)", cfg["smtp_host"], cfg["smtp_port"])
    logger.info("==================================================")


def build_reset_email_content(reset_url: str) -> Tuple[str, str]:
    """
    Constructs the exact plain text and styled responsive HTML email for password reset.
    Subject: Reset Your Password
    """
    plain_text = (
        "You requested a password reset for your MindCare AI account.\n\n"
        "Click the link below to create a new password:\n"
        f"{reset_url}\n\n"
        "⏱ This link expires after 30 minutes.\n\n"
        "If you did not request this, you can safely ignore this email. Your password will remain unchanged.\n\n"
        "— MindCare AI Team\n"
    )

    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password — MindCare AI</title>
</head>
<body style="margin:0; padding:0; background-color:#0B111E; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#E2E8F0;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#0B111E; padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:540px; background-color:#131E30; border:1px solid rgba(255,255,255,0.08); border-radius:16px; overflow:hidden; padding:36px 32px; box-shadow:0 12px 36px rgba(0,0,0,0.35);">
          <!-- Brand Header -->
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <div style="display:inline-block; width:44px; height:44px; line-height:44px; text-align:center; background:rgba(52,211,153,0.12); border-radius:12px; font-size:20px; color:#34D399; margin-bottom:12px;">🌱</div>
              <h1 style="margin:0; font-size:22px; font-weight:700; color:#FFFFFF; letter-spacing:-0.02em;">MindCare AI</h1>
              <p style="margin:4px 0 0; font-size:13px; color:#94A3B8;">Student Mental Health & Emotional Well-Being</p>
            </td>
          </tr>

          <!-- Content Divider -->
          <tr>
            <td style="border-top:1px solid rgba(255,255,255,0.08); padding-top:24px;">
              <h2 style="margin:0 0 14px; font-size:18px; font-weight:600; color:#F8FAFC;">Reset Your Password</h2>
              <p style="margin:0 0 14px; font-size:15px; line-height:1.6; color:#CBD5E1;">
                We received a request to reset the password for your MindCare AI account.
              </p>
              <p style="margin:0 0 26px; font-size:15px; line-height:1.6; color:#CBD5E1;">
                Click the button below to choose a new password:
              </p>
            </td>
          </tr>

          <!-- Action Button -->
          <tr>
            <td align="center" style="padding-bottom:28px;">
              <a href="{reset_url}" target="_blank" style="display:inline-block; background-color:#34D399; color:#064E3B; font-size:15px; font-weight:600; text-decoration:none; padding:13px 32px; border-radius:10px; box-shadow:0 4px 14px rgba(52,211,153,0.3); letter-spacing:0.01em;">
                Reset Password
              </a>
            </td>
          </tr>

          <!-- Expiry Notice -->
          <tr>
            <td style="background-color:rgba(15,23,42,0.6); border-radius:10px; padding:16px; margin-bottom:24px;">
              <p style="margin:0 0 6px; font-size:13px; font-weight:600; color:#F1F5F9;">
                ⏱ Security Expiration: 30 minutes
              </p>
              <p style="margin:0; font-size:13px; color:#94A3B8; line-height:1.5;">
                If you did not request a password reset, you can safely disregard this email. Your password will remain completely secure and unchanged.
              </p>
            </td>
          </tr>

          <!-- Direct Link & Local Development Copy Box -->
          <tr>
            <td style="padding-top:20px; border-top:1px solid rgba(255,255,255,0.08);">
              <p style="margin:0 0 8px; font-size:12px; font-weight:600; color:#E2E8F0;">
                Direct Reset Link (Copy &amp; Paste):
              </p>
              <div style="background:#0B111E; border:1px solid rgba(56,189,248,0.25); border-radius:8px; padding:12px; margin-bottom:10px; word-break:break-all;">
                <a href="{reset_url}" style="font-family:Consolas, Monaco, 'Courier New', monospace; font-size:12px; color:#38BDF8; text-decoration:none;">{reset_url}</a>
              </div>
              <p style="margin:0; font-size:11px; color:#94A3B8; line-height:1.45;">
                💡 <em>Note: For local testing (127.0.0.1 / localhost), Google's webmail security may block direct clicking. Simply copy the link above and paste it directly into your browser's address bar.</em>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:26px;">
              <p style="margin:0; font-size:12px; color:#64748B;">
                MindCare AI Sanctuary &bull; Confidential &bull; Encrypted
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""
    return plain_text, html_content


def _send_via_smtp(cfg: Dict[str, Any], to_email: str, subject: str, html: str, text: str) -> Dict[str, Any]:
    """
    Dispatches email via standard SMTP server (Gmail SMTP on port 587 with STARTTLS).
    Ensures connection is cleanly closed and detailed diagnostic logs are emitted without
    exposing passwords.
    """
    host = cfg["smtp_host"]
    port = cfg["smtp_port"]
    user = cfg["smtp_user"]
    password = cfg["smtp_password"]
    use_tls = cfg["smtp_use_tls"]
    use_ssl = cfg["smtp_use_ssl"]
    from_email = cfg["email_from"]

    if not user or not password:
        logger.error("Gmail SMTP configuration incomplete: SMTP_USERNAME or SMTP_PASSWORD is not configured in backend/.env.")
        raise EmailDeliveryError(
            "Gmail SMTP configuration incomplete: Please configure SMTP_USERNAME and SMTP_PASSWORD (16-digit Google App Password) in backend/.env."
        )

    logger.info("Attempting Gmail SMTP connection to %s:%s...", host, port)

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = from_email
    msg["To"] = to_email

    msg.attach(MIMEText(text, "plain", "utf-8"))
    msg.attach(MIMEText(html, "html", "utf-8"))

    server = None
    try:
        if use_ssl or port == 465:
            context = ssl.create_default_context()
            server = smtplib.SMTP_SSL(host, port, context=context, timeout=15)
            logger.info("SMTP connection successful (SSL established with %s:%s)", host, port)
        else:
            server = smtplib.SMTP(host, port, timeout=15)
            server.ehlo()
            logger.info("SMTP connection successful with %s:%s", host, port)
            if use_tls:
                context = ssl.create_default_context()
                server.starttls(context=context)
                server.ehlo()
                logger.info("SMTP STARTTLS encryption established")

        masked_user = (user[:3] + "***@" + user.split("@")[-1]) if "@" in user else (user[:3] + "***")
        logger.info("Authenticating with SMTP server as %s...", masked_user)
        server.login(user, password)
        logger.info("SMTP authentication successful")

        server.send_message(msg)
        logger.info("Password reset email sent successfully via SMTP to %s", to_email)
        return {"status": "ok", "provider": "smtp"}
    except smtplib.SMTPAuthenticationError as e:
        logger.error("SMTP Authentication Failed on %s:%s (Code %s): %s", host, port, e.smtp_code, e.smtp_error)
        raise EmailDeliveryError("SMTP authentication failed: Please verify your Gmail App Password / SMTP credentials.")
    except smtplib.SMTPConnectError as e:
        logger.error("SMTP Connection Failed to %s:%s: %s", host, port, e)
        raise EmailDeliveryError(f"Failed to connect to SMTP server at {host}:{port}.")
    except Exception as e:
        logger.error("SMTP delivery failure (%s:%s): %s", host, port, e)
        raise EmailDeliveryError(f"SMTP delivery failed: {str(e)}")
    finally:
        if server:
            try:
                server.quit()
                logger.info("SMTP connection closed cleanly")
            except Exception:
                try:
                    server.close()
                except Exception:
                    pass


def _send_via_resend(api_key: str, from_email: str, to_email: str, subject: str, html: str, text: str) -> Dict[str, Any]:
    """Dispatches transactional email via Resend API."""
    logger.info("Attempting email dispatch via Resend API to %s...", to_email)
    url = "https://api.resend.com/emails"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "User-Agent": "MindCare-AI/1.0",
    }
    payload = {
        "from": from_email,
        "to": [to_email],
        "subject": subject,
        "html": html,
        "text": text,
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")

    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            resp_body = resp.read().decode("utf-8")
            logger.info("Email successfully dispatched via Resend to %s. Status: %s", to_email, resp.status)
            return json.loads(resp_body) if resp_body else {"status": "ok", "provider": "resend"}
    except urllib.error.HTTPError as e:
        error_msg = e.read().decode("utf-8", errors="ignore")
        if e.code == 403:
            logger.error(
                "Resend API Sandbox Restriction (403): Free-tier Resend only delivers to the owner's verified address. "
                "To deliver password reset emails to any student/user address (e.g. %s), please configure Gmail SMTP "
                "in backend/.env with SMTP_HOST=smtp.gmail.com, SMTP_PORT=587, SMTP_USERNAME=your_gmail@gmail.com, "
                "and SMTP_PASSWORD=your_16_digit_app_password. Raw error: %s",
                to_email, error_msg
            )
            raise EmailDeliveryError(
                f"Resend sandbox restriction: The free-tier key only allows sending to the account owner. "
                f"To send emails to {to_email}, configure Gmail SMTP in backend/.env."
            )
        logger.error("Resend API HTTP Error %s: %s", e.code, error_msg)
        raise EmailDeliveryError(f"Resend service error ({e.code}): {error_msg}")
    except Exception as e:
        logger.error("Resend API connection failure: %s", e)
        raise EmailDeliveryError(f"Failed to connect to Resend API: {e}")


def _send_via_brevo(api_key: str, from_email: str, to_email: str, subject: str, html: str, text: str) -> Dict[str, Any]:
    """Dispatches transactional email via Brevo (Sendinblue) API."""
    logger.info("Attempting email dispatch via Brevo API to %s...", to_email)
    url = "https://api.brevo.com/v3/smtp/email"
    headers = {
        "api-key": api_key,
        "Content-Type": "application/json",
        "User-Agent": "MindCare-AI/1.0",
    }
    payload = {
        "sender": {"email": from_email.split("<")[-1].rstrip(">").strip(), "name": "MindCare AI"},
        "to": [{"email": to_email}],
        "subject": subject,
        "htmlContent": html,
        "textContent": text,
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")

    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            resp_body = resp.read().decode("utf-8")
            logger.info("Email successfully dispatched via Brevo to %s. Status: %s", to_email, resp.status)
            return json.loads(resp_body) if resp_body else {"status": "ok", "provider": "brevo"}
    except urllib.error.HTTPError as e:
        error_msg = e.read().decode("utf-8", errors="ignore")
        logger.error("Brevo API HTTP Error %s: %s", e.code, error_msg)
        raise EmailDeliveryError(f"Brevo service error ({e.code}): {error_msg}")
    except Exception as e:
        logger.error("Brevo API connection failure: %s", e)
        raise EmailDeliveryError(f"Failed to connect to Brevo API: {e}")


def _send_via_sendgrid(api_key: str, from_email: str, to_email: str, subject: str, html: str, text: str) -> Dict[str, Any]:
    """Dispatches transactional email via SendGrid API."""
    logger.info("Attempting email dispatch via SendGrid API to %s...", to_email)
    url = "https://api.sendgrid.com/v3/mail/send"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "User-Agent": "MindCare-AI/1.0",
    }
    sender_email = from_email.split("<")[-1].rstrip(">").strip()
    payload = {
        "personalizations": [{"to": [{"email": to_email}]}],
        "from": {"email": sender_email, "name": "MindCare AI"},
        "subject": subject,
        "content": [
            {"type": "text/plain", "value": text},
            {"type": "text/html", "value": html},
        ],
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")

    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            logger.info("Email successfully dispatched via SendGrid to %s. Status: %s", to_email, resp.status)
            return {"status": "ok", "provider": "sendgrid"}
    except urllib.error.HTTPError as e:
        error_msg = e.read().decode("utf-8", errors="ignore")
        logger.error("SendGrid API HTTP Error %s: %s", e.code, error_msg)
        raise EmailDeliveryError(f"SendGrid service error ({e.code}): {error_msg}")
    except Exception as e:
        logger.error("SendGrid API connection failure: %s", e)
        raise EmailDeliveryError(f"Failed to connect to SendGrid API: {e}")


def dispatch_email(to_email: str, subject: str, html_body: str, plain_text_body: str) -> Dict[str, Any]:
    """
    Master email dispatcher that routes to the configured email provider in order of preference:
    1. SMTP (e.g. Gmail SMTP if SMTP_HOST is populated)
    2. Resend API (if RESEND_API_KEY / EMAIL_API_KEY starts with re_)
    3. Brevo API (if BREVO_API_KEY is present)
    4. SendGrid API (if SENDGRID_API_KEY is present)
    """
    cfg = get_email_config()

    # In-memory test sink mode
    if cfg["test_email_sink"]:
        logger.info("TEST_EMAIL_SINK: Intercepted email to %s with subject '%s'", to_email, subject)
        record = {
            "to": to_email,
            "subject": subject,
            "html": html_body,
            "text": plain_text_body,
        }
        SENT_EMAILS_LOG.append(record)
        return {"status": "sink_recorded", "to": to_email}

    # 1. Standard / Gmail SMTP
    if cfg["smtp_host"]:
        return _send_via_smtp(cfg, to_email, subject, html_body, plain_text_body)

    # 2. Resend API
    resend_key = cfg["resend_api_key"]
    if resend_key and resend_key.startswith("re_"):
        return _send_via_resend(resend_key, cfg["email_from"], to_email, subject, html_body, plain_text_body)

    # 3. Brevo API
    if cfg["brevo_api_key"]:
        return _send_via_brevo(cfg["brevo_api_key"], cfg["email_from"], to_email, subject, html_body, plain_text_body)

    # 4. SendGrid API
    if cfg["sendgrid_api_key"]:
        return _send_via_sendgrid(cfg["sendgrid_api_key"], cfg["email_from"], to_email, subject, html_body, plain_text_body)

    # 5. Generic Resend fallback
    if resend_key:
        return _send_via_resend(resend_key, cfg["email_from"], to_email, subject, html_body, plain_text_body)

    logger.error("No transactional email provider configured in backend/.env!")
    raise EmailDeliveryError(
        "Email delivery service is not configured. Please configure SMTP_HOST, SMTP_USERNAME, "
        "and SMTP_PASSWORD (or RESEND_API_KEY) in backend/.env."
    )


def build_reset_url(frontend_url: str, raw_token: str) -> str:
    """
    Constructs the absolute password reset URL based on FRONTEND_URL.
    Supports both clean-routed single-page apps and static multi-page HTML environments (e.g. Live Server).
    """
    base = frontend_url.strip().rstrip("/")
    if base.endswith(".html") or "/reset-password" in base:
        sep = "&" if "?" in base else "?"
        return f"{base}{sep}token={raw_token}"
    return f"{base}/reset-password.html?token={raw_token}"


def send_password_reset_email(to_email: str, reset_url_or_token: str) -> Dict[str, Any]:
    """
    Sends the official password reset email to the user.
    Accepts either a full reset_url or a raw token.
    Constructs the secure link: FRONTEND_URL/reset-password.html?token=<secure-token>
    """
    cfg = get_email_config()
    frontend_url = cfg["frontend_url"]

    if reset_url_or_token.startswith("http://") or reset_url_or_token.startswith("https://"):
        reset_url = reset_url_or_token
        raw_token = reset_url_or_token.split("token=")[-1] if "token=" in reset_url_or_token else "token"
    else:
        raw_token = reset_url_or_token
        reset_url = build_reset_url(frontend_url, raw_token)

    subject = "Reset Your Password"
    text, html = build_reset_email_content(reset_url)

    record = {
        "to": to_email,
        "subject": subject,
        "reset_url": reset_url,
        "raw_token": raw_token,
        "text": text,
        "html": html,
    }
    SENT_EMAILS_LOG.append(record)

    # Save to scratch for test inspection if folder exists
    try:
        scratch_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "scratch")
        if os.path.exists(scratch_dir):
            token_file = os.path.join(scratch_dir, ".latest_reset_token.json")
            with open(token_file, "w", encoding="utf-8") as f:
                json.dump(record, f)
    except Exception:
        pass

    return dispatch_email(to_email, subject, html, text)


def send_test_email(to_email: str) -> Dict[str, Any]:
    """
    Sends a test verification email to confirm SMTP / email service health and credentials.
    Used by the POST /test-email development endpoint.
    """
    cfg = get_email_config()
    subject = "MindCare AI — SMTP Configuration Test"
    provider_hint = f"SMTP ({cfg['smtp_host']}:{cfg['smtp_port']})" if cfg["smtp_host"] else "API Provider"

    plain_text = (
        "Hello,\n\n"
        f"This is a test email sent from MindCare AI to verify your email delivery configuration ({provider_hint}).\n\n"
        "If you received this message, your email service and SMTP settings are operational.\n\n"
        "— MindCare AI System\n"
    )

    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>MindCare AI — SMTP Test</title></head>
<body style="margin:0; padding:30px 16px; background-color:#0B111E; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color:#E2E8F0;">
  <div style="max-width:500px; margin:0 auto; background-color:#131E30; border:1px solid rgba(255,255,255,0.08); border-radius:14px; padding:28px 24px; text-align:center;">
    <div style="font-size:32px; margin-bottom:12px;">🌱</div>
    <h2 style="margin:0 0 10px; font-size:20px; color:#FFFFFF;">SMTP Connection Test Successful</h2>
    <p style="margin:0 0 16px; font-size:14px; color:#94A3B8; line-height:1.6;">
      This email confirms that your email service provider (<strong style="color:#34D399;">{provider_hint}</strong>) is configured and delivering messages successfully to <strong style="color:#FFFFFF;">{to_email}</strong>.
    </p>
    <div style="background:rgba(52,211,153,0.1); border:1px solid rgba(52,211,153,0.3); border-radius:8px; padding:12px; color:#34D399; font-size:13px; font-weight:600;">
      ✓ Verification Status: Active & Operational
    </div>
  </div>
</body>
</html>"""

    return dispatch_email(to_email, subject, html_content, plain_text)

