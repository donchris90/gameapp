import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { CarPreview, PreviewView } from './CarPreview';
import { CarStyle, FINISHES, GLOWS, LAMPS, RIM_DESIGNS, SWATCHES, TINTS } from './style';
import { Button, Card, Dim, H1, colors } from '../ui';

type Tab = 'paint' | 'wheels' | 'stance' | 'glass';
const TABS: Array<{ id: Tab; label: string }> = [{ id: 'paint', label: 'PAINT' }, { id: 'wheels', label: 'WHEELS' }, { id: 'stance', label: 'STANCE' }, { id: 'glass', label: 'GLASS & LIGHTS' }];
const VIEWS: Array<{ id: PreviewView; label: string }> = [{ id: 'spin', label: '3/4' }, { id: 'front', label: 'FRONT' }, { id: 'side', label: 'SIDE' }, { id: 'rear', label: 'REAR' }, { id: 'top', label: 'TOP' }];
const RIDE = ['Lowest', 'Low', 'Stock', 'High', 'Highest'];
const BODY_KITS = [{ tier: 0, title: 'STREET', sub: 'Stock body' }, { tier: 1, title: 'SPORT', sub: 'Splitter + skirts' }, { tier: 2, title: 'GT', sub: 'Diffuser + canards' }, { tier: 3, title: 'FLAGSHIP', sub: 'Accent + aero wing' }];
const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

function Pill({ on, label, sub, onPress }: { on: boolean; label: string; sub?: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, backgroundColor: on ? '#1b3766' : colors.card, borderWidth: 1, borderColor: on ? '#5eaaff' : colors.line }}>
    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>{label}</Text>
    {sub ? <Text style={{ color: colors.dim, fontSize: 10, marginTop: 2 }}>{sub}</Text> : null}
  </Pressable>;
}
function Swatches({ list, value, onPick }: { list: ReadonlyArray<{ name: string; hex: number }>; value: number; onPick: (hexValue: number) => void }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{list.map((p) => {
    const on = value === p.hex;
    return <Pressable key={p.name} onPress={() => onPick(p.hex)} accessibilityLabel={p.name} style={{ alignItems: 'center', width: 54 }}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: p.hex === 0 ? '#0e1529' : hex(p.hex), borderWidth: on ? 3 : 1, borderColor: on ? '#5eaaff' : '#aab5cf', alignItems: 'center', justifyContent: 'center' }}>{p.hex === 0 ? <Text style={{ color: '#aab5cf', fontSize: 11 }}>off</Text> : null}</View>
      <Text numberOfLines={1} style={{ color: on ? '#fff' : colors.dim, fontSize: 9, marginTop: 4, fontWeight: '700' }}>{p.name}</Text>
    </Pressable>;
  })}</View>;
}
const Label = ({ children }: { children: string }) => <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15, marginTop: 16, marginBottom: 8 }}>{children}</Text>;

