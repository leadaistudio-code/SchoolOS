import re
from collections import Counter
from pypdf import PdfReader

path = r"Payment-Collection-Data-20260831-2200-2026-08-31-10-00PM.xlsx - Student View.pdf"
r = PdfReader(path)
text = "\n".join((p.extract_text() or "") for p in r.pages)
lines = [ln.strip() for ln in text.splitlines() if ln.strip()]

# TRUE/FALSE is often glued to class name: "MathTRUE 7000 36500"
row_re = re.compile(r"^(.*?)(TRUE|FALSE)\s+(-?\d+)\s+(\d+)\s*$")
# Admission id sits after the name: APG2026/2 | 2024-003 | 2025005 | 122345
adm_re = re.compile(
    r"^(?P<name>.+?)\s+(?P<adm>(?:APG\d{4}/\d+|\d{4}-\d{3}|\d{4,10}))(?:\s+(?P<cls>.*))?$"
)

rows = []
skipped = []
for ln in lines:
    if ln.startswith(("APNI ", "* Auto", "No. of", "Name Admission")):
        continue
    m = row_re.match(ln)
    if not m:
        continue
    left, matched, past, req = m.groups()
    left = left.strip()
    am = adm_re.match(left)
    if not am:
        skipped.append(left)
        continue
    rows.append(
        {
            "name": am.group("name").strip(),
            "admission": am.group("adm"),
            "class": (am.group("cls") or "").strip(),
            "matched": matched,
            "past_due": int(past),
            "requested": int(req),
            "opening": max(0, int(past)) + int(req),
        }
    )

print("parsed", len(rows), "skipped", len(skipped))
if skipped[:10]:
    print("skip samples:", skipped[:10])

past = sum(r["past_due"] for r in rows)
req = sum(r["requested"] for r in rows)
opening = sum(r["opening"] for r in rows)
print("past_due_total", past)
print("requested_total", req)
print("opening_balance_total (past+requested, ignoring credits)", opening)
print("students_with_past_due", sum(1 for r in rows if r["past_due"] > 0))
print("students_with_requested", sum(1 for r in rows if r["requested"] > 0))
print("students_zero_both", sum(1 for r in rows if r["past_due"] == 0 and r["requested"] == 0))
print("students_credit_past_due", [r for r in rows if r["past_due"] < 0])
print("unique_classes", len({r["class"] for r in rows}))
for k, v in Counter(r["class"] or "(blank)" for r in rows).most_common():
    print(f"  {v:3d}  {k}")

print("\nTOP OPENING BALANCES")
for r in sorted(rows, key=lambda x: -x["opening"])[:12]:
    print(
        f"  {r['opening']:8d}  past={r['past_due']:6d} req={r['requested']:6d}  "
        f"{r['admission']:14s}  {r['name'][:24]:24s}  {r['class'][:32]}"
    )

# Write CSV for migration planning
import csv

out = r"prisma\_uolo_opening_balances.csv"
with open(out, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(
        f,
        fieldnames=["admission", "name", "class", "past_due", "requested", "opening_balance"],
    )
    w.writeheader()
    for r in sorted(rows, key=lambda x: x["admission"]):
        w.writerow(
            {
                "admission": r["admission"],
                "name": r["name"],
                "class": r["class"],
                "past_due": r["past_due"],
                "requested": r["requested"],
                "opening_balance": r["opening"],
            }
        )
print("wrote", out)
