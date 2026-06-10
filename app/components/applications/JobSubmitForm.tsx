'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

export function JobSubmitForm() {
  const [jd, setJd] = useState('');
  const [research, setResearch] = useState(true);
  const [resume, setResume] = useState(true);
  const [cover, setCover] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasToggle = research || resume || cover;
  const canSubmit = jd.trim().length >= 20 && hasToggle && !submitting;

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jd,
          toggles: { research, resume, cover },
          sessionId: crypto.randomUUID(),
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? 'Submit failed');
      }
      setJd('');
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'Submit failed'
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="jd">Job description</Label>
        <textarea
          id="jd"
          value={jd}
          onChange={(event) => setJd(event.target.value)}
          rows={8}
          placeholder="Paste the full job description…"
          className="rounded-2xl border-2 border-foreground bg-background p-3 text-foreground"
        />
      </div>

      <fieldset className="flex flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <Checkbox
            id="toggle-research"
            checked={research}
            onCheckedChange={(v) => setResearch(v === true)}
          />
          <Label htmlFor="toggle-research">Research</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="toggle-resume"
            checked={resume}
            onCheckedChange={(v) => setResume(v === true)}
          />
          <Label htmlFor="toggle-resume">Resume</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="toggle-cover"
            checked={cover}
            onCheckedChange={(v) => setCover(v === true)}
          />
          <Label htmlFor="toggle-cover">Cover letter</Label>
        </div>
      </fieldset>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button onClick={handleSubmit} disabled={!canSubmit}>
        {submitting ? 'Submitting…' : 'Generate strategy'}
      </Button>
    </div>
  );
}
