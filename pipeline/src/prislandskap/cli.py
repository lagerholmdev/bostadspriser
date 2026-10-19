"""Kommandorad: python -m prislandskap scrape|export|og|geometry|deso|scb|all"""

import argparse
import logging
from collections.abc import Callable

from prislandskap.errors import PipelineError

log = logging.getLogger("prislandskap")


def _scrape() -> None:
    from prislandskap import scrape

    scrape.run()


def _export() -> None:
    from prislandskap import export

    export.run()


def _og() -> None:
    from prislandskap import og

    og.run()


def _geometry() -> None:
    from prislandskap import geometry

    geometry.run()


def _deso() -> None:
    from prislandskap import deso

    deso.run()


def _scb() -> None:
    from prislandskap import scb

    scb.run()


def _all() -> None:
    _export()
    _og()


COMMANDS: dict[str, tuple[Callable[[], None], str]] = {
    "scrape": (_scrape, "hämta senaste månaden från Mäklarstatistik till data/snapshots/ (nätverk)"),
    "export": (_export, "skriv web/src/generated/ från senaste ögonblicksbilden och geometrin"),
    "og": (_og, "rita delningsbilder till web/public/og/"),
    "geometry": (_geometry, "bygg om data/geo/areas.geojson från källorna (kräver [geo])"),
    "deso": (_deso, "bygg data/scb/deso.csv: DeSO 2025 till område (nätverk, kräver [geo])"),
    "scb": (_scb, "hämta SCB:s områdesstatistik till data/scb/kontext.json (nätverk, årsvis)"),
    "all": (_all, "export + og"),
}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="prislandskap", description="Datapipeline för Stockholms prislandskap."
    )
    parser.add_argument("-v", "--verbose", action="store_true", help="visa felsökningsloggar")
    sub = parser.add_subparsers(dest="command", required=True, metavar="kommando")
    for name, (_, help_text) in COMMANDS.items():
        sub.add_parser(name, help=help_text)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO, format="%(message)s")
    try:
        COMMANDS[args.command][0]()
    except PipelineError as err:
        log.error("Fel: %s", err)
        return 1
    return 0
