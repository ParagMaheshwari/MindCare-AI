"""
report_generator.py — Generates professional, multi-page PDF reports
for MindCare AI assessments using ReportLab.
"""

import io
from datetime import datetime
from typing import Any, Dict, List, Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    HRFlowable,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


class NumberedCanvas(canvas.Canvas):
    """Two-pass canvas to dynamically compute total page count (Page X of Y)."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count: int):
        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#6B7A75"))

        # Running header on page 2+
        if self._pageNumber > 1:
            self.drawString(40, 755, "MindCare AI — Mental Wellness Assessment Report")
            self.setStrokeColor(colors.HexColor("#D1DCD6"))
            self.setLineWidth(0.6)
            self.line(40, 748, 572, 748)

        # Running footer on all pages
        self.setStrokeColor(colors.HexColor("#D1DCD6"))
        self.setLineWidth(0.6)
        self.line(40, 42, 572, 42)

        disclaimer = "MindCare AI is an educational wellness tool. It does not provide clinical or psychiatric diagnosis."
        self.drawString(40, 30, disclaimer)
        page_str = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(572, 30, page_str)
        self.restoreState()


def normalize_form_data(raw: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Extracts and normalizes assessment questionnaire parameters regardless of casing or schema format."""
    if not raw or not isinstance(raw, dict):
        return {}

    def get_val(*keys, default="—"):
        for k in keys:
            if k in raw and raw[k] is not None:
                return raw[k]
            for rk, rv in raw.items():
                if rk.lower().replace("_", "") == k.lower().replace("_", "") and rv is not None:
                    return rv
        return default

    return {
        "age": get_val("age", "Age"),
        "gender": get_val("gender", "Gender"),
        "country": get_val("country", "Country", "Grouped_country"),
        "academic_level": get_val("academic_level", "academicLevel", "Academic_Level"),
        "most_used_platform": get_val("most_used_platform", "mostUsedPlatform", "Most_Used_Platform"),
        "purpose_of_use": get_val("purpose_of_use", "purposeOfUse", "Purpose_Of_Use"),
        "avg_daily_usage_hours": get_val("avg_daily_usage_hours", "avgDailyUsageHours", "Daily_Screen_Time_Hours", "daily_usage"),
        "daily_unlocks": get_val("daily_unlocks", "dailyUnlocks", "Daily_Unlocks"),
        "study_hours": get_val("study_hours", "studyHours", "Study_Hours"),
        "physical_activity_hours": get_val("physical_activity_hours", "physicalActivityHours", "Physical_Activity_Hours", "Physical_Activity_Hours_Per_Week"),
        "sleep_hours_per_night": get_val("sleep_hours_per_night", "sleepHoursPerNight", "Sleep_Hours_Per_Night", "Sleep_Duration_Hours"),
        "stress_level": get_val("stress_level", "stressLevel", "Stress_Level"),
    }


