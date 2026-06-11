'use client';

import { Check, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ApprovalActionsProps {
  onApprove: () => void;
  onRequestChanges: () => void;
  disabled?: boolean;
}

export function ApprovalActions({
  onApprove,
  onRequestChanges,
  disabled = false,
}: ApprovalActionsProps) {
  return (
    <div className="flex items-center gap-2">
      <Button onClick={onApprove} disabled={disabled}>
        <Check />
        Approve &amp; generate
      </Button>

      <Button variant="outline" onClick={onRequestChanges} disabled={disabled}>
        <RotateCcw />
        Request changes
      </Button>
    </div>
  );
}
