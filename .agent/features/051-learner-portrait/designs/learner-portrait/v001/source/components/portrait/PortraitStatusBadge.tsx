import React from 'react';
import { CircleCheckIcon, CircleDashedIcon, CirclePauseIcon, HourglassIcon } from 'lucide-react';
import { Badge } from '../Badge';
import type { Interview, SavedPortrait } from '../../types/portrait';

export type PortraitStatus = 'none' | 'interview' | 'saved-off' | 'in-use';

export function getPortraitStatus(portrait: SavedPortrait | null, interview: Interview | null): PortraitStatus {
  if (portrait) return portrait.useEnabled ? 'in-use' : 'saved-off';
  if (interview) return 'interview';
  return 'none';
}

export function PortraitStatusBadge({ status }: { status: PortraitStatus }) {
  switch (status) {
    case 'in-use':
      return (
        <Badge tone="success" icon={<CircleCheckIcon />}>
          In use
        </Badge>
      );
    case 'saved-off':
      return (
        <Badge tone="neutral" icon={<CirclePauseIcon />}>
          Saved · Not used in chats
        </Badge>
      );
    case 'interview':
      return (
        <Badge tone="info" icon={<HourglassIcon />}>
          Draft in progress
        </Badge>
      );
    default:
      return (
        <Badge tone="neutral" icon={<CircleDashedIcon />}>
          Not created
        </Badge>
      );
  }
}

