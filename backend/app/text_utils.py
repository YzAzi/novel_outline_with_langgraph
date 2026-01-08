from __future__ import annotations

import re


def tokenize(text: str) -> list[str]:
    if not text:
        return []
    lowered = text.lower()
    words = re.findall(r"[a-z0-9]+", lowered)
    cjk = re.findall(r"[\u4e00-\u9fff]", text)
    return words + cjk


def keyword_score(query_tokens: list[str], text: str) -> int:
    if not query_tokens or not text:
        return 0
    text_tokens = set(tokenize(text))
    return len(text_tokens.intersection(query_tokens))
