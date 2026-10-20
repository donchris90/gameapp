"""Builds the Apex Run engine sounds (V10 loops at five rev levels, wind, tyre squeal, nitro whoosh, blow-off, exhaust pop).
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

def engine(rpm, seconds=2.0, cyl=10):
    """An exotic V10: a clean harmonic wail, not noise. Every firing is a sharp pulse; the pulses sit in a circle (so the loop is seamless)
    with a tiny timing and strength wobble so it is alive rather than a synth tone. The whole train is then shaped in the frequency domain by
    fixed exhaust/body resonances (they do not move with the revs, which is what makes it sound like a real car), plus a little intake rasp that
    grows with the revs and a soft saturation for bite."""
    f_fire = rpm / 60 * cyl / 2
    cycles = max(1, round(seconds * f_fire / cyl)); f_fire = cycles * cyl / seconds
    n = int(SR * seconds); r = np.random.default_rng(int(rpm))
    amp = np.array([1, .9, .96, .88, 1, .92, .97, .86, .99, .9])[:cyl]
    train = np.zeros(n)
    for k in range(cycles * cyl):
        pos = (k + r.normal(0, 0.03)) / f_fire * SR
        i0 = int(pos) % n; frac = pos - int(pos)
        a = amp[k % cyl] * (0.94 + 0.12 * r.random())
        train[i0] += a * (1 - frac); train[(i0 + 1) % n] += a * frac
    X = np.fft.rfft(train); f = np.fft.rfftfreq(n, 1 / SR)
    # fixed resonances of the exhaust and body (centre Hz, width Hz, gain)
    H = 0.05 + 0 * f
    for c, w, g in [(240, 120, 1.6), (520, 200, 1.2), (900, 300, 1.0), (1500, 450, 0.9), (2400, 700, 0.55), (3600, 900, 0.3)]:
        H = H + g * np.exp(-0.5 * ((f - c) / w) ** 2)
    H = H * (1 / (1 + (f / 5200) ** 4)) * (1 - np.exp(-(f / 70) ** 2))  # rolloff above ~5 kHz, nothing below ~70 Hz
    out = np.fft.irfft(X * H, n)
    out /= np.max(np.abs(out))
    # intake rasp: band noise that is loudest on each firing and grows with revs
    N = np.fft.rfft(r.standard_normal(n)) * np.exp(-0.5 * ((f - 1700) / 900) ** 2)
    rasp = np.fft.irfft(N, n); rasp /= np.max(np.abs(rasp))
    env = 0.55 + 0.45 * np.cos(2 * np.pi * f_fire * np.arange(n) / SR)
    out = out + rasp * env * (0.10 + 0.16 * min(1, rpm / 8000))
    out = np.tanh(1.9 * out / np.max(np.abs(out)))
    return signal.lfilter(*signal.butter(1, 45 / (SR / 2), 'high'), out)

def loopnoise(seconds, filt):
    n = int(SR * seconds); fade = int(SR * 0.25)
    x = filt(rng.standard_normal(n + fade))
    w = np.linspace(0, 1, fade)
    out = x[:n].copy(); out[:fade] = x[:fade] * w + x[n:n + fade] * (1 - w)
    return out

for i, rpm in enumerate([1800, 3200, 5000, 6800, 8600], 1): save(f'engine_{i}.wav', engine(rpm))
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
