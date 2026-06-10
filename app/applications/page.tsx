'use client';

import { JobSubmitForm } from '../components/applications/JobSubmitForm';
import { ProgressTimeline } from '../components/applications/ProgressTimeline';
import { PageHero } from '../components/PageHero';
import { PageShell } from '../components/PageShell';
import { Card, CardContent } from '@/components/ui/card';

export default function ApplicationsPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="n8n · Job Applications"
        title="Job Application Manager"
        subtitle="Submit a job description and watch the agents research, strategize, and draft your resume and cover letter."
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card className="border-2 border-foreground rounded-2xl">
          <CardContent className="p-6">
            <JobSubmitForm />
          </CardContent>
        </Card>
        <Card className="border-2 border-foreground rounded-2xl">
          <CardContent className="p-6">
            <ProgressTimeline />
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
