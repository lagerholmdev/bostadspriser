import pytest

from prislandskap import cli
from prislandskap.errors import SnapshotError


def test_unknown_command_exits():
    with pytest.raises(SystemExit):
        cli.main(["deploy"])


def test_pipeline_error_gives_exit_code_1(monkeypatch, caplog):
    def fail() -> None:
        raise SnapshotError("Ingen ögonblicksbild")

    monkeypatch.setitem(cli.COMMANDS, "export", (fail, ""))
    assert cli.main(["export"]) == 1
    assert "Fel: Ingen ögonblicksbild" in caplog.text


def test_all_runs_export_then_og(monkeypatch):
    calls: list[str] = []
    monkeypatch.setattr(cli, "_export", lambda: calls.append("export"))
    monkeypatch.setattr(cli, "_og", lambda: calls.append("og"))
    assert cli.main(["all"]) == 0
    assert calls == ["export", "og"]
