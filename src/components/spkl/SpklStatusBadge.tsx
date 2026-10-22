'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { SPKL_STATUS_CLASS, SPKL_STATUS_LABEL } from './spkl-ui';
import type { SpklStatusValue } from './types';

/** Badge status SPKL dengan label Bahasa Indonesia. */
export function SpklStatusBadge({
  status,
  className,
}: {
  status: SpklStatusValue;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border whitespace-nowrap',
        SPKL_STATUS_CLASS[status],
        className
      )}
    >
      {SPKL_STATUS_LABEL[status]}
    </span>
  );
}
