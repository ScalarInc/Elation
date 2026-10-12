"""Create (or repair) the first admin account.

    uv run python -m app.scripts.create_superuser

Reads SUPERUSER_EMAIL / SUPERUSER_NAME from the root .env. No password is stored anywhere:
the script prints a one-time link (and emails it when Resend is configured) that lets the
admin choose their own password. Safe to re-run; it issues a fresh link each time.
"""

import sys

from sqlalchemy.dialects.postgresql import insert

from app.config import get_settings
from app.db import new_session
from app.models import Profile
from app.services import email, supabase_admin


def main() -> int:
    settings = get_settings()
    address = (settings.superuser_email or "").strip()
    if not address:
        print("SUPERUSER_EMAIL is not set in the root .env.")
        return 1

    try:
        link = supabase_admin.generate_link("invite", address, "/auth/set-password")
        print(f"Created auth user for {address}.")
    except supabase_admin.SupabaseAdminError as exc:
        if exc.code != "email_exists":
            print(f"Supabase refused the request: {exc}")
            return 1
        link = supabase_admin.generate_link("recovery", address, "/auth/set-password")
        print(f"Auth user for {address} already exists; issued a new set-password link.")

    with new_session() as db:
        db.execute(
            insert(Profile)
            .values(
                id=link.user_id, role="admin", is_superuser=True, full_name=settings.superuser_name,
                email=address, access_status="active",
            )
            .on_conflict_do_update(
                index_elements=[Profile.id],
                set_={"role": "admin", "is_superuser": True, "access_status": "active"},
            )
        )
        db.commit()
    print("Superuser profile ready.")

    try:
        subject, html_body = email.invitation_email(settings.superuser_name, link.action_link)
        email.send_email(address, subject, html_body)
        print("Invitation emailed.")
    except Exception as exc:  # email is a convenience here; the printed link always works
        print(f"Email not sent ({exc}). Use the link below.")

    print("\nOne-time link (open in a browser, valid for the email-link lifetime set in Supabase):")
    print(link.action_link)
    return 0


if __name__ == "__main__":
    sys.exit(main())
