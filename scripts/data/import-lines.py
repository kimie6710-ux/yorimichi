# Check hand-written lines (chunkN.out.json) and put them on the map (.data/db.json).
# Stop the dev server first (it keeps .data in memory).
#   python3 scripts/data/import-lines.py <scratch dir>
import json, sys, re, datetime, glob, os

D = sys.argv[1]
places = {p["id"]: p for p in json.load(open(f"{D}/machida-picked.json"))}
BAD_START = ("ここ", "この", "その", "そこ")
BAD = re.compile(r"です|かもしれません|でしょう|おすすめ|人気|穴場|隠れ家|おしゃれ|癒やし|エモい|余白|記憶|物語|呼吸|心|光|そっと|静かに|私|わたし")
EMOJI = re.compile("[\U0001F300-\U0001FAFF☀-➿]")

def ok(line, name):
    t = line.replace("\n", "")
    if not (5 <= len(t) <= 20) or t.startswith(BAD_START) or BAD.search(t) or EMOJI.search(t):
        return False
    core = re.sub(r"[\s（）()・]", "", name)
    return not any(len(w) >= 3 and w in t for w in re.split(r"[\s　・()（）]+", name))

rows, skipped = {}, []
for f in sorted(glob.glob(f"{D}/chunk*.out.json")):
    for e in json.load(open(f)):
        p = places.get(e.get("id"))
        if not p:
            skipped.append(("unknown id", e.get("id")))
            continue
        alts = [a for a in e.get("alts", []) if ok(a, p["name"])]
        pick = e.get("pick", "")
        if not ok(pick, p["name"]):
            pick = alts[0] if alts else ""
        if not pick:
            skipped.append(("no usable line", p["name"]))
            continue
        if pick not in alts:
            alts = [pick] + alts[:4]
        bird = e.get("bird", "")
        if len(bird) > 15 or BAD.search(bird) or EMOJI.search(bird):
            bird = ""
        rows[p["id"]] = (p, pick, e.get("form", ""), alts[:5], bird)

db = json.load(open(".data/db.json"))
now = datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")
area = next(r["area_key"] for r in db["spots"] if r["id"] == "ChIJi161Sq__GGARlMj7EZJVNPw")
byid = {r["id"]: r for r in db["spots"]}
added = updated = 0
for pid, (p, pick, form, alts, bird) in rows.items():
    base = dict(
        id=pid, name=p["name"], lat=p["lat"], lng=p["lng"], category=p["category"], types=p["types"],
        photo_name=p.get("photo"), address=p["address"], ai_copy=pick, ai_copy_form=form, ai_copy_alts=alts,
        ai_bird_line=bird or None, ai_model="handwritten", ai_generated_at=now,
    )
    if pid in byid:
        if byid[pid].get("ai_copy"):
            continue  # never overwrite an existing line
        byid[pid].update(base)
        updated += 1
    else:
        db["spots"].append({**base, "area_key": area, "created_at": now})
        added += 1
json.dump(db, open(".data/db.json", "w"), ensure_ascii=False)
print(f"lines ready {len(rows)}, added {added}, filled {updated}, skipped {len(skipped)}")
for s in skipped[:10]:
    print(" skip", s)
