import type { Metadata } from 'next';
import { PageShell } from '../components/PageShell';
import { PageHero } from '../components/PageHero';
import { UserSummaryCard } from './components/UserSummaryCard';
import { GraphSearchExplorer } from './components/GraphSearchExplorer';

export const metadata: Metadata = {
  title: 'Your Long-term Memory',
  description:
    'Explore the long-term memory Zep keeps about you — your rolling summary and a live search over your personal knowledge graph.',
};

export default function MemoryPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="Long-term Memory"
        title={
          <>
            What the AI{' '}
            <span className="font-serif font-normal italic text-primary">
              remembers
            </span>{' '}
            about you.
          </>
        }
        subtitle="Your rolling summary and a live search over your personal knowledge graph. Chat a few times first so there's something to find."
      />

      <section className="space-y-6">
        <UserSummaryCard />
        <GraphSearchExplorer />
      </section>
    </PageShell>
  );
}
