"""Bygger site/index.html: mallen + geometri + senaste ögonblicksbild, allt inbäddat i en fil."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    snaps = sorted((ROOT / "data" / "snapshots").glob("*.json"))
    if not snaps:
        raise SystemExit("Ingen ögonblicksbild i data/snapshots")
    snap = json.loads(snaps[-1].read_text())
    geo = json.loads((ROOT / "site" / "omraden.geojson").read_text())
    html = (ROOT / "site" / "template.html").read_text()
    dump = lambda o: json.dumps(o, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    html = html.replace("/*__GEO__*/null", dump(geo)).replace("/*__SNAP__*/null", dump(snap))
    # Fristående sida för GitHub Pages
    page = ('<!doctype html>\n<html lang="sv">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            '<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
            'body{margin:0}[hidden]{display:none!important}</style>\n</head>\n<body>\n' + html + '\n</body>\n</html>\n')
    out = ROOT / "site" / "index.html"
    out.write_text(page)
    # Utan skal, för publicering som Claude-artifact (som lägger till sitt eget)
    bare = ROOT / "dist" / "artifact.html"
    bare.parent.mkdir(exist_ok=True)
    bare.write_text(html)
    print(f"{out} ({out.stat().st_size / 1024:.0f} kB) från {snaps[-1].name}")


if __name__ == "__main__":
    main()
