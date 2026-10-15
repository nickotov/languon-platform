import React from 'react'
import { CheckIcon, FilePenLineIcon, PencilLineIcon } from 'lucide-react'
import { Badge } from '../Badge'
import type { TextStatus } from '../../types/texts'

export function TextStatusBadge({ status, size = 'sm' }: { status: TextStatus; size?: 'sm' | 'md' }) {
  if (status === 'draft') {
    return (
      <Badge tone="neutral" size={size} icon={<FilePenLineIcon />}>
        Draft
      </Badge>
    )
  }
  if (status === 'edited') {
    return (
      <Badge tone="warning" size={size} icon={<PencilLineIcon />}>
        Edited after translation
      </Badge>
    )
  }
  return (
    <Badge tone="success" size={size} icon={<CheckIcon />}>
      Translated
    </Badge>
  )
}
