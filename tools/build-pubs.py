#!/usr/bin/env python3
"""Rebuild data/publications.json from https://transformativerobotlab.com/publications/.

The lab site is a Jekyll al-folio site. Each publication is an <li> in an
<ol class="bibliography"> under a year heading; long author lists are folded
into a "N more authors" span whose onclick holds the remaining names.

Hand-written details (summary, project, demo) live in data/publications-extra.json
keyed by the same id and are merged in, so re-running this keeps them.

    python3 tools/build-pubs.py
"""
import json
import pathlib
import re
import urllib.request

from bs4 import BeautifulSoup

ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = "https://transformativerobotlab.com/publications/"
BASE = "https://transformativerobotlab.com"

# Corrections for entries whose author field is malformed on the lab site.
AUTHOR_FIX = {
    "naturePrintingVariable": "Jeffrey I. Lipton and Hod Lipson",
}


def join_authors(names):
    names = [n.strip() for n in names if n.strip()]
    if len(names) <= 2:
        return " and ".join(names)
    return ", ".join(names[:-1]) + ", and " + names[-1]


def authors_of(li):
    au = li.select_one(".author")
    if au is None:
        return ""
    more = au.select_one(".more-authors")
    extra = []
    if more is not None:
        m = re.search(r"\?\s*'([^']+)'", more.get("onclick", ""))
        extra = m.group(1).split(", ") if m else []
        more.decompose()
    text = re.sub(r"\s+", " ", au.get_text(" ")).replace("\xa0", " ").strip()
    text = re.sub(r",?\s*and\s*$", "", text)
    parts = [p for p in re.split(r",\s*(?:and\s+)?|\s+and\s+", text) if p and p != "and"]
    return join_authors(parts + extra)


def main():
    req = urllib.request.Request(URL, headers={"User-Agent": "trl-site-builder"})
    html = urllib.request.urlopen(req, timeout=60).read().decode("utf-8")
    soup = BeautifulSoup(html, "html.parser")
    pubs = []
    for ol in soup.select("ol.bibliography"):
        head = ol.find_previous_sibling(["h2", "h3"])
        year = head.get_text(strip=True) if head else ""
        for li in ol.find_all("li", recursive=False):
            body = li.select_one("[id]")
            pid = body["id"] if body else None
            title = li.select_one(".title")
            venue = li.select_one(".periodical em")
            img = li.select_one(".preview img")
            abstract = li.select_one("div.abstract")
            links = {}
            for a in li.select(".links a"):
                href = a.get("href") or ""
                label = a.get_text(strip=True)
                if href and not href.startswith("#") and label != "Abs":
                    links[label] = href if href.startswith("http") else BASE + href
            pubs.append({
                "id": pid,
                "year": year,
                "title": title.get_text(strip=True) if title else "",
                "authors": AUTHOR_FIX.get(pid) or authors_of(li),
                "venue": re.sub(r"^In\s+", "", venue.get_text(strip=True)) if venue else "",
                "links": links,
                "img": (BASE + img["src"]) if img and img.get("src", "").startswith("/") else (img["src"] if img else None),
                "abstract": re.sub(r"\s+", " ", abstract.get_text(" ")).strip() if abstract else "",
            })
    # Hand-written details per group: data/extra/<group>.json maps publication id ->
    # {summary, project, demo, demoLabel, source, fulltext, [authors]} and lists the
    # group's demos under "_demos".
    extra, demos = {}, []
    for f in sorted((ROOT / "data" / "extra").glob("*.json")):
        d = json.loads(f.read_text())
        demos += d.pop("_demos", [])
        extra.update(d)
    missing = []
    for p in pubs:
        e = {k: v for k, v in extra.get(p["id"], {}).items() if v not in (None, "") or k == "demo"}
        if not p["authors"] and e.get("authors"):
            p["authors"] = e["authors"]
        e.pop("authors", None)
        p.update(e)
        if p["id"] not in extra:
            missing.append(p["id"])
    out = ROOT / "data" / "publications.json"
    out.write_text(json.dumps({"source": URL, "publications": pubs}, indent=1, ensure_ascii=False))
    (ROOT / "data" / "demos.json").write_text(json.dumps(demos, indent=1, ensure_ascii=False))
    print(f"{len(pubs)} publications -> {out.relative_to(ROOT)}; {len(demos)} demos -> data/demos.json")
    if missing:
        print("no details yet for:", ", ".join(missing))


if __name__ == "__main__":
    main()
