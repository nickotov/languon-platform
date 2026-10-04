import React from 'react'
import { Skeleton } from '../Skeleton'

interface ModelPickerSkeletonProps {
  rows: number
  label: string
}

/** Placeholder rows that match the geometry of real option cards. */
export function ModelPickerSkeleton({ rows, label }: ModelPickerSkeletonProps) {
  return (
    <div aria-busy="true" className="space-y-3">
      <p className="flex items-center gap-2 text-sm text-text-secondary">
        <span
          aria-hidden="true"
          className="radius-full h-2 w-2 animate-pulse bg-primary-default"
        />
        {label}
      </p>
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          aria-hidden="true"
          className="radius-md flex items-start gap-3 border border-border-default bg-background-surface p-4"
        >
          <Skeleton variant="circle" width={20} height={20} />
          <div className="flex-1 space-y-2">
            <Skeleton variant="text" width="35%" height={16} />
            <Skeleton variant="text" width="22%" />
            <Skeleton variant="text" lines={2} lastLineWidth="70%" />
          </div>
        </div>
      ))}
    </div>
  )
}

