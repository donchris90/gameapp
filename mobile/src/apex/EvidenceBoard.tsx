import { ScrollView, Text, View } from 'react-native';
import { Button, Card, Dim, colors } from '../ui';
import { evidenceList } from './evidence';

/** The case board: everything Tomi has found about his father, newest first. */
export function EvidenceBoard({ ids, trust, onClose }: { ids: string[]; trust: number; onClose: () => void }) {
  const items = evidenceList(ids).reverse();
  return <View style={{ flex: 1, backgroundColor: '#0b1020' }}>
    <ScrollView contentContainerStyle={{ padding: 18, paddingTop: 44, gap: 10 }}>
      <Text style={{ color: colors.gold, fontSize: 11, fontWeight: '900', letterSpacing: 2 }}>THE CASE · TOMI’S FATHER</Text>
      <Text style={{ color: '#fff', fontSize: 24, fontWeight: '900' }}>{items.length} piece{items.length === 1 ? '' : 's'} of evidence</Text>
      <Dim>Crew trust {trust}/100. Finish missions to find more. Clues from investigations only count when the job is won.</Dim>
      {items.length === 0 ? <Card><Dim>Nothing yet. Finish the story missions to find the first clue.</Dim></Card> : null}
      {items.map((e) => <Card key={e.id} style={{ gap: 4, borderColor: e.kind === 'clue' ? '#b98237' : '#28578b' }}>
        <Text style={{ color: e.kind === 'clue' ? '#ffd17d' : '#7fd0ff', fontSize: 9, fontWeight: '900', letterSpacing: 1.4 }}>{e.kind === 'clue' ? 'CLUE' : 'RECORD'} · {e.region}</Text>
        <Text style={{ color: '#fff', fontSize: 15, fontWeight: '900' }}>{e.title}</Text>
        <Dim>{e.text}</Dim>
      </Card>)}
      <Button title="BACK" onPress={onClose} />
    </ScrollView>
  </View>;
}
