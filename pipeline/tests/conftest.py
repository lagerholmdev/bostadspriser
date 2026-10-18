import copy
import json
from pathlib import Path

import pytest

from prislandskap.config import GEO_FILE, SNAPSHOT_DIR
from prislandskap.models import Snapshot

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def fixture_html():
    def read(name: str) -> str:
        return (FIXTURES / name).read_text(encoding="utf-8")

    return read


@pytest.fixture(scope="session")
def _snapshot() -> Snapshot:
    return json.loads((SNAPSHOT_DIR / "2026-10.json").read_text(encoding="utf-8"))


@pytest.fixture
def snapshot(_snapshot: Snapshot) -> Snapshot:
    """Den incheckade ögonblicksbilden, som en kopia testet får ändra i."""
    return copy.deepcopy(_snapshot)


@pytest.fixture(scope="session")
def features() -> list[dict]:
    return json.loads(GEO_FILE.read_text(encoding="utf-8"))["features"]
