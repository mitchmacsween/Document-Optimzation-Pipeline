'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHero } from '../components/PageHero';
import { PageShell } from '../components/PageShell';
import { RecentApplications } from '../components/dashboard/RecentApplications';

export default function DashboardPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="Overview"
        title="Dashboard"
        subtitle="A quick view of your recent job-application conversations."
      />

      <Card>
        <CardHeader>
          <CardTitle>Recent Applications</CardTitle>
        </CardHeader>
        <CardContent>
          <RecentApplications />
        </CardContent>
      </Card>
    </PageShell>
  );
}
