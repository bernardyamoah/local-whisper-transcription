"""Keep optional MLX Whisper word-alignment dependencies out of the app bundle."""

import sys
import types


def add_word_timestamps(**kwargs):
    raise RuntimeError("Word-level timestamps are not included in this build.")


timing = types.ModuleType("mlx_whisper.timing")
timing.add_word_timestamps = add_word_timestamps
sys.modules["mlx_whisper.timing"] = timing
