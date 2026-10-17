"""Bygger hela sajten i site/ från mallen, geometrin och senaste ögonblicksbilden.

Utdata:
- site/index.html            kartan (för GitHub Pages)
- dist/artifact.html          kartan utan skal, för publicering som Claude-artifact
- site/omrade/<slug>/         en sida per område (37 st) och site/omrade/ med alla områden
- site/vy/<vy>/               delningssidor per vy med egna metataggar; skickar vidare till kartan
- site/jamfor/                delbar jämförelselänk: /jamfor/?a=…&b=… skickar vidare till kartan
- site/og/*.png               delningsbilder per område och per vy
- site/sitemap.xml, robots.txt
"""
import html
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import sitelib as L  # noqa: E402

ROOT = L.ROOT
SITE = ROOT / "site"
VY_NAMN = {
    "pris": ("Vad kostar det per kvadratmeter?", "Snittpris per kvm för bostadsrätter i Stockholms 12 stadsdelsområden och 25 kranskommuner."),
    "budget": ("Var har jag råd?", "Ange budget och storlek och se i vilka områden i Stockholms län det räcker."),
    "trend": ("Var rör sig priserna mest?", "Störst uppgång och nedgång i bostadspriser i Stockholms län just nu."),
    "volym": ("Var säljs flest bostäder?", "Antal sålda bostadsrätter per område i Stockholms län."),
}
e = html.escape


def ordinal(n: int) -> str:
    return f"{n}:{'a' if n % 10 in (1, 2) and n % 100 not in (11, 12) else 'e'}"


def head_common(cfg, title, desc, url, image, depth):
    fonts = ('<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
             '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Familjen+Grotesk:wght@400;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">')
    gc = ""
    if cfg.get("goatcounter"):
        gc = f'<script data-goatcounter="https://{e(cfg["goatcounter"])}.goatcounter.com/count" async src="https://gc.zgo.at/count.js"></script>'
    return (f'<meta name="description" content="{e(desc)}">'
            f'<link rel="canonical" href="{e(url)}">'
            f'<meta property="og:type" content="website"><meta property="og:site_name" content="{e(cfg["site_name"])}">'
            f'<meta property="og:title" content="{e(title)}"><meta property="og:description" content="{e(desc)}">'
            f'<meta property="og:url" content="{e(url)}"><meta property="og:image" content="{e(image)}">'
            f'<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">'
            f'<meta name="twitter:card" content="summary_large_image">'
            f'<meta name="theme-color" content="#0b111b">{fonts}{gc}')


PAGE_CSS = """
:root{color-scheme:dark;--night:#0b111b;--panel:#111a28;--ink:#ece6d8;--muted:#8e98a9;--line:rgba(236,230,216,.13);
--brass:#e8b45c;--up:#f0a35b;--down:#6a9be0;--ui:"Familjen Grotesk","Helvetica Neue",Arial,system-ui,sans-serif;
--num:"IBM Plex Mono",ui-monospace,Menlo,monospace}
*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:var(--night);color:var(--ink);font:16px/1.55 var(--ui)}
a{color:var(--brass)} a:focus-visible{outline:2px solid var(--brass);outline-offset:2px}
.wrap{max-width:980px;margin:0 auto;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
.top{border-bottom:1px solid var(--line)} .top .wrap{display:flex;justify-content:space-between;align-items:center;gap:12px;padding-block:14px;flex-wrap:wrap}
.brand{color:var(--ink);text-decoration:none;font-weight:700;font-size:18px;letter-spacing:-.01em} .brand em{font-style:normal;color:var(--brass)}
.top nav{display:flex;gap:16px;font-size:14px} .top nav a{color:var(--muted);text-decoration:none} .top nav a:hover{color:var(--ink)}
main.wrap{padding-block:28px 48px;display:grid;gap:40px}
main.wrap>*,.hero>*{min-width:0}
.eyebrow{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0}
h1{font-size:clamp(28px,5vw,44px);line-height:1.05;letter-spacing:-.02em;margin:6px 0 0;text-wrap:balance}
h2{font-size:20px;letter-spacing:-.01em;margin:0 0 12px}
.hero{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);gap:28px;align-items:center}
.n{font-family:var(--num);font-size:clamp(40px,7vw,64px);font-weight:500;letter-spacing:-.03em;color:var(--brass);font-variant-numeric:tabular-nums}
.u{color:var(--muted);margin-left:6px}
.lede{margin:8px 0 0;max-width:46ch}
.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:18px}
.btn{display:inline-block;font-size:14px;text-decoration:none;color:var(--ink);border:1px solid var(--line);border-radius:999px;padding:8px 14px}
.btn:hover{border-color:var(--brass)} .btn.solid{background:var(--brass);color:var(--night);border-color:var(--brass);font-weight:600}
figure{margin:0} .minimap{width:100%;height:auto;display:block;border-radius:12px;background:#0e1724}
.mm-lab{font:600 12px var(--ui);fill:var(--ink);paint-order:stroke;stroke:#0b111b;stroke-width:3px}
.mm-target{font-size:14px;fill:#fff}
figcaption{font-size:12px;color:var(--muted);margin-top:6px}
.tbl{overflow-x:auto} table{border-collapse:collapse;width:100%;min-width:420px;font-size:15px}
th,td{padding:10px 12px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}
th:first-child,td:first-child{text-align:left} thead th{color:var(--muted);font-weight:400;font-size:13px}
td{font-family:var(--num);font-variant-numeric:tabular-nums} td:first-child{font-family:var(--ui)}
.up{color:var(--up)} .down{color:var(--down)}
.note{font-size:13px;color:var(--muted);margin:10px 0 0;max-width:70ch}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}
.card{display:block;text-decoration:none;color:var(--ink);background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.card:hover{border-color:var(--brass)} .card b{display:block;font-size:17px} .card span{font-family:var(--num);font-size:14px;color:var(--muted)}
.card .d{display:block;margin-top:4px;font-size:13px}
.rank{font-size:17px;max-width:60ch}
.list{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:2px 24px;list-style:none;padding:0;margin:0}
.list a{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid var(--line);text-decoration:none;color:var(--ink)}
.list a:hover{color:var(--brass)} .list span{font-family:var(--num);color:var(--muted);font-size:14px}
footer{border-top:1px solid var(--line);font-size:13px;color:var(--muted)} footer .wrap{padding-block:18px 32px} footer a{color:var(--muted)}
@media (max-width:720px){.hero{grid-template-columns:1fr}}
"""