/** The workshop's paint and look studio: a 3D car you can turn and zoom, with its colours, finish, rims, stance, glass and lights. Everything here is visual only. */
export function Studio({ carName, carId, style, setStyle, upgrades, bodyTier, setBodyTier, onBack }: {
  carName: string; carId: string; style: CarStyle; setStyle: (patch: Partial<CarStyle>) => void; upgrades: number[]; bodyTier: number; setBodyTier: (n: number) => void; onBack: () => void;
}) {
  const [tab, setTab] = useState<Tab>('paint');
  const [view, setView] = useState<PreviewView>('spin');
  const [zoom, setZoom] = useState(1);
  return <>
    <Text style={{ color: colors.x, fontSize: 11, fontWeight: '900', letterSpacing: 2 }}>WORKSHOP</Text><H1>Paint studio</H1>
    <Dim>Everything you change shows on the 3D car and in your races. Drag the car to turn it.</Dim>
    <View style={{ marginTop: 12, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: '#28578b' }}>
      <CarPreview carId={carId} color={style.paint} style={style} upgrades={upgrades} tier={bodyTier} height={250} view={view} zoom={zoom} />
      <View style={{ position: 'absolute', right: 8, bottom: 8, flexDirection: 'row', gap: 6 }}>
        {[{ l: '−', d: 0.15 }, { l: '+', d: -0.15 }].map((z) => <Pressable key={z.l} onPress={() => setZoom((v) => Math.max(0.5, Math.min(1.6, v + z.d)))} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#000a', borderWidth: 1, borderColor: '#5eaaff', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 18, fontWeight: '900' }}>{z.l}</Text></Pressable>)}
      </View>
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }} contentContainerStyle={{ gap: 6 }}>
      {VIEWS.map((v) => <Pill key={v.id} on={view === v.id} label={v.label} onPress={() => setView(v.id)} />)}
    </ScrollView>
    <Card style={{ marginTop: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderColor: '#28578b', backgroundColor: '#101b34' }}>
      <Text style={{ color: '#fff', fontWeight: '900', fontSize: 18 }}>{carName}</Text>
      <Text style={{ color: colors.dim, fontSize: 11 }}>{FINISHES[style.finish].name} · {RIM_DESIGNS[style.rimDesign].name} rims</Text>
    </Card>

    <View style={{ flexDirection: 'row', gap: 4, marginTop: 14, padding: 4, borderRadius: 14, backgroundColor: '#0e1529', borderWidth: 1, borderColor: colors.line }}>
      {TABS.map((t) => <Pressable key={t.id} onPress={() => setTab(t.id)} style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center', backgroundColor: tab === t.id ? '#245fff' : 'transparent' }}><Text style={{ color: '#fff', fontWeight: '900', fontSize: 9.5, letterSpacing: 0.5 }}>{t.label}</Text></Pressable>)}
    </View>

    {tab === 'paint' ? <>
      <Label>FINISH</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{FINISHES.map((f, i) => <Pill key={f.id} on={style.finish === i} label={f.name} sub={f.note} onPress={() => setStyle({ finish: i })} />)}</View>
      <Label>BODY COLOUR</Label>
      <Swatches list={SWATCHES} value={style.paint} onPick={(h) => setStyle({ paint: h })} />
    </> : null}

    {tab === 'wheels' ? <>
      <Label>RIM DESIGN</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{RIM_DESIGNS.map((r, i) => <Pill key={r.name} on={style.rimDesign === i} label={r.name} sub={r.note} onPress={() => setStyle({ rimDesign: i })} />)}</View>
      <Label>RIM COLOUR</Label>
      {style.rimDesign === 0 ? <Dim>Pick a rim design above to choose its colour. “Stock” keeps the car’s own rims.</Dim> : <Swatches list={[{ name: 'Chrome', hex: 0xd9dee8 }, { name: 'Black', hex: 0x15181d }, { name: 'Gold', hex: 0xf0b429 }, { name: 'Bronze', hex: 0x9a6a3a }, ...SWATCHES]} value={style.rim} onPick={(h) => setStyle({ rim: h })} />}
      <Label>BRAKE CALIPERS</Label>
      <Swatches list={[{ name: 'Red', hex: 0xff3b30 }, { name: 'Yellow', hex: 0xffd400 }, { name: 'Blue', hex: 0x2788ff }, { name: 'Orange', hex: 0xff7a1a }, { name: 'Green', hex: 0x2ee66e }, { name: 'Violet', hex: 0x8a5cff }, { name: 'White', hex: 0xf2f4f8 }]} value={style.caliper} onPick={(h) => setStyle({ caliper: h })} />
      {style.rimDesign === 0 ? <Dim style={{ marginTop: 6 }}>Calipers show through the spokes of the designs above.</Dim> : null}
    </> : null}

    {tab === 'stance' ? <>
      <Label>RIDE HEIGHT</Label>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable disabled={style.ride <= -2} onPress={() => setStyle({ ride: style.ride - 1 })} style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, opacity: style.ride <= -2 ? 0.4 : 1 }}><Text style={{ color: '#fff', fontSize: 22, fontWeight: '900' }}>−</Text></Pressable>
        <View style={{ flex: 1, flexDirection: 'row', gap: 4 }}>{[-2, -1, 0, 1, 2].map((r) => <View key={r} style={{ flex: 1, height: 10, borderRadius: 5, backgroundColor: r === style.ride ? '#5eaaff' : '#1b2a4a' }} />)}</View>
        <Pressable disabled={style.ride >= 2} onPress={() => setStyle({ ride: style.ride + 1 })} style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, opacity: style.ride >= 2 ? 0.4 : 1 }}><Text style={{ color: '#fff', fontSize: 22, fontWeight: '900' }}>+</Text></Pressable>
      </View>
      <Text style={{ color: colors.x, fontWeight: '800', textAlign: 'center', marginTop: 8 }}>{RIDE[style.ride + 2].toUpperCase()}</Text>
      <Dim style={{ marginTop: 4 }}>Look only for now: it does not change how the car drives yet.</Dim>
      <Label>BODY KIT</Label>
      <Dim>Each tier adds visible aero parts to the 3D car and your race car.</Dim>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
        {BODY_KITS.map((kit) => <Pressable key={kit.tier} onPress={() => setBodyTier(kit.tier)} style={{ flex: 1, padding: 9, borderRadius: 12, backgroundColor: bodyTier === kit.tier ? '#1b3766' : colors.card, borderWidth: 1, borderColor: bodyTier === kit.tier ? '#5eaaff' : colors.line }}><Text style={{ color: '#fff', fontWeight: '900', fontSize: 11 }}>{kit.title}</Text><Text style={{ color: colors.dim, fontSize: 9, marginTop: 3 }}>{kit.sub}</Text></Pressable>)}
      </View>
    </> : null}

    {tab === 'glass' ? <>
      <Label>WINDOW TINT</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{TINTS.map((t, i) => <Pill key={t.name} on={style.tint === i} label={t.name} onPress={() => setStyle({ tint: i })} />)}</View>
      <Label>HEADLIGHTS</Label>
      <Swatches list={LAMPS} value={LAMPS[style.lamp].hex} onPick={(h) => setStyle({ lamp: Math.max(0, LAMPS.findIndex((l) => l.hex === h)) })} />
      <Label>UNDERGLOW</Label>
      <Swatches list={GLOWS} value={style.glow} onPick={(h) => setStyle({ glow: h })} />
      <Dim style={{ marginTop: 6 }}>With underglow “off” the car still glows when its upgrades earn it.</Dim>
    </> : null}

    <Button title="BACK TO GARAGE" kind="ghost" onPress={onBack} style={{ marginTop: 18 }} />
  </>;
}
