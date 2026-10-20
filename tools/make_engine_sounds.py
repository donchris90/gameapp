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

# One engine character per car. cyl: cylinders; amp: firing strength pattern (uneven = burble); res: fixed exhaust/body resonances (centre Hz, width Hz, gain);
# rasp: intake noise level; jit: firing timing wobble; whine: (order of the revs, level) of a supercharger/turbo whine; electric: a motor, not a combustion engine.
CARS = {
    'cts':     dict(cyl=8,  amp=[1, .74, .96, .66, 1, .78, .93, .7], res=[(150, 80, 1.9), (330, 130, 1.5), (700, 240, 1.1), (1300, 380, .7), (2300, 650, .35)], rasp=.10, jit=.035, whine=(2.6, .07)),
    'gt3':     dict(cyl=6,  amp=[1, .97, 1, .96, 1, .97], res=[(380, 140, 1.3), (900, 300, 1.4), (1700, 500, 1.2), (3000, 800, .8), (4200, 900, .4)], rasp=.22, jit=.02, whine=None),
    'one1':    dict(electric=True),
    'chiron':  dict(cyl=16, amp=[1, .95, .98, .93, 1, .94, .97, .92, 1, .95, .98, .93, 1, .94, .97, .92], res=[(95, 50, 2.0), (230, 90, 1.6), (520, 180, 1.1), (1000, 320, .8), (1900, 600, .35)], rasp=.14, jit=.025, whine=(11.0, .045)),
    'mansory': dict(cyl=16, amp=[1, .86, .98, .8, 1, .88, .95, .82, 1, .87, .97, .81, 1, .86, .96, .8], res=[(110, 60, 2.0), (260, 100, 1.5), (600, 220, 1.4), (1300, 400, 1.2), (2600, 800, .7), (3800, 900, .4)], rasp=.28, jit=.045, whine=(11.0, .06)),
}

def engine(rpm, car, seconds=2.0):
    """One seamless loop of a car's engine at a given rev level. A combustion engine is a train of firing pulses (with a small timing and strength wobble so it is
    alive, and an uneven pattern for a burble) shaped in the frequency domain by fixed exhaust resonances (they do not move with the revs, which is what makes it
    sound like a real car), plus intake rasp and a soft saturation for bite. An electric car is a motor whine: a few stacked harmonics with a little inverter shimmer."""
    cfg = CARS[car]; n = int(SR * seconds); t = np.arange(n) / SR; r = np.random.default_rng(int(rpm) + sum(map(ord, car)))
    if cfg.get('electric'):
        f0 = round(rpm / 60 * 11 * seconds) / seconds
        out = np.zeros(n)
        pm = 0.05 * np.sin(2 * np.pi * (3 / seconds) * t)  # a slow shimmer; a whole number of cycles, so the loop stays seamless
        for h, a in [(1, 1), (2, .55), (3, .34), (4, .2), (5, .12), (6, .07)]:
            out += a * np.sin(2 * np.pi * f0 * h * t + h * pm + h)
        out += 0.35 * np.sin(2 * np.pi * round(f0 * 0.5 * seconds) / seconds * t)
        hum = np.fft.irfft(np.fft.rfft(r.standard_normal(n)) * np.exp(-0.5 * ((np.fft.rfftfreq(n, 1 / SR) - 900) / 600) ** 2), n)
        out = out / np.max(np.abs(out)) + 0.05 * hum / np.max(np.abs(hum))
        return signal.lfilter(*signal.butter(1, 45 / (SR / 2), 'high'), np.tanh(1.2 * out))
    cyl = cfg['cyl']; f_fire = rpm / 60 * cyl / 2
    cycles = max(1, round(seconds * f_fire / cyl)); f_fire = cycles * cyl / seconds
    amp = np.array(cfg['amp'])
    train = np.zeros(n)
    for k in range(cycles * cyl):
        pos = (k + r.normal(0, cfg['jit'])) / f_fire * SR
        i0 = int(pos) % n; frac = pos - int(pos)
        a = amp[k % cyl] * (0.94 + 0.12 * r.random())
        train[i0] += a * (1 - frac); train[(i0 + 1) % n] += a * frac
    X = np.fft.rfft(train); f = np.fft.rfftfreq(n, 1 / SR)
    H = 0.05 + 0 * f
    for c, w, g in cfg['res']:
        H = H + g * np.exp(-0.5 * ((f - c) / w) ** 2)
    H = H * (1 / (1 + (f / 5200) ** 4)) * (1 - np.exp(-(f / 70) ** 2))
    out = np.fft.irfft(X * H, n); out /= np.max(np.abs(out))
    N = np.fft.rfft(r.standard_normal(n)) * np.exp(-0.5 * ((f - 1700) / 900) ** 2)
    rasp = np.fft.irfft(N, n); rasp /= np.max(np.abs(rasp))
    env = 0.55 + 0.45 * np.cos(2 * np.pi * f_fire * t)
    out = out + rasp * env * (cfg['rasp'] + 0.14 * min(1, rpm / 8000))
    if cfg['whine']:  # supercharger / turbo whine: a thin tone that rises with the revs
        order, lvl = cfg['whine']; fw = round(rpm / 60 * order * seconds) / seconds
        out = out + lvl * np.sin(2 * np.pi * fw * t) * (0.4 + 0.6 * min(1, rpm / 8000))
    out = np.tanh(1.9 * out / np.max(np.abs(out)))
    return signal.lfilter(*signal.butter(1, 45 / (SR / 2), 'high'), out)

def loopnoise(seconds, filt):
    n = int(SR * seconds); fade = int(SR * 0.25)
    x = filt(rng.standard_normal(n + fade))
    w = np.linspace(0, 1, fade)
    out = x[:n].copy(); out[:fade] = x[:fade] * w + x[n:n + fade] * (1 - w)
    return out

for car in CARS:
    for i, rpm in enumerate([1800, 3200, 5000, 6800, 8600], 1): save(f'engine_{car}_{i}.wav', engine(rpm, car))
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
