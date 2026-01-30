// Simple profiler for WordleSolver.debug_optimal_word
// Run from repo root: node scripts/profile_solver.js

const path = require('path');
const fs = require('fs');

// Provide minimal browser-like globals expected by solver.js
global.window = global;
global.performance = global.performance || { now: () => Date.now() };

// Load solver
require(path.join(__dirname, '..', 'extension', 'solver.js'));

if (!global.WordleSolver) {
  console.error('WordleSolver not loaded');
  process.exit(1);
}

// Load words
const wordsTxt = fs.readFileSync(path.join(__dirname, '..', 'extension', 'words.txt'), 'utf8');
const words = wordsTxt.split(/\r?\n/).map(w => w.trim()).filter(w => w.length === 5);

const sizes = [10, 50, 100, 200, 400, 600, 800, 1000];
console.log('Total words available:', words.length);

(async function(){
  for (const size of sizes) {
    const sample = words.slice(0, Math.min(size, words.length));
    const runs = 3;
    let total = 0;
    for (let i = 0; i < runs; i++) {
      const t0 = Date.now();
      const r = global.WordleSolver.debug_optimal_word(sample, 6);
      const t1 = Date.now();
      total += (t1 - t0);
    }
    console.log(`size=${size} avg=${(total/runs).toFixed(1)}ms`);
  }
})();
