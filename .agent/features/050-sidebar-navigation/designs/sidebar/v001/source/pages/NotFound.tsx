import React from 'react'
import { Link } from 'react-router-dom'

export function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <p className="text-base font-medium text-text-primary">This item no longer exists</p>
      <Link to="/" className="text-sm text-primary-default hover:underline">Back to Home</Link>
    </div>
  )
}

