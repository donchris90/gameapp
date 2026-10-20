"""Generates the game sound effects as small WAV files (no copyright issues). Run: python3 scripts/gen_sfx.py"""
import math, random, struct, wave, os
R = 22050
out = os.path.join(os.path.dirname(__file__), '..', 'assets', 'sfx')
random.seed(7)

def write(name, samples):
    peak = max(1e-9, max(abs(s) for s in samples))
    with wave.open(os.path.join(out, name + '.wav'), 'w') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(R)
        w.writeframes(b''.join(struct.pack('<h', int(max(-1, min(1, s / peak * 0.9)) * 32767)) for s in samples))

def tone(freq, dur, vol=1.0, decay=8.0, kind='sine'):
    n = int(R * dur); res = []
    for i in range(n):
        t = i / R
        ph = 2 * math.pi * freq * t
        v = math.sin(ph) if kind == 'sine' else (1 if math.sin(ph) > 0 else -1) * 0.5
        res.append(v * math.exp(-decay * t) * vol)
    return res

def noise(dur, vol=1.0, decay=20.0):
    return [(random.random() * 2 - 1) * math.exp(-decay * (i / R)) * vol for i in range(int(R * dur))]

def mix(*parts):
    n = max(len(p) for p in parts); res = [0.0] * n
    for p in parts:
        for i, v in enumerate(p): res[i] += v
    return res

def seq(*items):  # (delay_seconds, samples)
    n = max(int(R * d) + len(s) for d, s in items); res = [0.0] * n
    for d, s in items:
        o = int(R * d)
        for i, v in enumerate(s): res[o + i] += v
    return res

# a short wooden tap for a seed dropping into a bowl
write('drop', mix(tone(520, 0.09, 1, 40), noise(0.03, 0.4, 90)))
# tapping a bowl / tube / cell
write('tap', mix(tone(880, 0.06, 1, 50), noise(0.02, 0.2, 120)))
# four seeds packed: a bright little chime
write('pack', seq((0, tone(784, 0.25, 1, 9)), (0.08, tone(988, 0.25, 0.9, 9)), (0.16, tone(1318, 0.35, 0.8, 7))))
# dice shaking: many quick clacks
rattle = [(i * 0.045 + random.random() * 0.02, mix(tone(random.choice([700, 900, 1100, 1400]), 0.05, 1, 60), noise(0.025, 0.7, 100))) for i in range(11)]
write('dice_roll', seq(*rattle))
# dice landing: heavier thud then a clack
write('dice_land', seq((0, mix(tone(180, 0.18, 1, 22), noise(0.05, 0.5, 70))), (0.09, mix(tone(900, 0.05, 0.8, 60), noise(0.02, 0.5, 100)))))
# pouring water: bubbly glug that rises
glug = [(i * 0.05, tone(300 + i * 70 + random.random() * 40, 0.09, 0.8, 30)) for i in range(7)]
write('pour', mix(seq(*glug), noise(0.4, 0.15, 6)))
# a tube is complete: sparkle
write('complete', seq(*[(i * 0.06, tone(1046 * (1.25 ** i), 0.3, 0.8, 9)) for i in range(4)]))
# no moves left: low double buzz
write('nomoves', seq((0, tone(150, 0.18, 1, 6, 'square')), (0.22, tone(120, 0.3, 1, 5, 'square'))))
# capture / token sent home in Ludo
write('capture', seq((0, tone(500, 0.1, 1, 14)), (0.07, tone(330, 0.22, 1, 9))))
# new round banner
write('round', seq((0, tone(523, 0.2, 1, 8)), (0.12, tone(659, 0.2, 1, 8)), (0.24, tone(784, 0.4, 1, 6))))
# Apex Run: a crash (thud + crunch), countdown beep, go, nitro whoosh, and a looping engine hum
write('crash', mix(tone(95, 0.35, 1, 9), noise(0.3, 0.9, 10), tone(220, 0.12, 0.5, 30, 'square')))
write('beep', tone(660, 0.18, 1, 10))
write('go', mix(tone(990, 0.45, 1, 5), tone(1320, 0.35, 0.5, 6)))
whoosh = [(random.random() * 2 - 1) * (math.sin(math.pi * i / (R * 0.7)) ** 1.5) for i in range(int(R * 0.7))]
write('nitro', whoosh)
# engine: one second, whole number of cycles so it loops without a click
eng = []
for i in range(R):
    t_ = i / R
    eng.append(0.55 * math.sin(2 * math.pi * 55 * t_) + 0.3 * math.sin(2 * math.pi * 110 * t_) + 0.18 * math.sin(2 * math.pi * 165 * t_ + 0.7) + 0.08 * (random.random() * 2 - 1))
write('engine', eng)
print('done')
