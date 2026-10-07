#!/usr/bin/env python3
# Sends a marketing update to the owner on WhatsApp, through Shula.
# Appends one JSON line to outbox.jsonl on the social-media branch; Shula polls that raw file every 15 minutes.
# Works from anywhere (own sparse clone): python3 outbox.py "text"
# or: curl -s https://raw.githubusercontent.com/cortadosnir-design/cortado-app/social-media/toolkit/scripts/outbox.py | python3 - "text"
# The repo is public: marketing updates only, nothing private.
import datetime, json, os, subprocess, sys, tempfile, uuid

text = " ".join(sys.argv[1:]).strip()
if not text:
    sys.exit("usage: outbox.py TEXT")
line = json.dumps({"id": str(uuid.uuid4()), "at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"), "text": text}, ensure_ascii=False)
msg = "outbox: update to owner\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
for _ in range(4):  # a concurrent push wins the race: start again from a fresh clone
    d = tempfile.mkdtemp()
    git = lambda *a: subprocess.run(["git", "-C", d, *a], capture_output=True, text=True)
    if subprocess.run(["git", "clone", "-q", "--depth", "1", "--filter=blob:none", "--sparse", "--branch", "social-media",
                       "https://github.com/cortadosnir-design/cortado-app", d]).returncode:
        continue
    with open(os.path.join(d, "outbox.jsonl"), "a", encoding="utf-8") as f:
        f.write(line + "\n")
    git("add", "outbox.jsonl")
    git("-c", "user.name=Claude", "-c", "user.email=noreply@anthropic.com", "commit", "-qm", msg)
    p = git("push", "-q", "origin", "social-media")
    if p.returncode == 0:
        print("queued for WhatsApp (Shula sends within ~15 minutes)")
        sys.exit(0)
    print(p.stderr.strip(), file=sys.stderr)
sys.exit("could not push outbox.jsonl")