def page(cfg, title, desc, url, image, depth, body):
    up = "../" * depth
    return (f'<!doctype html><html lang="sv"><head><meta charset="utf-8">'
            f'<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
            f'<title>{e(title)}</title>{head_common(cfg, title, desc, url, image, depth)}<style>{PAGE_CSS}</style></head><body>'
            f'<header class="top"><div class="wrap"><a class="brand" href="{up}">Stockholms <em>prislandskap</em></a>'
            f'<nav><a href="{up}">Kartan</a><a href="{up}?vy=budget">Var har jag råd?</a><a href="{up}omrade/">Alla områden</a></nav></div></header>'
            f'{body}'
            f'<footer><div class="wrap">Källa: <a href="https://www.maklarstatistik.se/omrade/riket/stockholms-lan/">Svensk Mäklarstatistik</a>. '
            f'Snittpriser för sålda bostäder; enskilda bostäder kan kosta mer eller mindre. '
            f'Stadsdelsgränser: Stockholms stad (CC0). Kommungränser: SCB.</div></footer></body></html>')


def main() -> None:
    cfg, snap, geo = L.load()
    base = cfg["base_url"]
    feats = geo["features"]
    FEAT = {f["properties"]["slug"]: f for f in feats}
    BY = {o["slug"]: o for o in snap["omraden"]}
    lan = snap["lan"]
    per = snap["period"]

    def br(slug, p="m3"):
        return (BY.get(slug) or {}).get("br", {}).get(p) or {}

    kvm_of = lambda s: br(s).get("kvm")  # noqa: E731
    kvm_max = max(kvm_of(s) or 0 for s in FEAT)
    ranked = sorted([s for s in FEAT if kvm_of(s)], key=lambda s: -kvm_of(s))

    # ---------- kartan ----------
    tpl = (SITE / "template.html").read_text()
    dump = lambda o: json.dumps(o, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")  # noqa: E731
    filled = tpl.replace("/*__GEO__*/null", dump(geo)).replace("/*__SNAP__*/null", dump(snap))
    title, desc = "Stockholms prislandskap", "Bostadspriser i Stockholms län som 3D-karta: kr/kvm, var du har råd, största rörelserna och jämförelser mellan områden."
    pages_cfg = {"mode": "pages", "base_url": base, "goatcounter": cfg.get("goatcounter", "")}
    head = head_common(cfg, title, desc, base, base + "og/vy-pris.png", 0)
    index = filled.replace("/*__CONFIG__*/null", dump(pages_cfg)).replace("<!--__HEAD__-->", head)
    (SITE / "index.html").write_text(
        '<!doctype html>\n<html lang="sv">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        '<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
        'body{margin:0}[hidden]{display:none!important}</style>\n</head>\n<body>\n' + index + '\n</body>\n</html>\n')
    art_cfg = {"mode": "artifact", "base_url": base, "goatcounter": ""}
    art = filled.replace("/*__CONFIG__*/null", dump(art_cfg)).replace("<!--__HEAD__-->", "")
    (ROOT / "dist").mkdir(exist_ok=True)
    (ROOT / "dist" / "artifact.html").write_text(art)

    # ---------- områdessidor ----------
    def similar_neighbours(slug, n=3):
        seen, frontier, cands = {slug}, [slug], []
        while frontier and len(cands) < 6:
            nxt = []
            for s in frontier:
                for g in FEAT[s]["properties"]["grannar"]:
                    if g not in seen:
                        seen.add(g)
                        nxt.append(g)
                        if kvm_of(g):
                            cands.append(g)
            frontier = nxt
        me = kvm_of(slug) or 0
        return sorted(cands, key=lambda s: abs((kvm_of(s) or 0) - me))[:n]

    def utv_cell(v):
        cls = "up" if v and v > 0 else "down" if v and v < 0 else ""
        return f'<td class="{cls}">{L.pct(v)}</td>'

    def stats_table(rec3, rec12, label):
        rows = [
            ("Kr/kvm", L.kr(rec3.get("kvm")), L.kr(rec12.get("kvm"))),
            ("Medelpris", L.kr(rec3.get("medelpris")) + " kr" if rec3.get("medelpris") else "–",
             L.kr(rec12.get("medelpris")) + " kr" if rec12.get("medelpris") else "–"),
            ("Antal sålda", L.kr(rec3.get("antal")), L.kr(rec12.get("antal"))),
        ]
        body = "".join(f"<tr><td>{a}</td><td>{b}</td><td>{c}</td></tr>" for a, b, c in rows)
        body += f"<tr><td>Prisutveckling</td>{utv_cell(rec3.get('utv'))}{utv_cell(rec12.get('utv'))}</tr>"
        return (f'<div class="tbl"><table><caption class="eyebrow" style="text-align:left;padding-bottom:6px">{label}</caption>'
                f'<thead><tr><th></th><th>3 mån ({e(per["m3"])})</th><th>12 mån ({e(per["m12"])})</th></tr></thead>'
                f'<tbody>{body}</tbody></table></div>')

    urls = [base, base + "omrade/"]
    for slug, f in FEAT.items():
        p = f["properties"]
        namn, typ = p["namn"], p["typ"]
        r3, r12 = br(slug, "m3"), br(slug, "m12")
        k = r3.get("kvm")
        diff = round((k / lan["br"]["m3"]["kvm"] - 1) * 100) if k else None
        pos = ranked.index(slug) + 1 if slug in ranked else None
        url = f"{base}omrade/{slug}/"
        img = f"{base}og/{slug}.png"
        kind = "Stadsdelsområde i Stockholms stad" if typ == "stadsdel" else "Kommun i Stockholms län"
        diff_txt = (f"{abs(diff)} % {'över' if diff >= 0 else 'under'}" if diff is not None else "")
        title = f"Bostadspriser {L.prep(slug, namn)}: {L.kr(k)} kr/kvm | Stockholms prislandskap"
        desc = (f"Bostadsrätter {L.prep(slug, namn)} såldes för i snitt {L.kr(k)} kr/kvm {per['m3']}, "
                f"{diff_txt} länets snitt. {L.kr(r3.get('antal'))} sålda. Prisutveckling 12 mån: {L.pct(r12.get('utv'))}.")
        neigh = similar_neighbours(slug)
        cards = "".join(
            f'<a class="card" href="../{g}/"><b>{e(FEAT[g]["properties"]["namn"])}</b>'
            f'<span>{L.kr(kvm_of(g))} kr/kvm</span>'
            f'<span class="d">{L.pct((kvm_of(g) / k - 1) * 100) if k else ""} mot {e(namn)}</span></a>'
            for g in neigh)
        villa = ""
        if typ == "kommun" and (BY.get(slug) or {}).get("villa"):
            v = BY[slug]["villa"]
            villa = f'<section><h2>Villor</h2>{stats_table(v["m3"], v["m12"], "Villor")}</section>'
        elif typ == "stadsdel" and (BY.get("stockholm") or {}).get("villa"):
            v = BY["stockholm"]["villa"]["m3"]
            villa = (f'<section><h2>Villor</h2><p class="note" style="margin:0">Villor redovisas bara för hela Stockholms stad: '
                     f'{L.kr(v.get("kvm"))} kr/kvm och {L.kr(v.get("antal"))} sålda {e(per["m3"])}.</p></section>')
        thin = (r3.get("antal") or 0) < 60
        flags = " Några värden redovisas inte av Mäklarstatistik eftersom underlaget är för litet." if r3.get("flaggor") or r12.get("flaggor") else ""
        cmp_link = "../../?jamfor=" + ",".join([slug] + neigh[:2])
        body = f"""<main class="wrap">
<div>
  <p class="eyebrow">{kind} · Bostadsrätter</p>
  <h1>Bostadspriser {e(L.prep(slug, namn))}</h1>
</div>
<section class="hero">
  <div>
    <div><span class="n">{L.kr(k)}</span><span class="u">kr/kvm</span></div>
    <p class="lede">Snittpris för sålda bostadsrätter {e(per['m3'])}{f", <b>{diff_txt}</b> länets snitt på {L.kr(lan['br']['m3']['kvm'])} kr/kvm" if diff_txt else ""}.
    {f"Underlaget är tunt ({L.kr(r3.get('antal'))} affärer), så värdet svänger mer än i större områden." if thin else ""}</p>
    <div class="actions"><a class="btn solid" href="../../?omr={slug}">Visa på kartan</a><a class="btn" href="{cmp_link}">Jämför med grannarna</a><a class="btn" href="../../?vy=budget&omr={slug}">Har jag råd här?</a></div>
  </div>
  <figure>{L.minimap_svg(f, feats, kvm_of, kvm_max)}<figcaption>{e(namn)} i mässing. Omgivningen färgad efter kr/kvm, mörkt är billigare.</figcaption></figure>
</section>
<section><h2>Nyckeltal</h2>{stats_table(r3, r12, "Bostadsrätter")}<p class="note">Prisutvecklingen jämför med samma period året innan (12 mån) eller de tre månaderna innan (3 mån).{flags}</p></section>
{villa}
<section><h2>Grannområden med liknande pris</h2><div class="cards">{cards}</div></section>
<section><h2>Plats i länet</h2><p class="rank">{e(namn)} är {"det " + ordinal(pos) + " dyraste" if pos and pos > 1 else "det dyraste"} av {len(ranked)} områden i Stockholms län räknat i kr/kvm.
Se <a href="../">alla områden</a> eller <a href="../../?vy=trend">var priserna rör sig mest</a>.</p></section>
</main>"""
        out = SITE / "omrade" / slug / "index.html"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(page(cfg, title, desc, url, img, 2, body))
        urls.append(url)

        # Delningsbild för området
        L.og_image(SITE / "og" / f"{slug}.png", namn, L.kr(k), "kr/kvm",
                   [f"{diff_txt} länets snitt" if diff_txt else "", f"{L.kr(r3.get('antal'))} sålda bostadsrätter, {per['m3']}"],
                   feats, lambda s: L.price_color(kvm_of(s), kvm_max), highlight=slug,
                   box=L.expand(L.bbox([f]), 2.4 if typ == "stadsdel" else 1.8))

    # ---------- alla områden ----------
    def li(s):
        return f'<li><a href="{s}/"><b>{e(FEAT[s]["properties"]["namn"])}</b><span>{L.kr(kvm_of(s))} kr/kvm</span></a></li>'
    stad = [s for s in ranked if FEAT[s]["properties"]["typ"] == "stadsdel"]
    kom = [s for s in ranked if FEAT[s]["properties"]["typ"] == "kommun"]
    body = f"""<main class="wrap">
<div><p class="eyebrow">Bostadsrätter · {e(per['m3'])}</p><h1>Bostadspriser i alla områden</h1>
<p class="lede">Snittpris per kvm i Stockholms stads 12 stadsdelsområden och länets 25 övriga kommuner, dyrast först. Länets snitt: {L.kr(lan['br']['m3']['kvm'])} kr/kvm.</p></div>
<section><h2>Stockholms stad</h2><ul class="list">{''.join(li(s) for s in stad)}</ul></section>
<section><h2>Kommuner i länet</h2><ul class="list">{''.join(li(s) for s in kom)}</ul></section>
</main>"""
    (SITE / "omrade" / "index.html").write_text(page(cfg, "Bostadspriser i alla områden i Stockholms län | Stockholms prislandskap",
        f"Snittpris per kvm för bostadsrätter i 37 områden i Stockholms län, {per['m3']}.", base + "omrade/", base + "og/vy-pris.png", 1, body))

    # ---------- delningssidor per vy och jämförelselänk ----------
    def redirect(dir_, title, desc, image, js_target):
        out = SITE / dir_ / "index.html"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(f'<!doctype html><html lang="sv"><head><meta charset="utf-8"><title>{e(title)}</title>'
                       f'{head_common(cfg, title, desc, base + dir_ + "/", image, 2)}'
                       f'<meta name="robots" content="noindex"><script>{js_target}</script></head>'
                       f'<body style="background:#0b111b;color:#ece6d8;font-family:system-ui"><p><a style="color:#e8b45c" href="../../">Öppna kartan</a></p></body></html>')

    for vy, (vt, vd) in VY_NAMN.items():
        redirect(f"vy/{vy}", f"{vt} | Stockholms prislandskap", vd, f"{base}og/vy-{vy}.png",
                 f'var q=new URLSearchParams(location.search);if(!q.get("vy")&&"{vy}"!=="pris")q.set("vy","{vy}");'
                 f'location.replace("../../"+(q.toString()?"?"+q:""));')
    redirect("jamfor", "Jämför områden | Stockholms prislandskap", "Jämför bostadspriser mellan områden i Stockholms län sida vid sida.",
             f"{base}og/vy-pris.png",
             'var q=new URLSearchParams(location.search),j=["a","b","c"].map(function(k){return q.get(k)}).filter(Boolean);'
             'q.delete("a");q.delete("b");q.delete("c");if(j.length)q.set("jamfor",j.join(","));'
             'location.replace("../"+(q.toString()?"?"+q:""));')

    # ---------- delningsbilder per vy ----------
    lan_k = lan["br"]["m3"]["kvm"]
    top = ranked[0]
    def rec12(s):
        return br(s, "m12")
    utvs = sorted([s for s in FEAT if rec12(s).get("utv") is not None], key=lambda s: -rec12(s)["utv"])
    vols = sorted(FEAT, key=lambda s: -(br(s).get("antal") or 0))
    mx_utv = max(abs(rec12(s)["utv"]) for s in utvs)
    mx_vol = max(br(s).get("antal") or 0 for s in FEAT)
    budget_need = 5e6 / 70
    def budget_col(s):
        k = kvm_of(s)
        if not k:
            return None
        return (72, 158, 108) if k <= budget_need else (214, 188, 84) if k <= budget_need * 1.1 else (58, 66, 82)
    def trend_col(s):
        u = rec12(s).get("utv")
        if u is None:
            return None
        return L.lerp((74, 82, 98), (240, 163, 91) if u > 0 else (106, 155, 224), min(1, abs(u) / mx_utv))
    n_ok = sum(1 for s in FEAT if kvm_of(s) and kvm_of(s) <= budget_need)
    views = {
        "pris": ("Kr per kvm", L.kr(lan_k), "kr/kvm i länet", [f"Dyrast: {FEAT[top]['properties']['namn']}, {L.kr(kvm_of(top))} kr/kvm", f"Bostadsrätter, {per['m3']}"],
                 lambda s: L.price_color(kvm_of(s), kvm_max)),
        "budget": ("Var har jag råd?", f"{n_ok} av {len(ranked)}", "områden", ["där 5 Mkr räcker till 70 kvm", "Testa med din egen budget"], budget_col),
        "trend": ("Största rörelserna", L.pct(rec12(utvs[0])["utv"]), "på ett år", [f"{FEAT[utvs[0]]['properties']['namn']} steg mest", f"Bostadsrätter, {per['m12']}"], trend_col),
        "volym": ("Flest affärer", L.kr(br(vols[0]).get("antal")), "sålda", [f"{FEAT[vols[0]]['properties']['namn']}, {per['m3']}", "Bostadsrätter per område"],
                  lambda s: L.ramp((br(s).get("antal") or 0) / mx_vol)),
    }
    city_box = L.expand(L.bbox([FEAT[s] for s in stad]), 1.25)
    for vy, (t, big, unit, lines, col) in views.items():
        L.og_image(SITE / "og" / f"vy-{vy}.png", t, big, unit, lines, feats, col, box=city_box)

    # ---------- sitemap ----------
    (SITE / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "".join(f"  <url><loc>{e(u)}</loc><lastmod>{snap['uppdaterad']}</lastmod></url>\n" for u in urls) + "</urlset>\n")
    (SITE / "robots.txt").write_text(f"User-agent: *\nAllow: /\nSitemap: {base}sitemap.xml\n")

    print(f"Byggde kartan, {len(FEAT)} områdessidor, {len(views)} vysidor och {len(FEAT) + len(views)} delningsbilder från {snap['uppdaterad']}")


if __name__ == "__main__":
    main()
