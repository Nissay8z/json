#!/usr/bin/env python3
"""Mirror the requested public Nuvio QuickJS providers into this PUBLIC repo.

No downloaded JavaScript is executed during synchronization.
Nuvio can fetch every plugin by a local relative filename.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "nuvio"
GOWARU = "Gowaru/gowaru-nuvio-providers"
ALL_IN_ONE = "NuvioPlugin/All-in-One-Nuvio"
SNIXI = "Snixi92/nuvio-french-providers"
ALLOWED_AIO = {"anime-sama", "movix", "nakios", "purstream"}
USER_AGENT = "Nissay-Nuvio-Public-Provider-Sync/1.0"
MAX_SCRIPT_BYTES = 5 * 1024 * 1024


def get(url: str) -> bytes:
    headers = {"User-Agent": USER_AGENT, "Accept": "application/vnd.github+json"}
    token = os.environ.get("GITHUB_TOKEN", "")
    if url.startswith("https://api.github.com/") and token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=40) as response:
        data = response.read(MAX_SCRIPT_BYTES + 1)
    if len(data) > MAX_SCRIPT_BYTES:
        raise ValueError("Upstream file exceeds 5MB: " + url)
    return data


def raw(repo: str, path: str) -> str:
    if not path or path.startswith("/") or ".." in PurePosixPath(path).parts:
        raise ValueError("Unsafe upstream path: " + path)
    return f"https://raw.githubusercontent.com/{repo}/main/{path}"


def manifest(repo: str) -> list[dict]:
    data = json.loads(get(raw(repo, "manifest.json")))
    scrapers = data.get("scrapers")
    if not isinstance(scrapers, list) or not scrapers:
        raise ValueError("Upstream scraper list unavailable: " + repo)
    return scrapers


def slug_from_path(path: str) -> str:
    slug = PurePosixPath(path).stem.lower()
    if not re.fullmatch(r"[a-z0-9][a-z0-9_-]*", slug):
        raise ValueError("Invalid plugin slug " + slug)
    return slug


def main() -> None:
    gaw = manifest(GOWARU)
    aio = manifest(ALL_IN_ONE)
    listing = json.loads(get(
        "https://api.github.com/repos/" + SNIXI + "/contents/providers"
    ))
    if not isinstance(listing, list):
        raise ValueError("Snixi92 GitHub API did not return provider files")

    selection: list[tuple[str, str, str, dict]] = []
    for meta in gaw:
        path = meta.get("filename", "")
        slug = slug_from_path(path)
        selection.append(("gwr", GOWARU, path, dict(meta)))
    for item in listing:
        name = item.get("name", "")
        if item.get("type") != "file" or not name.endswith(".js"):
            continue
        slug = slug_from_path(name)
        selection.append(("snx", SNIXI, "providers/" + name, {
            "id": slug, "name": slug.replace("-", " ").title(),
            "description": "QuickJS provider from Snixi92",
            "version": "1.0.0", "author": "Snixi92",
            "supportedTypes": ["movie", "tv"], "enabled": True,
            "contentLanguage": ["fr"],
        }))
    for meta in aio:
        path = meta.get("filename", "")
        if slug_from_path(path) in ALLOWED_AIO:
            selection.append(("aio", ALL_IN_ONE, path, dict(meta)))

    counts = {prefix: sum(p == prefix for p, _, _, _ in selection)
              for prefix in ("gwr", "snx", "aio")}
    if counts["gwr"] < 30 or counts["snx"] < 15 or counts["aio"] != 4:
        raise ValueError("Incomplete upstream inventory: " + str(counts))
    ids: set[str] = set()
    records: list[dict] = []
    files: dict[Path, bytes] = {}

    for prefix, source_repo, original_path, meta in selection:
        slug = slug_from_path(original_path)
        identity = prefix + "-" + slug
        if identity in ids:
            raise ValueError("Duplicate Nuvio provider ID: " + identity)
        ids.add(identity)
        if not original_path.startswith("providers/"):
            raise ValueError("Unexpected provider path: " + original_path)
        data = get(raw(source_repo, original_path))
        if not data.strip() or b"\x00" in data:
            raise ValueError("Invalid JavaScript file: " + original_path)
        relative = "providers/" + prefix + "/" + slug + ".js"
        files[OUTPUT / relative] = data
        item = dict(meta)
        item.update({
            "id": identity,
            "name": str(meta.get("name") or slug) + " · " +
                    {"gwr": "Gowaru", "snx": "Snixi92", "aio": "All-in-One"}[prefix],
            "filename": relative,
            "enabled": True,
        })
        item.setdefault("supportedTypes", ["movie", "tv"])
        item.setdefault("contentLanguage", ["fr"])
        item.setdefault("version", "1.0.0")
        item.setdefault("author", source_repo.split("/")[0])
        records.append(item)

    records.sort(key=lambda x: x["id"])
    # Deterministic version: GitHub Actions does not commit unchanged content.
    fingerprint = hashlib.sha256(
        json.dumps(records, sort_keys=True, ensure_ascii=False).encode()
        + b"".join(hashlib.sha256(files[p]).digest() for p in sorted(files))
    ).hexdigest()
    manifest_out = {
        "name": "NISSKENZI · Nuvio Providers (Gowaru / Snixi92 / All-in-One FR)",
        "version": "1.0." + str(int(fingerprint[:8], 16)),
        "scrapers": records,
    }
    for path, data in files.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists() or path.read_bytes() != data:
            path.write_bytes(data)
    # Purge only stale generated JS files, never manually managed data.
    generated_dir = OUTPUT / "providers"
    for old in generated_dir.glob("*/*.js"):
        if old not in files:
            old.unlink()
    rendered = (json.dumps(manifest_out, ensure_ascii=False, indent=2) + "\n").encode()
    output_path = OUTPUT / "manifest.json"
    if not output_path.exists() or output_path.read_bytes() != rendered:
        output_path.write_bytes(rendered)
    actual = json.loads(output_path.read_text(encoding="utf-8"))
    assert len(actual["scrapers"]) == len(files)
    assert all((OUTPUT / x["filename"]).is_file() for x in actual["scrapers"])
    assert all(not x["filename"].startswith("http") for x in actual["scrapers"])
    assert {x["id"] for x in actual["scrapers"] if x["id"].startswith("aio-")} == {
        "aio-" + x for x in ALLOWED_AIO
    }
    print("Ready:", counts, "total =", len(records), "version =", manifest_out["version"])


if __name__ == "__main__":
    main()
