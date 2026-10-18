"""Fel som visas för den som kör pipelinen. Meddelandena är på svenska."""


class PipelineError(Exception):
    """Basklass: CLI:t skriver ut meddelandet och avslutar med kod 1."""


class ParseError(PipelineError):
    """Mäklarstatistiks sida ser inte ut som väntat."""


class SnapshotError(PipelineError):
    """En ögonblicksbild saknas eller är ofullständig."""
