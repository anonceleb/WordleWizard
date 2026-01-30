# ============================================================
# Provably Streak-Optimal Word Selector (Hard Mode, Minimax)
# ============================================================

from functools import lru_cache
from collections import defaultdict


# ------------------------------------------------------------
# Load word list
# ------------------------------------------------------------

def load_words(filename="words.txt"):
    with open(filename) as f:
        return tuple(w.strip() for w in f if len(w.strip()) == 5)

# ------------------------------------------------------------
# Wordle feedback (ASCII only)
# G = green, Y = yellow, B = black
# ------------------------------------------------------------

def feedback(guess, target):
    res = ['B'] * 5
    cnt = defaultdict(int)

    # Greens
    for i in range(5):
        if guess[i] == target[i]:
            res[i] = 'G'
        else:
            cnt[target[i]] += 1

    # Yellows
    for i in range(5):
        if res[i] == 'B' and cnt[guess[i]] > 0:
            res[i] = 'Y'
            cnt[guess[i]] -= 1

    return ''.join(res)

# ------------------------------------------------------------
# Partition candidate set by feedback
# ------------------------------------------------------------

def partition(words, guess):
    parts = defaultdict(list)
    for w in words:
        parts[feedback(guess, w)].append(w)

    return tuple(
        (pattern, tuple(subset))
        for pattern, subset in sorted(parts.items())
    )

# comput entropy given part lengths
def compute_entropy(part_lengths, total_count):
    from math import log2

    entropy = 0.0
    for count in part_lengths.values():
        p = count / total_count
        if p > 0:
            entropy -= p * log2(p)
    return entropy

# sort words by entropy in descending order
def sort_words_by_entropy(words):
    total_count = len(words)
    entropy_dict = {}
    for w in words:       
        part_lengths = defaultdict(int)
        
        for target in words:
            part_lengths[feedback(w, target)] += 1
        
        entropy_dict[w] = compute_entropy(part_lengths, total_count)
    return sorted(words, key=lambda w: entropy_dict[w], reverse=True)

# ------------------------------------------------------------
# Guess word selection optimization
# ------------------------------------------------------------
def select_guess_words(words, depth_left):
    # choose only words with non-repeating letters as guess words
    if depth_left >= 4:
        guess_words = [w for w in words if len(set(w)) == 5]    

        cnt= 0
        selected_words = []

        for gw in guess_words:       
            part_lengths = defaultdict(int)
            
            for w in words:
                part_lengths[feedback(gw, w)] += 1         
            

            # skip the guess word if part length count for patterns with certain black/yellow counts exceed thresholds
            skip_guess_word = False
            for pattern, count in part_lengths.items():
                num_black = pattern.count('B')
                num_yellow = pattern.count('Y')           
                if (num_yellow == 0) and (num_black == 1) and count > 5:
                    skip_guess_word = True
                    # print("skipped guess word case 1", gw, pattern, count)
                    break

            if skip_guess_word is False:
                cnt += 1
                # print("kept guess word ", gw, cnt)
                selected_words.append(gw)
        
        # 
        # if no words selected, fallback to all words
        if len(words) > 0 and len(selected_words) == 0:
            selected_words = words
    else:
        selected_words = words    

    return selected_words

# ------------------------------------------------------------
# Minimax depth computation with caching
# speed up min_depth. avoid string as much as possible
@lru_cache(None)
def min_depth(state, depth_left):
    n = len(state)
    if n <= 1:
        return 1

    if depth_left == 0:
        return float("inf")

    best = float("inf")

    for guess in state:
        worst = 0
        parts = partition(state, guess)

        for _, subset in parts:
            d = min_depth(subset, depth_left - 1)
            worst = max(worst, d)

            # # prune branch
            if worst >= best:
                break

        score = 1 + worst
        if score < best:
            best = score

            # solved next move, no need to explore
            if best == 1:
                return 1

    return best


# ------------------------------------------------------------
# Optimal word selector (core result)
# ------------------------------------------------------------

def optimal_word(words, depth_left=6):
    best_word = None
    best_score = float("inf")

    MAX_GUESSES_TO_EVALUATE = 100

    words = sort_words_by_entropy(words)
    # using entropy to select guess words helps to speed up early stopping
    guess_words = select_guess_words(words, depth_left)    
    
    guess_words = guess_words[:MAX_GUESSES_TO_EVALUATE]
    # print("Number of guess words to evaluate:", len(guess_words))
    for guess in guess_words:
        # print(f"Evaluating guess: {guess}")
        worst = 1
        
        for _, subset in partition(words, guess):
            d = min_depth(subset, depth_left - 1)
            worst = max(worst, d)

        if worst < best_score:
            best_score = worst     
            best_word = guess     

        # print(f"Evaluating guess: {guess}", "Worst-case depth:", worst)
               
        # early stopping
        if depth_left == 5 and best_score == 4:
           break
        
        # print(f"Evaluating guess: {guess}", "Worst-case depth:", worst)
   
    return best_word

def optimal_guess_from_feedback(
    possible_words,
    previous_guess,
    feedback_string,
    depth_left
):
    """
    possible_words   : tuple of remaining candidate words
    previous_guess   : the word that was just guessed
    feedback_string  : Wordle feedback (e.g. 'BGYBB')
    depth_left       : remaining guesses (e.g. 5 after first guess)

    returns: streak-optimal next guess
    """

    # Choose minimax-optimal next word
     # Update candidate set using feedback
    parts = dict(partition(possible_words, previous_guess))
    new_possible = parts[feedback_string]
    next_guess = optimal_word(new_possible, depth_left)
    
    return next_guess, new_possible


# ------------------------------------------------------------
# Main
# ------------------------------------------------------------

if __name__ == "__main__":
    words = load_words("words.txt")   

    import sys
    if (len(sys.argv) != 4):
        print("Usage: python wordle_solver.py <prev_guess> <feedback> <number of attemps so far>")
        print(" Recommended to run after using the first guess word as 'abode' in wordle")
        sys.exit(1)  
    if len(sys.argv) == 4:       
        possible = words 
        guess = sys.argv[1]
        fb = sys.argv[2] 
        depth_left = 6 - int(sys.argv[3])

    # get new guess and new possible
    new_guess, new_possible = optimal_guess_from_feedback(
            possible_words=possible,
            previous_guess= guess,
            feedback_string=fb,
            depth_left = depth_left)
    print("next optimal guess:", new_guess)
    print("remaining possible words:", new_possible)


   