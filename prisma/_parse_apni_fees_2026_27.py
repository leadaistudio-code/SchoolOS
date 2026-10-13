"""Parse Apni Pathshala Uolo payment-collection PDF (2026-27) into CSV."""
from __future__ import annotations

import csv
import re
from collections import Counter
from pathlib import Path

from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
PDF = ROOT / "docs" / "Payment-Collection-Data-20260904-1311-2026-09-04-01-11PM - Sheet1.pdf"
OUT = Path(__file__).resolve().parent / "_apni_fees_2026_27.csv"

# TRUE/FALSE then: past_due requested discount amount_paid balance
row_re = re.compile(
    r"^(?P<left>.*?)(?P<matched>TRUE|FALSE)\s+"
    r"(?P<past>-?\d+)\s+(?P<req>\d+)\s+(?P<disc>\d+)\s+(?P<paid>\d+)\s+(?P<bal>\d+)\s*$"
)
# Admission: APG2026/2 | APG1 | 2024-003 | 2025005 | 122345 | 1234
adm_re = re.compile(
    r"^(?P<name>.+?)\s+(?P<adm>(?:APG\d{4}/\d+|APG\d+|\d{4}-\d{3}|\d{4,10}))(?:\s+(?P<cls>.*))?$",
    re.IGNORECASE,
)


def normalize_class(raw: str) -> str:
    s = re.sub(r"\s+", " ", (raw or "").strip())
    return s


def main() -> None:
    if not PDF.exists():
        raise SystemExit(f"PDF not found: {PDF}")

    text = "\n".join((p.extract_text() or "") for p in PdfReader(str(PDF)).pages)
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]

    rows: list[dict] = []
    skipped: list[str] = []
    for ln in lines:
        if ln.startswith(("APNI ", "* Auto", "No. of", "Name Admission", "Excel Downloaded")):
            continue
        if "Academic Year" in ln:
            continue
        m = row_re.match(ln)
        if not m:
            continue
        left = m.group("left").strip()
        am = adm_re.match(left)
        if not am:
            skipped.append(left)
            continue
        past = int(m.group("past"))
        req = int(m.group("req"))
        disc = int(m.group("disc"))
        paid = int(m.group("paid"))
        bal = int(m.group("bal"))
        expected = past + req - disc - paid
        rows.append(
            {
                "admission": am.group("adm").strip(),
                "name": am.group("name").strip(),
                "class": normalize_class(am.group("cls") or ""),
                "matched": m.group("matched"),
                "past_due": past,
                "requested": req,
                "discount": disc,
                "amount_paid": paid,
                "balance": bal,
                "balance_check": expected,
            }
        )

    print("parsed", len(rows), "skipped", len(skipped))
    if skipped[:15]:
        print("skip samples:", skipped[:15])

    mismatch = [r for r in rows if r["balance"] != r["balance_check"]]
    print("balance_mismatches", len(mismatch))
    for r in mismatch[:8]:
        print(
            f"  {r['admission']} bal={r['balance']} expected={r['balance_check']} "
            f"past={r['past_due']} req={r['requested']} disc={r['discount']} paid={r['amount_paid']}"
        )

    print("past_due_total", sum(r["past_due"] for r in rows))
    print("requested_total", sum(r["requested"] for r in rows))
    print("discount_total", sum(r["discount"] for r in rows))
    print("paid_total", sum(r["amount_paid"] for r in rows))
    print("balance_total", sum(r["balance"] for r in rows))
    print("unique_classes", len({r["class"] for r in rows}))
    for k, v in Counter(r["class"] or "(blank)" for r in rows).most_common():
        reqs = [r["requested"] for r in rows if r["class"] == k]
        mode = Counter(reqs).most_common(1)[0]
        print(f"  {v:3d}  mode_req={mode[0]} (n={mode[1]})  {k}")

    with OUT.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(
            f,
            fieldnames=[
                "admission",
                "name",
                "class",
                "past_due",
                "requested",
                "discount",
                "amount_paid",
                "balance",
            ],
        )
        w.writeheader()
        for r in sorted(rows, key=lambda x: x["admission"]):
            w.writerow({k: r[k] for k in w.fieldnames})
    print("wrote", OUT)


if __name__ == "__main__":
    main()
