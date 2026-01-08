from __future__ import annotations

import math


class BM25:
    def __init__(self, corpus: list[list[str]], k1: float = 1.5, b: float = 0.75):
        self._corpus = corpus
        self._k1 = k1
        self._b = b
        self._doc_len = [len(doc) for doc in corpus]
        self._avgdl = sum(self._doc_len) / max(1, len(self._doc_len))
        self._df: dict[str, int] = {}
        for doc in corpus:
            for token in set(doc):
                self._df[token] = self._df.get(token, 0) + 1

    def score(self, query_tokens: list[str], doc_index: int) -> float:
        if not query_tokens:
            return 0.0
        doc = self._corpus[doc_index]
        if not doc:
            return 0.0
        tf: dict[str, int] = {}
        for token in doc:
            tf[token] = tf.get(token, 0) + 1
        score = 0.0
        doc_len = self._doc_len[doc_index]
        for token in query_tokens:
            df = self._df.get(token, 0)
            if df == 0:
                continue
            idf = math.log(1 + (len(self._corpus) - df + 0.5) / (df + 0.5))
            freq = tf.get(token, 0)
            denom = freq + self._k1 * (
                1 - self._b + self._b * (doc_len / max(1.0, self._avgdl))
            )
            score += idf * ((freq * (self._k1 + 1)) / max(1.0, denom))
        return score
