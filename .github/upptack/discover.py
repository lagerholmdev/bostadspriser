"""Engångsskript, steg 2: metadata och ett litet dataprov för de fem tabellerna."""
import json, urllib.request, pathlib, time
OUT = pathlib.Path("out"); OUT.mkdir(exist_ok=True)
BASE = "https://statistikdatabasen.scb.se/api/v2"
UA = {"User-Agent": "prislandskap-upptack/1"}
def get(url, name):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
            body = r.read()
        (OUT / name).write_bytes(body); print("OK", len(body), url); return body
    except Exception as e:
        print("FEL", url, e)
    finally:
        time.sleep(0.6)
for t in ["TAB6574", "TAB6568", "TAB6534", "TAB6679", "TAB6638"]:
    body = get(f"{BASE}/tables/{t}/metadata?lang=sv&outputFormat=json-stat2", f"meta_{t}.json")
    if not body:
        continue
    m = json.loads(body)
    reg = m["dimension"]["Region"]["category"]["index"]
    codes = [c for c in reg if c.startswith("0180")][:2] + [c for c in reg if c.startswith("01") and len(c) <= 4][:2]
    q = "&".join(f"valuecodes[Region]={c}" for c in codes)
    for d in m["id"]:
        if d != "Region":
            q += f"&valuecodes[{d}]=*"
    get(f"{BASE}/tables/{t}/data?lang=sv&outputFormat=json-stat2&{q}", f"data_{t}.json")
