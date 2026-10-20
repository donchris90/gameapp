"""Builds the Apex Run engine sounds (V8 loops at four rev levels, wind, tyre squeal, nitro whoosh, blow-off, exhaust pop).
Run: python3 tools/make_engine_sounds.py   -> writes mobile/assets/sfx/*.wav. The loops are seamless."""
import numpy as np, wave, os
from scipy import signal
SR = 22050
OUT = os.path.join(os.path.dirname(__file__), '..', 'mobile', 'assets', 'sfx')
rng = np.random.default_rng(7)

def save(name, x, peak=0.9):
    x = x / (np.max(np.abs(x)) + 1e-9) * peak
    with wave.open(os.path.join(OUT, name), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((x * 32767).astype('<i2').tobytes())

def engine(rpm, seconds=2.0):
    """A V8 made of real firing pulses, not a steady tone: every firing is a short thump (a body resonance plus a burst of noise) that is a little different
    from the last; the eight firings of a full turn have uneven strength (the V8 burble). The pulses are added in a circle, so the loop is seamless."""
    f_fire = rpm / 60 * 4
    cycles = max(1, round(seconds * f_fire / 8)); f_fire = cycles * 8 / seconds
    n = int(SR * seconds); out = np.zeros(n); r = np.random.default_rng(int(rpm))
    amp = [1, .72, .92, .62, 1, .78, .88, .66]
    tau = 0.03 * (1500 / rpm) ** 0.6
    m = int(SR * 0.16); tt = np.arange(m) / SR
    lp = signal.butter(2, 1100 / (SR / 2))
    for k in range(cycles * 8):
        a = amp[k % 8] * (0.85 + 0.3 * r.random())
        body = (np.sin(2 * np.pi * (80 + 20 * r.random()) * tt) + 0.6 * np.sin(2 * np.pi * (165 + 30 * r.random()) * tt + 1)) * np.exp(-tt / tau)
        puff = signal.lfilter(*lp, r.standard_normal(m)) * np.exp(-tt / (tau * 0.5)) * 2.2
        pulse = (body + puff) * a
        i0 = int(((k + r.normal(0, 0.03)) / f_fire) * SR) % n
        idx = (i0 + np.arange(m)) % n
        out[idx] += pulse
    bed = signal.lfilter(*signal.butter(2, 700 / (SR / 2)), r.standard_normal(n)) * 0.12
    out += bed * (0.6 + 0.4 * np.abs(np.sin(np.pi * np.arange(n) / SR * f_fire)))
    out = np.tanh(1.6 * out / np.max(np.abs(out)))
    out = signal.lfilter(*signal.butter(2, 4200 / (SR / 2)), out)
    return signal.lfilter(*signal.butter(1, 45 / (SR / 2), 'high'), out)  # no DC offset

def loopnoise(seconds, filt):
    n = int(SR * seconds); fade = int(SR * 0.25)
    x = filt(rng.standard_normal(n + fade))
    w = np.linspace(0, 1, fade)
    out = x[:n].copy(); out[:fade] = x[:fade] * w + x[n:n + fade] * (1 - w)
    return out

for i, rpm in enumerate([1500, 3000, 4800, 7000], 1): save(f'engine_{i}.wav', engine(rpm))
b, a = signal.butter(2, [250 / (SR / 2), 4200 / (SR / 2)], 'band')
save('wind.wav', loopnoise(2.0, lambda x: signal.lfilter(b, a, x)))
b, a = signal.iirpeak(2100 / (SR / 2), 9)
save('squeal.wav', loopnoise(2.0, lambda x: signal.lfilter(b, a, x)))
b, a = signal.butter(3, 1600 / (SR / 2), 'high')
save('whoosh.wav', loopnoise(1.5, lambda x: signal.lfilter(b, a, x)))
n = int(SR * 0.45); t = np.arange(n) / SR
b, a = signal.butter(3, 2500 / (SR / 2), 'high')
save('blowoff.wav', signal.lfilter(b, a, rng.standard_normal(n)) * np.exp(-t * 7))
n = int(SR * 0.12); t = np.arange(n) / SR
b, a = signal.butter(2, 900 / (SR / 2), 'low')
save('pop.wav', signal.lfilter(b, a, rng.standard_normal(n)) * np.exp(-t * 40))
print('done')
