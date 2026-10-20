"""Builds the Apex Run engine sounds (V8 loops at two pitches, wind, tyre squeal, nitro whoosh, turbo, blow-off, exhaust pop).
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

def engine(f0, seconds=2.0):
    """A V8: pulses at f0 (4 firings a turn) plus half and odd-half harmonics for the uneven burble. Every partial fits whole cycles in `seconds`, so it loops."""
    n = int(SR * seconds); t = np.arange(n) / SR; x = np.zeros(n)
    for k2 in range(1, 90):
        f = f0 * k2 / 2
        if f > 5200: break
        a = (1 / (k2 / 2) ** 0.95) * (1.0 if k2 % 2 == 0 else 0.35 + 0.25 * rng.random())
        a *= 1 / (1 + (f / 1800) ** 2)
        x += a * np.sin(2 * np.pi * f * t + rng.random() * 6.28)
    x = np.tanh(2.4 * x / np.max(np.abs(x)))
    return x

def loopnoise(seconds, filt):
    n = int(SR * seconds); fade = int(SR * 0.25)
    x = filt(rng.standard_normal(n + fade))
    w = np.linspace(0, 1, fade)
    out = x[:n].copy(); out[:fade] = x[:fade] * w + x[n:n + fade] * (1 - w)
    return out

save('engine_lo.wav', engine(167.0))    # about 2500 rpm
save('engine_hi.wav', engine(400.0))    # about 6000 rpm
b, a = signal.butter(2, [250 / (SR / 2), 4200 / (SR / 2)], 'band')
save('wind.wav', loopnoise(2.0, lambda x: signal.lfilter(b, a, x)))
b, a = signal.iirpeak(2100 / (SR / 2), 9)
save('squeal.wav', loopnoise(2.0, lambda x: signal.lfilter(b, a, x)))
b, a = signal.butter(3, 1600 / (SR / 2), 'high')
save('whoosh.wav', loopnoise(1.5, lambda x: signal.lfilter(b, a, x)))
t = np.arange(SR) / SR
save('turbo.wav', np.sin(2 * np.pi * 2200 * t + 0.4 * np.sin(2 * np.pi * 5 * t)) * 0.7 + 0.3 * np.sin(2 * np.pi * 4400 * t))
n = int(SR * 0.45); t = np.arange(n) / SR
b, a = signal.butter(3, 2500 / (SR / 2), 'high')
save('blowoff.wav', signal.lfilter(b, a, rng.standard_normal(n)) * np.exp(-t * 7))
n = int(SR * 0.12); t = np.arange(n) / SR
b, a = signal.butter(2, 900 / (SR / 2), 'low')
save('pop.wav', signal.lfilter(b, a, rng.standard_normal(n)) * np.exp(-t * 40))
print('done')
