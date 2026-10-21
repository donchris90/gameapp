import { useState } from 'react';
import { ImageBackground, ScrollView, Text, View } from 'react-native';
import { Button, Card, Dim, colors } from '../ui';
import { Image } from 'react-native';
import { StoryLine, StoryNeed } from './storyExtras';
import { NEED_ART } from './storyArt';

const TINT: Record<string, string> = {
  You: '#5eaaff', Tomi: '#f4c542', 'Mara Okafor': '#3ddc97', 'Darius Cole': '#ff6a6a', 'Amara Diallo': '#b58cff',
  'Elena Voss': '#7cc4ff', 'Rafael Costa': '#ff9a5a', 'Victor Sloane': '#ff3d9a', Amadou: '#e8c88a',
};
const tint = (who: string) => TINT[who] ?? colors.x;

/** A short scene: one speaker at a time, tap to move on. The last tap calls onDone. */
export function StoryScene({ kicker, title, place, lines, goLabel, onDone, onSkip, art }: { kicker: string; title: string; place: string; lines: StoryLine[]; goLabel: string; onDone: () => void; onSkip?: () => void; art?: number }) {
  const [i, setI] = useState(0);
  const last = i >= lines.length - 1;
  const line = lines[Math.min(i, lines.length - 1)];
  return (
    <View style={{ flex: 1, backgroundColor: '#070b1c', padding: 20, justifyContent: 'space-between' }}>
      <View style={{ gap: 4, marginTop: 18 }}>
        <Text style={{ color: colors.x, fontSize: 11, fontWeight: '900', letterSpacing: 2 }}>{kicker}</Text>
        <ImageBackground source={art} resizeMode="cover" imageStyle={{ borderRadius: 16 }} style={{ height: 205, justifyContent: 'flex-end', overflow: 'hidden', borderRadius: 16, marginTop: 6, marginBottom: 8, backgroundColor: '#152746' }}>
          <View style={{ backgroundColor: 'rgba(4,8,20,0.72)', padding: 14, gap: 4 }}>
            <Text style={{ color: '#fff', fontSize: 26, fontWeight: '900' }}>{title}</Text>
            <Text style={{ color: colors.gold, fontSize: 10, fontWeight: '900', letterSpacing: 1.5 }}>{place}</Text>
          </View>
        </ImageBackground>
      </View>
      <Card style={{ gap: 10, borderColor: tint(line.who), backgroundColor: '#0f1830' }}>
        <Text style={{ color: tint(line.who), fontSize: 12, fontWeight: '900', letterSpacing: 1.5 }}>{line.who.toUpperCase()}</Text>
        <Text style={{ color: '#fff', fontSize: 18, lineHeight: 26 }}>“{line.line}”</Text>
        <Text style={{ color: '#56668d', fontSize: 10, textAlign: 'right' }}>{Math.min(i + 1, lines.length)} / {lines.length}</Text>
      </Card>
      <View style={{ gap: 8 }}>
        <Button title={last ? goLabel : 'NEXT  →'} onPress={() => (last ? onDone() : setI(i + 1))} />
        {onSkip ? <Button title="BACK" kind="ghost" onPress={onSkip} /> : null}
      </View>
    </View>
  );
}

