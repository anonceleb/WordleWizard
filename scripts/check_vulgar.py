#!/usr/bin/env python3
"""Check words lists for exact matches against a list of vulgar/obscene words.
Produces a report to stdout and to ./scripts/vulgar_matches.txt
"""
from pathlib import Path
vulgar = {"fuck","fucks","fucked","fucking","shit","shits","shitted","shitting","bitch","bitches","bastard","cunt","cunts","asshole","assholes","ass","asses","arse","arsehole","arseholes","dick","dicks","tit","tits","titty","titties","piss","pissed","pisses","pissing","whore","whores","slut","sluts","fag","faggot","faggots","motherfucker","motherfuckers","bollocks","bugger","twat","bloody","damn","damnit","damned","orgy","orgies","rape","raped","rapes","rapist","rapists","nigger","nigga","niggas","suck","sucks","sucked","sucking","cock","cocks","cum","cummer","cummies","jizz","spunk","wank","wanker","wankers","handjob","handjobs","blowjob","blowjobs","anal","analsex","porn","porno","pornhub","dildo","sex","sexy","hooker","hookers","ho","hoes"}

files = [Path('words.txt'), Path('extension/words.txt')]
report = []
for f in files:
    if not f.exists():
        report.append(f"File not found: {f}\n")
        continue
    words = {w.strip().lower() for w in f.read_text().splitlines() if w.strip()}
    matches = sorted(w for w in words if w in vulgar)
    report.append(f"File: {f} - matches: {len(matches)}")
    for m in matches:
        report.append(m)
    report.append("")

out = "\n".join(report)
print(out)
Path('scripts/vulgar_matches.txt').write_text(out)
print('Wrote report to scripts/vulgar_matches.txt')