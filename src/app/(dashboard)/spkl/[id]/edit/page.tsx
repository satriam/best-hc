'use client';

import React, { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SpklForm } from '@/components/spkl/SpklForm';
import type { SpklDetail } from '@/components/spkl/types';
import { ArrowLeft, Loader2, AlertTriangle } from 'lucide-react';

export default function EditSpklPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [spkl, setSpkl] = useState<SpklDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(`/api/spkl/${id}`);
        const json = await response.json();
        if (!response.ok || !json.success) {
          throw new Error(json.message || 'Gagal memuat SPKL');
        }
        if (!cancelled) setSpkl(json.data as SpklDetail);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat SPKL');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <Card className="p-10 text-center text-sm text-slate-500">
        <span className="inline-flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Memuat SPKL...
        </span>
      </Card>
    );
  }

  if (error || !spkl) {
    return (
      <Card className="p-8 space-y-3">
        <div className="flex items-center gap-2 text-rose-700 font-bold text-sm">
          <AlertTriangle className="w-4 h-4" /> {error || 'SPKL tidak ditemukan'}
        </div>
        <Link href="/spkl">
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4" /> Kembali ke daftar SPKL
          </Button>
        </Link>
      </Card>
    );
  }

  const editable = spkl.status === 'DRAFT' || spkl.status === 'ON_PROGRESS';

  if (!editable) {
    return (
      <Card className="p-8 space-y-3">
        <div className="flex items-center gap-2 text-amber-700 font-bold text-sm">
          <AlertTriangle className="w-4 h-4" /> SPKL {spkl.number} berstatus {spkl.status} dan tidak dapat diubah.
        </div>
        <Link href={`/spkl/${spkl.id}`}>
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4" /> Lihat detail SPKL
          </Button>
        </Link>
      </Card>
    );
  }

  return <SpklForm mode="edit" spklId={spkl.id} initial={spkl} />;
}
