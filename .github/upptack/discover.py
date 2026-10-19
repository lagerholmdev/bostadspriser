"""Engångsskript: kartlägg SCB:s API v2 och DeSO 2025-geometrin. Skriver allt till out/."""
import json, urllib.parse, urllib.request, pathlib, time

OUT = pathlib.Path("out"); OUT.mkdir(exist_ok=True)
BASES = ["https://statistikdatabasen.scb.se/api/v2", "https://api.scb.se/OV0104/v2beta/api/v2"]
UA = {"User-Agent": "prislandskap-upptack/1"}

def get(url, name):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
            body = r.read()
        (OUT / name).write_bytes(body)
        print("OK", r.status, len(body), url)
        return body
    except Exception as e:
        print("FEL", url, e)
        (OUT / (name + ".err")).write_text(f"{url}\n{e}")
    finally:
        time.sleep(0.5)

base = None
for b in BASES:
    if get(b + "/config", f"config_{len(base or '')}_{BASES.index(b)}.json"):
        base = base or b
print("BASE", base)
terms = ["DeSO ålder kön", "DeSO hushållstyp", "DeSO utbildningsnivå", "DeSO inkomstklass",
         "DeSO upplåtelseform lägenheter", "Tab1InkDesoRegso", "FolkmDesoAldKon", "HushallDesoTyp",
         "UtbSUNBefDesoRegsoN", "BO0104T01N2", "DeSO"]
ids = {}
for i, t in enumerate(terms):
    body = get(f"{base}/tables?lang=sv&pageSize=100&query={urllib.parse.quote(t)}", f"search_{i}.json")
    if body:
        for tab in json.loads(body).get("tables", []):
            ids[tab["id"]] = tab.get("label")
(OUT / "ids.json").write_text(json.dumps(ids, ensure_ascii=False, indent=1))
for tid, label in ids.items():
    if "DeSO" in (label or "") or "RegSO" in (label or ""):
        get(f"{base}/tables/{tid}/metadata?lang=sv&outputFormat=json-stat2", f"meta_{tid}.json")
wfs = "https://geodata.scb.se/geoserver/stat/wfs"
get(wfs + "?service=WFS&version=2.0.0&request=DescribeFeatureType&typeNames=stat:DeSO_2025", "deso2025_describe.xml")
get(wfs + "?service=WFS&version=2.0.0&request=GetFeature&typeNames=stat:DeSO_2025&count=3&outputFormat=application/json", "deso2025_sample.json")
get(wfs + "?service=WFS&version=1.1.0&request=GetFeature&typeName=stat:DeSO_2025&outputFormat=geopackage", "deso2025.gpkg")