/** The Europe invitation: shown once when the Africa campaign is complete, and again from the story page. */
export function EuropeInvitation({ coins, onClose }: { coins: number; onClose: () => void }) {
  return (
    <View style={{ flex: 1, backgroundColor: '#070b1c' }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 44, gap: 14 }}>
        <ImageBackground source={require('../../assets/story/africa-campaign.png')} resizeMode="cover" imageStyle={{ borderRadius: 16 }} style={{ height: 190, justifyContent: 'flex-end', overflow: 'hidden', borderRadius: 16, backgroundColor: '#152746' }}>
          <View style={{ backgroundColor: 'rgba(4,8,20,0.72)', padding: 14, gap: 4 }}>
            <Text style={{ color: colors.gold, fontSize: 11, fontWeight: '900', letterSpacing: 2 }}>AFRICA CAMPAIGN COMPLETE</Text>
            <Text style={{ color: '#fff', fontSize: 30, fontWeight: '900' }}>King of the Continent</Text>
          </View>
        </ImageBackground>
        <Dim>From a cracked workshop in Lagos to the champion’s grid in Johannesburg. The notebook, the broker and the trail of stolen telemetry all lead to one name.</Dim>
        <Card style={{ gap: 8, borderColor: '#ff3d9a', backgroundColor: '#1a1030' }}>
          <Text style={{ color: '#ff3d9a', fontSize: 12, fontWeight: '900', letterSpacing: 1.5 }}>VICTOR SLOANE · VANGUARD</Text>
          <Text style={{ color: '#fff', fontSize: 17, lineHeight: 25 }}>“You beat my best drivers on your own continent. Come to Europe and prove it was not luck. The invitation is open.”</Text>
        </Card>
        <Card style={{ gap: 8, borderColor: '#28578b', backgroundColor: '#101b34' }}>
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 17 }}>CHAPTER 3 · EUROPE</Text>
          <Dim>Your invitation is saved. The Europe tour opens in a coming update with new cities, new rivals and the first meeting with Vanguard’s works team.</Dim>
          <Text style={{ color: colors.good, fontWeight: '900', fontSize: 12 }}>✓ INVITATION EARNED  ·  {coins} COINS BANKED</Text>
          <Text style={{ color: colors.dim, fontWeight: '800', fontSize: 11 }}>🔒 EUROPE TOUR · COMING SOON</Text>
        </Card>
        <Button title="CONTINUE" onPress={onClose} />
      </ScrollView>
    </View>
  );
}

/** Before a mission: what the car or the driver still needs, drawn as comic panels. Each can be settled on the spot. */
export function StoryNeeds({ title, needs, done, coins, onSolve, onGo, onBack }: { title: string; needs: StoryNeed[]; done: boolean[]; coins: number; onSolve: (id: string) => void; onGo: () => void; onBack: () => void }) {
  const all = done.every(Boolean);
  return (
    <View style={{ flex: 1, backgroundColor: '#070b1c' }}>
      <ScrollView contentContainerStyle={{ padding: 18, paddingTop: 36, gap: 14 }}>
        <Text style={{ color: colors.x, fontSize: 11, fontWeight: '900', letterSpacing: 2 }}>BEFORE YOU RACE</Text>
        <Text style={{ color: '#fff', fontSize: 26, fontWeight: '900' }}>{title}</Text>
        <Text style={{ color: colors.gold, fontSize: 12, fontWeight: '900' }}>YOUR COINS · {coins.toLocaleString()}</Text>
        {needs.map((n, i) => (
          <View key={n.id} style={{ borderRadius: 14, borderWidth: 3, borderColor: done[i] ? '#2fb36b' : '#1b1226', backgroundColor: '#fff6e0', overflow: 'hidden' }}>
            <Image source={NEED_ART[n.art]} resizeMode="cover" style={{ width: '100%', height: 170 }} />
            <View style={{ padding: 12, gap: 6 }}>
              <Text style={{ color: '#1b1226', fontSize: 17, fontWeight: '900' }}>{n.title}</Text>
              <View style={{ backgroundColor: '#fff', borderWidth: 2, borderColor: '#1b1226', borderRadius: 12, padding: 10 }}>
                <Text style={{ color: '#7a4a00', fontSize: 11, fontWeight: '900', letterSpacing: 1 }}>{n.who.toUpperCase()}</Text>
                <Text style={{ color: '#1b1226', fontSize: 14, lineHeight: 20 }}>“{n.line}”</Text>
              </View>
              {done[i] ? <Text style={{ color: '#1c8a52', fontWeight: '900' }}>✓ DONE</Text> : <Button title={`${n.button}  ·  ${n.price.toLocaleString()} COINS`} disabled={coins < n.price} onPress={() => onSolve(n.id)} />}
              {!done[i] && coins < n.price ? <Text style={{ color: '#a33', fontSize: 11, fontWeight: '800' }}>You need {(n.price - coins).toLocaleString()} more coins. Race a little more to earn them.</Text> : null}
            </View>
          </View>
        ))}
        <Button title={all ? 'TO THE GRID  →' : 'FINISH THESE FIRST'} disabled={!all} onPress={onGo} />
        <Button title="BACK" kind="ghost" onPress={onBack} />
      </ScrollView>
    </View>
  );
}
