"""Transactional email through Resend."""

import html
import logging

import httpx

from app.config import get_settings

logger = logging.getLogger("elation.email")


class EmailNotConfigured(Exception):
    pass


class EmailSendFailed(Exception):
    pass


def send_email(to: str, subject: str, html_body: str) -> None:
    settings = get_settings()
    if not settings.resend_api_key or not settings.email_from:
        raise EmailNotConfigured("RESEND_API_KEY and EMAIL_FROM must be set.")
    response = httpx.post(
        "https://api.resend.com/emails",
        headers={"Authorization": f"Bearer {settings.resend_api_key}"},
        json={"from": settings.email_from, "to": [to], "subject": subject, "html": html_body},
        timeout=15,
    )
    if response.status_code >= 400:
        logger.warning("Resend rejected email (HTTP %s): %s", response.status_code, response.text[:300])
        raise EmailSendFailed(f"Resend returned HTTP {response.status_code}.")


def _layout(heading: str, body: str, link: str, button: str) -> str:
    return f"""
    <div style="font-family:Lato,Arial,sans-serif;max-width:520px;margin:0 auto;color:#3B3A3F">
      <p style="letter-spacing:.3em;font-size:13px">ELATION <span style="color:#D3A79F">X</span></p>
      <h1 style="font-family:'Playfair Display',Georgia,serif;font-weight:400">{html.escape(heading)}</h1>
      <p style="line-height:1.6">{body}</p>
      <p><a href="{html.escape(link)}" style="display:inline-block;background:#D3A79F;color:#fff;padding:12px 22px;
         border-radius:10px;text-decoration:none;font-weight:bold">{html.escape(button)}</a></p>
      <p style="font-size:12px;color:#888">If the button doesn't work, paste this link into your browser:<br>{html.escape(link)}</p>
    </div>"""


def invitation_email(full_name: str, link: str) -> tuple[str, str]:
    body = (
        f"Hello {html.escape(full_name)}, your private Elation X studio is ready. "
        "Set a password to open your event planning space. This link can be used once."
    )
    return "Your Elation X invitation", _layout("You're invited", body, link, "Set your password")


def password_reset_email(link: str) -> tuple[str, str]:
    body = "We received a request to reset your Elation X password. If it wasn't you, ignore this email."
    return "Reset your Elation X password", _layout("Reset your password", body, link, "Choose a new password")
