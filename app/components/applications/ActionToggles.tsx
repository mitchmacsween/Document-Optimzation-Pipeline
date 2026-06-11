'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { Toggles } from '@/lib/applications/schema';

interface ActionTogglesProps {
  toggles: Toggles;
  onChange: (next: Toggles) => void;
}

export function ActionToggles({ toggles, onChange }: ActionTogglesProps) {
  return (
    <div className="flex items-center gap-6">
      <div className="flex items-center gap-2">
        <Checkbox
          id="toggle-research"
          checked={toggles.research}
          onCheckedChange={(v) =>
            onChange({ ...toggles, research: v === true })
          }
        />
        <Label htmlFor="toggle-research">Research</Label>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="toggle-resume"
          checked={toggles.resume}
          onCheckedChange={(v) => onChange({ ...toggles, resume: v === true })}
        />
        <Label htmlFor="toggle-resume">Resume</Label>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="toggle-cover"
          checked={toggles.cover}
          onCheckedChange={(v) => onChange({ ...toggles, cover: v === true })}
        />
        <Label htmlFor="toggle-cover">Cover letter</Label>
      </div>
    </div>
  );
}