def normalize_additional_data(raw: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Extracts and flattens additional engagement metrics safely."""
    if not raw or not isinstance(raw, dict):
        return {}
    res = {}
    mood = raw.get("today_mood") or raw.get("recent_mood")
    if isinstance(mood, dict):
        res["recent_mood"] = mood.get("mood") or mood.get("tag") or str(mood)
    elif mood:
        res["recent_mood"] = str(mood)

    streaks = raw.get("streaks") or raw.get("mood_streak")
    if isinstance(streaks, dict):
        res["mood_streak"] = streaks.get("currentStreak") or streaks.get("current") or streaks.get("streak")
    elif streaks is not None:
        res["mood_streak"] = streaks

    goals = raw.get("goals_count") or raw.get("completed_goals") or raw.get("goals")
    if isinstance(goals, list):
        res["completed_goals"] = len(goals)
    elif goals is not None:
        res["completed_goals"] = goals

    total = raw.get("total_assessments")
    if total is not None:
        res["total_assessments"] = total

    return res


def build_pdf_report(
    user_name: Optional[str] = "Student",
    user_email: Optional[str] = "student@mindcare.ai",
    assessment_id: Optional[Any] = None,
    assessment_date: Optional[Any] = None,
    score: float = 7.0,
    score_100: Optional[int] = None,
    prediction: Optional[str] = None,
    form_data: Optional[Dict[str, Any]] = None,
    recommendations: Optional[List[Any]] = None,
    additional_data: Optional[Dict[str, Any]] = None,
) -> bytes:
    """Builds a complete, multi-page PDF report as raw bytes."""
    buffer = io.BytesIO()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        leftMargin=40,
        rightMargin=40,
        topMargin=48,
        bottomMargin=54,
    )

    styles = getSampleStyleSheet()

    # Brand Colors
    PRIMARY = colors.HexColor("#1E453A")
    SECONDARY = colors.HexColor("#2F5D50")
    ACCENT_TINT = colors.HexColor("#EAF2EE")
    BORDER_COLOR = colors.HexColor("#CBD8D2")
    TEXT_COLOR = colors.HexColor("#1C2B27")
    MUTED_COLOR = colors.HexColor("#52615C")

    # Typography Styles
    title_style = ParagraphStyle(
        "ReportTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=20,
        leading=24,
        textColor=PRIMARY,
    )

    sub_style = ParagraphStyle(
        "ReportSubtitle",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=13,
        textColor=MUTED_COLOR,
    )

    h2_style = ParagraphStyle(
        "ReportH2",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=16,
        textColor=PRIMARY,
        spaceBefore=12,
        spaceAfter=6,
    )

    cell_label = ParagraphStyle(
        "CellLabel",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8.5,
        leading=11,
        textColor=PRIMARY,
    )

    cell_val = ParagraphStyle(
        "CellVal",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=11,
        textColor=TEXT_COLOR,
    )

    # Normalize inputs defensively
    form_data = normalize_form_data(form_data)
    extra_data = normalize_additional_data(additional_data)
    user_name_str = str(user_name or "Student")
    user_email_str = str(user_email or "student@mindcare.ai")
    assessment_id_str = str(assessment_id) if assessment_id is not None else f"a_{int(datetime.now().timestamp())}"

    # Calculate scores
    score_val = float(score) if score is not None else 7.0
    score_100_val = int(score_100) if score_100 is not None else int(round(score_val * 10))

    story = []

    # -------------------------------------------------------------------------
    # 1. Header & Branding Banner
    # -------------------------------------------------------------------------
    header_data = [
        [
            Paragraph("<b>MindCare AI</b>", ParagraphStyle("Brand", fontName="Helvetica-Bold", fontSize=15, textColor=PRIMARY)),
            Paragraph(f"Generated: {datetime.now().strftime('%b %d, %Y at %I:%M %p')}", ParagraphStyle("GenDate", fontName="Helvetica", fontSize=8.5, alignment=2, textColor=MUTED_COLOR)),
        ],
        [
            Paragraph("Mental Wellness Assessment Report", title_style),
            Paragraph(f"Report ID: {assessment_id_str}", ParagraphStyle("RepId", fontName="Helvetica", fontSize=8.5, alignment=2, textColor=MUTED_COLOR)),
        ],
    ]
    header_table = Table(header_data, colWidths=[360, 172])
    header_table.setStyle(
        TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ])
    )
    story.append(header_table)
    story.append(Spacer(1, 8))
    story.append(HRFlowable(width="100%", thickness=1.5, color=PRIMARY, spaceBefore=2, spaceAfter=14))

    # -------------------------------------------------------------------------
    # 2. Executive Result & ML Prediction Callout
    # -------------------------------------------------------------------------
    score_display = f"{score_100_val} / 100"
    pred_label = prediction or ("Higher range" if score_val >= 7.0 else ("Moderate range" if score_val >= 4.0 else "Lower range"))

    if score_val >= 7.0:
        badge_fg = colors.HexColor("#266847")
    elif score_val >= 4.0:
        badge_fg = colors.HexColor("#9E6212")
    else:
        badge_fg = colors.HexColor("#B03F29")

    # Format assessment timestamp
    if assessment_date:
        if isinstance(assessment_date, datetime):
            assessed_time_str = assessment_date.strftime("%B %d, %Y at %I:%M %p")
        else:
            try:
                dt = datetime.fromisoformat(str(assessment_date).replace("Z", "+00:00"))
                assessed_time_str = dt.strftime("%B %d, %Y at %I:%M %p")
            except Exception:
                assessed_time_str = str(assessment_date)
    else:
        assessed_time_str = datetime.now().strftime("%B %d, %Y at %I:%M %p")

    result_box_data = [
        [
            Paragraph("<b>ASSESSMENT SCORE</b>", ParagraphStyle("ScoreEyebrow", fontName="Helvetica-Bold", fontSize=8, textColor=MUTED_COLOR)),
            Paragraph("<b>MODEL PREDICTION</b>", ParagraphStyle("PredEyebrow", fontName="Helvetica-Bold", fontSize=8, textColor=MUTED_COLOR)),
            Paragraph("<b>ASSESSMENT DATE & TIME</b>", ParagraphStyle("DateEyebrow", fontName="Helvetica-Bold", fontSize=8, textColor=MUTED_COLOR)),
        ],
        [
            Paragraph(f"<font size=22><b>{score_display}</b></font> <font size=9 color='#6B7A75'>({score_val:.2f} / 10)</font>", ParagraphStyle("ScoreVal", fontName="Helvetica-Bold", textColor=PRIMARY)),
            Paragraph(f"<b>{pred_label}</b>", ParagraphStyle("PredVal", fontName="Helvetica-Bold", fontSize=13, textColor=badge_fg)),
            Paragraph(f"{assessed_time_str}", ParagraphStyle("DateVal", fontName="Helvetica", fontSize=9, textColor=TEXT_COLOR)),
        ],
        [
            Paragraph(
                "Your objective mental wellness score was calculated by our trained Random Forest Regressor pipeline using 12 demographic, digital usage, lifestyle, and self-reported stress inputs. This provides a data-driven baseline of your wellness patterns.",
                ParagraphStyle("Explanation", fontName="Helvetica", fontSize=8.5, leading=12, textColor=MUTED_COLOR),
            ),
            "",
            "",
        ],
    ]

    result_table = Table(result_box_data, colWidths=[180, 160, 192])
    result_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), ACCENT_TINT),
            ("BOX", (0, 0), (-1, -1), 1, BORDER_COLOR),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("SPAN", (0, 2), (2, 2)),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("LEFTPADDING", (0, 0), (-1, -1), 12),
            ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ])
    )
    story.append(result_table)
    story.append(Spacer(1, 14))

    # -------------------------------------------------------------------------
    # 3. User Demographics
    # -------------------------------------------------------------------------
    story.append(Paragraph("A. User Information", h2_style))

    user_info_data = [
        [
            Paragraph("Full Name", cell_label), Paragraph(user_name_str, cell_val),
            Paragraph("Email Address", cell_label), Paragraph(user_email_str, cell_val),
        ],
        [
            Paragraph("Age", cell_label), Paragraph(str(form_data.get("age", "—")), cell_val),
            Paragraph("Gender", cell_label), Paragraph(str(form_data.get("gender", "—")), cell_val),
        ],
        [
            Paragraph("Country", cell_label), Paragraph(str(form_data.get("country", "—")), cell_val),
            Paragraph("Academic Level", cell_label), Paragraph(str(form_data.get("academic_level", "—")), cell_val),
        ],
    ]

    user_table = Table(user_info_data, colWidths=[90, 176, 90, 176])
    user_table.setStyle(
        TableStyle([
            ("GRID", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
            ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F7FAF8")),
            ("BACKGROUND", (2, 0), (2, -1), colors.HexColor("#F7FAF8")),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ])
    )
    story.append(user_table)
    story.append(Spacer(1, 14))

    # -------------------------------------------------------------------------
    # 4. Complete Assessment Record (All 12 Fields)
    # -------------------------------------------------------------------------
    story.append(Paragraph("B. Complete Assessment Record", h2_style))
    story.append(Paragraph("Every parameter submitted by the user and evaluated by the machine-learning pipeline:", sub_style))
    story.append(Spacer(1, 6))

    def fmt_unit(val, unit):
        if val is None or val == "—" or str(val).strip() == "":
            return "—"
        return f"{val} {unit}"

    assessment_fields = [
        ("1. Age", fmt_unit(form_data.get('age'), 'years')),
        ("2. Gender", str(form_data.get("gender", "—"))),
        ("3. Country of Residence", str(form_data.get("country", "—"))),
        ("4. Academic Level", str(form_data.get("academic_level", "—"))),
        ("5. Most Used Social Media Platform", str(form_data.get("most_used_platform", "—"))),
        ("6. Primary Purpose of Platform Use", str(form_data.get("purpose_of_use", "—"))),
        ("7. Average Daily Social Media Usage", fmt_unit(form_data.get('avg_daily_usage_hours'), 'hours/day')),
        ("8. Daily Mobile Device Unlocks", fmt_unit(form_data.get('daily_unlocks'), 'unlocks/day')),
        ("9. Daily Study Hours", fmt_unit(form_data.get('study_hours'), 'hours/day')),
        ("10. Daily Physical Activity Hours", fmt_unit(form_data.get('physical_activity_hours'), 'hours/day')),
        ("11. Nightly Sleep Duration", fmt_unit(form_data.get('sleep_hours_per_night'), 'hours/night')),
        ("12. Self-Reported Overall Stress Level", str(form_data.get("stress_level", "—"))),
    ]

    record_rows = [
        [Paragraph("<b>Assessment Question / Parameter</b>", cell_label), Paragraph("<b>User Submitted Response</b>", cell_label)]
    ]
    for i, (q, a) in enumerate(assessment_fields):
        record_rows.append([Paragraph(q, cell_val), Paragraph(f"<b>{a}</b>", cell_val)])

    record_table = Table(record_rows, colWidths=[290, 242])
    record_table_style = [
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ("BACKGROUND", (0, 0), (-1, 0), ACCENT_TINT),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]
    for r in range(1, len(record_rows)):
        if r % 2 == 0:
            record_table_style.append(("BACKGROUND", (0, r), (-1, r), colors.HexColor("#FAFCFB")))
    record_table.setStyle(TableStyle(record_table_style))
    story.append(record_table)
    story.append(Spacer(1, 14))

    # -------------------------------------------------------------------------
    # 5. Personalized Recommendations (Tailored to inputs)
    # -------------------------------------------------------------------------
    story.append(KeepTogether([
        Paragraph("C. Personalized Wellness Recommendations", h2_style),
        Paragraph("Targeted, non-diagnostic guidance derived directly from your assessment responses:", sub_style),
        Spacer(1, 6),
    ]))

    recs = recommendations or []
    normalized_recs = []
    if recs:
        for r in recs:
            if isinstance(r, dict):
                tag = r.get("tag") or r.get("title") or "Wellness Pillar"
                desc = r.get("text") or r.get("desc") or ""
                if desc:
                    normalized_recs.append({"tag": str(tag), "text": str(desc)})
            elif isinstance(r, str):
                normalized_recs.append({"tag": "Wellness Suggestion", "text": r})

    if not normalized_recs:
        try:
            sleep_val = form_data.get("sleep_hours_per_night")
            sleep_h = float(sleep_val) if sleep_val not in (None, "—") else 7.0
            act_val = form_data.get("physical_activity_hours")
            act_h = float(act_val) if act_val not in (None, "—") else 1.0
            usage_val = form_data.get("avg_daily_usage_hours")
            usage_h = float(usage_val) if usage_val not in (None, "—") else 3.0
            study_val = form_data.get("study_hours")
            study_h = float(study_val) if study_val not in (None, "—") else 4.0
            stress_lvl = str(form_data.get("stress_level") or "Medium")

            if score_val < 4.0 or stress_lvl == "Very High":
                normalized_recs.append({
                    "tag": "Professional Support & Care",
                    "text": "Your score falls in a lower range or reflects heavy academic strain. We strongly recommend speaking with a university counselor, therapist, or licensed healthcare provider for individualized care."
                })
            if sleep_h < 7:
                normalized_recs.append({
                    "tag": "Sleep Routine & Recovery",
                    "text": f"You reported {sleep_h}h of nightly sleep. Aim for 7.5–8.5 hours with a 30-minute screen-free wind-down routine before bedtime to restore cognitive stamina."
                })
            if act_h < 1:
                normalized_recs.append({
                    "tag": "Physical Activity & Movement",
                    "text": "Incorporate 20–30 minutes of brisk walking or light exercise daily. Aerobic movement triggers endorphins and clears study-induced fatigue."
                })
            if usage_h > 3.5:
                platform = form_data.get('most_used_platform')
                platform_str = str(platform) if platform not in (None, "—") else "social apps"
                normalized_recs.append({
                    "tag": "Screen-Time & Digital Wellbeing",
                    "text": f"With {usage_h}h daily on {platform_str}, consider setting app timers and keeping your phone outside your study area during focus blocks."
                })
            if study_h > 4.5:
                normalized_recs.append({
                    "tag": "Study Breaks & Pacing",
                    "text": f"For {study_h}h of daily study, adopt the 50/10 rule: 50 minutes of deep focus followed by 10 minutes strictly away from all screens."
                })
            if stress_lvl in ("High", "Very High"):
                normalized_recs.append({
                    "tag": "Relaxation & Breathwork",
                    "text": "Practice 3-minute box breathing or progressive muscle relaxation before exams or demanding lecture periods to calm your autonomic nervous system."
                })
            normalized_recs.append({
                "tag": "Social Connection",
                "text": "Schedule dedicated, screen-free meals or conversations with supportive friends and peers each week. Human connection buffers stress."
            })
        except Exception:
            pass

    rec_rows = []
    for rec in normalized_recs:
        tag_p = Paragraph(f"<b>{rec.get('tag', 'Wellness Pillar')}</b>", ParagraphStyle("RecTag", fontName="Helvetica-Bold", fontSize=9, textColor=SECONDARY))
        text_p = Paragraph(rec.get("text", ""), ParagraphStyle("RecText", fontName="Helvetica", fontSize=8.5, leading=12, textColor=TEXT_COLOR))
        rec_rows.append([tag_p, text_p])

    if rec_rows:
        rec_table = Table(rec_rows, colWidths=[160, 372])
        rec_table.setStyle(
            TableStyle([
                ("GRID", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F5F9F6")),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ])
        )
        story.append(rec_table)
        story.append(Spacer(1, 14))

    # -------------------------------------------------------------------------
    # 6. Additional Wellness Records (Optional / Activity Data)
    # -------------------------------------------------------------------------
    if extra_data and any(extra_data.values()):
        extra_rows = [
            [
                Paragraph("<b>Metric</b>", cell_label),
                Paragraph("<b>Recorded Activity</b>", cell_label),
            ]
        ]
        if extra_data.get("mood_streak") is not None:
            extra_rows.append([Paragraph("Daily Mood Check-In Streak", cell_val), Paragraph(f"{extra_data['mood_streak']} consecutive days", cell_val)])
        if extra_data.get("recent_mood"):
            extra_rows.append([Paragraph("Latest Recorded Mood", cell_val), Paragraph(str(extra_data['recent_mood']), cell_val)])
        if extra_data.get("completed_goals") is not None:
            extra_rows.append([Paragraph("Accomplished Wellness Goals", cell_val), Paragraph(f"{extra_data['completed_goals']} completed", cell_val)])
        if extra_data.get("total_assessments") is not None:
            extra_rows.append([Paragraph("Total Completed Assessments", cell_val), Paragraph(f"{extra_data['total_assessments']} assessments", cell_val)])

        if len(extra_rows) > 1:
            story.append(KeepTogether([
                Paragraph("D. Platform Activity & Wellness Trends", h2_style),
                Paragraph("Your recent participation and habit tracking records in MindCare AI:", sub_style),
                Spacer(1, 6),
            ]))
            extra_table = Table(extra_rows, colWidths=[240, 292])
            extra_table.setStyle(
                TableStyle([
                    ("GRID", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
                    ("BACKGROUND", (0, 0), (-1, 0), ACCENT_TINT),
                    ("TOPPADDING", (0, 0), (-1, -1), 5),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                    ("LEFTPADDING", (0, 0), (-1, -1), 8),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ])
            )
            story.append(extra_table)
            story.append(Spacer(1, 14))

    # Build the document using the multi-pass canvas
    doc.build(story, canvasmaker=NumberedCanvas)
    buffer.seek(0)
    return buffer.getvalue()

