import os

import requests

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://dokgacvywoealldieugd.supabase.co")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
SUPABASE_STORAGE_BUCKET = os.getenv("SUPABASE_STORAGE_BUCKET", "Evidence")


def _object_url(filename: str) -> str:
    return f"{SUPABASE_URL}/storage/v1/object/{SUPABASE_STORAGE_BUCKET}/{filename}"


def _public_url(filename: str) -> str:
    return f"{SUPABASE_URL}/storage/v1/object/public/{SUPABASE_STORAGE_BUCKET}/{filename}"


def _auth_headers() -> dict:
    return {
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
    }


def upload_file(filename: str, content: bytes, content_type: str) -> str:
    headers = {**_auth_headers(), "Content-Type": content_type or "application/octet-stream"}
    resp = requests.post(_object_url(filename), headers=headers, data=content)
    resp.raise_for_status()
    return _public_url(filename)


def delete_file(filename: str) -> None:
    resp = requests.delete(_object_url(filename), headers=_auth_headers())
    if resp.status_code not in (200, 404):
        resp.raise_for_status()


def filename_from_public_url(url: str) -> str:
    return url.rsplit("/", 1)[-1]


def fetch_file(url: str) -> tuple[bytes, str]:
    resp = requests.get(url)
    resp.raise_for_status()
    return resp.content, resp.headers.get("content-type", "application/octet-stream")
