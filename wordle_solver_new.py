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

    # Evaluate each candidate word as a guess

    guess_cnt  = 0
    for guess in words:
        guess_cnt += 1
        # print(f"Evaluating guess: {guess}")
        worst = 1

        for _, subset in partition(words, guess):
            d = min_depth(subset, depth_left - 1)
            worst = max(worst, d)

        # breakpoint()

        if worst < best_score:
            best_score = worst     
            best_word = guess     

        # print(f"Evaluating guess: {guess}", "Worst-case depth:", worst)
               
        # early stopping
        if guess_cnt > 100 and best_score < depth_left:
            return best_word
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
    print("new possible words count:", len(new_possible))
    next_guess = optimal_word(new_possible, depth_left)
    
    return next_guess, new_possible

# simulate single game
def simulate_single_game(target_word, first_guess="abode"):
    possible = load_words("words.txt")
    guess = first_guess
    depth_left = 6

    while depth_left > 0:
        fb = feedback(guess, target_word)    
                

        if fb == "GGGGG":
            print(f"Solved! The word is {guess}", "num attempts:", 7 - depth_left)
            return 7 - depth_left
        
        guess, possible = optimal_guess_from_feedback(
        possible_words=possible,
        previous_guess= guess,
        feedback_string=fb,
        depth_left = depth_left)            
        depth_left -= 1
        # print(f"Next guess: {guess}, Feedback: {fb}, Remaining possible words: {len(possible)}")

    print(f"Failed to solve for target word {target_word}")
    return 7


# write a function to simulate a full game for all possible target words
def simulate_game(first_guess="abode"):
    # dictionary with words as keys and number of attempts to solve as values
    results = {}

    words = load_words("words.txt")
    for target_word in words:
        # print(f"Simulating game for target word: {target_word}")
        attempts = simulate_single_game(target_word, first_guess)
        results[target_word] = attempts

    # save results to a text file
    with open("simulation_results.txt", "w") as f:
        for word, attempts in results.items():
            f.write(f"{word}: {attempts}\n")


# ------------------------------------------------------------
# Main
# ------------------------------------------------------------

if __name__ == "__main__":
    # simulate_game()
    # simulate_single_game("cairn")
    import sys
    if (len(sys.argv) != 4):
        print("Usage: python wordle_solver.py <prev_guess> <feedback> <number of attemps so far>")
        print(" Recommended to run after using the first guess word as 'abode' in wordle")
        sys.exit(1)  
    if len(sys.argv) == 4:       
        guess = sys.argv[1]
        fb = sys.argv[2] 
        depth_left = 6 - int(sys.argv[3])

        if depth_left == 5:
            # use words.txt
            possible = load_words("words.txt")
        else:
            # load possible words from previous round
            possible = load_words("possible_words.txt")

    if len(possible) == 0:
        print("No possible words remaining. Please check your inputs.")
        sys.exit(1)
    elif len(possible) == 1:
        print("The only possible word based on my word list is:", possible[0])
        sys.exit(0)

    # get new guess and new possible
    new_guess, new_possible = optimal_guess_from_feedback(
            possible_words=possible,
            previous_guess= guess,
            feedback_string=fb,
            depth_left = depth_left)
    print("next optimal guess:", new_guess)
    # print("remaining possible words:", new_possible)
    # save new possible for next round as a text file
    with open("possible_words.txt", "w") as f:
        for w in new_possible:
            f.write(w + "\n")