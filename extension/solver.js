// Solver ported from wordle_solver.py (simplified JS translation)

const Solver = (function () {
  function loadWords(text) {
    return text.split(/\r?\n/).map(w => w.trim()).filter(w => w.length === 5);
  }

  function feedback(guess, target) {
    const res = Array(5).fill('B');
    const cnt = {};
    for (let i = 0; i < 5; i++) {
      if (guess[i] === target[i]) res[i] = 'G'; else cnt[target[i]] = (cnt[target[i]] || 0) + 1;
    }
    for (let i = 0; i < 5; i++) {
      if (res[i] === 'B' && cnt[guess[i]] > 0) {
        res[i] = 'Y'; cnt[guess[i]] -= 1;
      }
    }
    return res.join('');
  }

  function partition(words, guess) {
    const parts = new Map();
    for (const w of words) {
      const p = feedback(guess, w);
      if (!parts.has(p)) parts.set(p, []);
      parts.get(p).push(w);
    }
    // return array of [pattern, subset]
    return Array.from(parts.entries()).sort((a,b) => a[0].localeCompare(b[0]));
  }

  function compute_entropy(part_lengths, total_count) {
    let entropy = 0.0;
    for (const c of part_lengths.values()) {
      const p = c / total_count;
      if (p > 0) entropy -= p * (Math.log2 ? Math.log2(p) : Math.log(p) / Math.log(2));
    }
    return entropy;
  }

  function sort_words_by_entropy(words) {
    const total_count = words.length;
    const entropy_dict = new Map();
    for (const w of words) {
      const part_lengths = new Map();
      for (const target of words) {
        const f = feedback(w, target);
        part_lengths.set(f, (part_lengths.get(f) || 0) + 1);
      }
      entropy_dict.set(w, compute_entropy(part_lengths, total_count));
    }
    return words.slice().sort((a,b) => entropy_dict.get(b) - entropy_dict.get(a));
  }

  function select_guess_words(words, depth_left) {
    // Be conservative: apply this filter only in earlier stages (depth_left >= 5)
    if (depth_left >= 5) {
      let guess_words = words.filter(w => new Set(w).size === 5);
      const selected_words = [];
      for (const gw of guess_words) {
        const part_lengths = new Map();
        for (const w of words) {
          const f = feedback(gw, w);
          part_lengths.set(f, (part_lengths.get(f) || 0) + 1);
        }
        let skip = false;
        for (const [pattern, count] of part_lengths.entries()) {
          const num_black = (pattern.match(/B/g) || []).length;
          const num_yellow = (pattern.match(/Y/g) || []).length;
          // Less aggressive: only skip when there's exactly one black and that partition
          // is quite large (avoid skipping useful guesses on medium-sized candidate sets)
          if (num_yellow === 0 && num_black === 1 && count > 10) {
            skip = true; break;
          }
        }
        if (!skip) selected_words.push(gw);
      }
      if (words.length > 0 && selected_words.length === 0) return words;
      return selected_words;
    } else {
      return words;
    }
  }

  // Min depth with memoization
  const minDepthCache = new Map();
  function min_depth(stateArray, depth_left) {
    const key = stateArray.join('|') + '::' + depth_left;
    if (minDepthCache.has(key)) return minDepthCache.get(key);
    const n = stateArray.length;
    if (n <= 1) return 1;
    if (depth_left === 0) return Infinity;
    let best = Infinity;
    for (const guess of stateArray) {
      let worst = 0;
      const parts = partition(stateArray, guess);
      for (const [, subset] of parts) {
        const d = min_depth(subset, depth_left - 1);
        worst = Math.max(worst, d);
        if (worst >= best) break;
      }
      const score = 1 + worst;
      if (score < best) {
        best = score;
        if (best === 1) { minDepthCache.set(key, 1); return 1; }
      }
    }
    minDepthCache.set(key, best);
    return best;
  }

  function optimal_word(words, depth_left=6) {
    // Ported to mirror Python's `optimal_word` precisely (no entropy/filter heuristics)
    let best_word = null;
    let best_score = Infinity;

    let guess_cnt = 0;
    for (const guess of words) {
      guess_cnt += 1;
      let worst = 1;
      const parts = partition(words, guess);

      for (const [, subset] of parts) {
        const d = min_depth(subset, depth_left - 1);
        worst = Math.max(worst, d);

        // prune branch if already worse than best
        if (worst >= best_score) break;
      }

      const score = 1 + worst;
      if (score < best_score) {
        best_score = score;
        best_word = guess;

        // solved next move, no need to explore further
        if (best_score === 1) return best_word;
      }

      // early stopping similar to Python: after enough evaluations, if we already have
      // a solution better than remaining depth, return it
      if (guess_cnt > 100 && best_score < depth_left) return best_word;
    }

    return best_word;
  }

  // Debug variant that returns internal statistics (non-breaking)
  function debug_optimal_word(words, depth_left=6) {
    const start = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    let best_word = null;
    let best_score = Infinity;

    let guess_cnt = 0;
    let earlyExit = false;

    for (const guess of words) {
      guess_cnt += 1;
      let worst = 1;
      const parts = partition(words, guess);

      for (const [, subset] of parts) {
        const d = min_depth(subset, depth_left - 1);
        worst = Math.max(worst, d);
        if (worst >= best_score) break;
      }

      const score = 1 + worst;
      if (score < best_score) {
        best_score = score;
        best_word = guess;
        if (best_score === 1) { earlyExit = true; break; }
      }

      if (guess_cnt > 100 && best_score < depth_left) { earlyExit = true; break; }
    }

    const tookMs = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - start;
    return { next_guess: best_word, tookMs, guessCnt: guess_cnt, best_score: best_score, earlyExit };
  }

  function optimal_guess_from_feedback(possible_words, previous_guess, feedback_string, depth_left) {
    const parts = new Map(partition(possible_words, previous_guess));
    const new_possible = parts.get(feedback_string) || [];
    const next_guess = optimal_word(new_possible, depth_left);
    return { next_guess, new_possible };
  }

  // Helper: reduce by sequence of (guess, fb)
  function reduce_possible(words, history) {
    let possible = words.slice();
    for (const [g, fb] of history) {
      const parts = new Map(partition(possible, g));
      possible = parts.get(fb) || [];
    }
    return possible;
  }

  return {
    loadWords,
    feedback,
    partition,
    optimal_word,
    optimal_guess_from_feedback,
    reduce_possible,
    min_depth_cache_clear: () => minDepthCache.clear(),
    sort_words_by_entropy,
    select_guess_words,
    // Debug helper: evaluate worst-case depth for each candidate guess (useful for diagnostics)
    debug_eval_guesses: (candidateWords, depth_left=6) => {
      const out = [];
      for (const guess of candidateWords) {
        let worst = 1;
        const parts = partition(candidateWords, guess);
        for (const [, subset] of parts) {
          const d = min_depth(subset, depth_left - 1);
          worst = Math.max(worst, d);
        }
        out.push({ guess, worst });
      }
      return out;
    },
    // Non-breaking debug variant of optimal_word that returns stats useful for profiling
    debug_optimal_word
  };
})();

// Expose for content script usage
window.WordleSolver = Solver;
