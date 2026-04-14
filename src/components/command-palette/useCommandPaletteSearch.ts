/**
 * Debounced FTS message search hook for the command palette.
 *
 * The effect only calls `setFtsHits` from async callbacks (the `searchAll`
 * promise or an `AbortController`-style guarded timeout), which is the
 * pattern `react-hooks/set-state-in-effect` treats as a subscription.
 */
import { useEffect, useState } from 'react';
import { searchAll, type SearchHit } from '../../services/db';

const MIN_QUERY_LEN = 2;
const DEBOUNCE_MS = 150;
const MAX_HITS = 30;

export function useCommandPaletteSearch(open: boolean, search: string): SearchHit[] {
  const [ftsHits, setFtsHits] = useState<SearchHit[]>([]);

  useEffect(() => {
    let cancelled = false;
    const trimmed = search.trim();

    // Closed palette or query too short → clear hits asynchronously so the
    // effect body contains no synchronous setState calls.
    if (!open || !trimmed || trimmed.length < MIN_QUERY_LEN) {
      const handle = setTimeout(() => {
        if (!cancelled) setFtsHits([]);
      }, 0);
      return () => {
        cancelled = true;
        clearTimeout(handle);
      };
    }

    const handle = setTimeout(() => {
      searchAll(trimmed, MAX_HITS)
        .then((hits) => {
          if (!cancelled) setFtsHits(hits.filter((h) => h.kind === 'message'));
        })
        .catch(() => {
          if (!cancelled) setFtsHits([]);
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [open, search]);

  return ftsHits;
}
