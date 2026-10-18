from pathlib import Path

import pytest

from prislandskap.config import ROOT, find_repo_root, is_repo_root
from prislandskap.errors import PipelineError


def test_root_is_the_repo():
    assert is_repo_root(ROOT)
    assert (ROOT / "pipeline" / "pyproject.toml").is_file()


def test_walks_up_from_any_start(tmp_path: Path):
    (tmp_path / "data").mkdir()
    (tmp_path / "web").mkdir()
    deep = tmp_path / "pipeline" / "src" / "x"
    deep.mkdir(parents=True)
    assert find_repo_root([deep]) == tmp_path.resolve()


def test_tries_next_start_when_first_is_outside(tmp_path: Path):
    repo, outside = tmp_path / "repo", tmp_path / "site-packages" / "prislandskap"
    (repo / "data").mkdir(parents=True)
    (repo / "web").mkdir()
    outside.mkdir(parents=True)
    assert find_repo_root([outside, repo / "web"]) == repo.resolve()


def test_env_wins(tmp_path: Path):
    assert find_repo_root([Path("/")], env=str(tmp_path)) == tmp_path.resolve()


def test_clear_error_in_swedish(tmp_path: Path):
    with pytest.raises(PipelineError, match="Hittar inte repots rot.*PRISLANDSKAP_ROOT"):
        find_repo_root([tmp_path])
    with pytest.raises(PipelineError, match="ingen katalog"):
        find_repo_root([tmp_path], env=str(tmp_path / "saknas"))
