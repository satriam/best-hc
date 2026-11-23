'use client';

import React from 'react';
import { LaporanWizard } from './LaporanWizard';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { apiErrorMessage } from './laporan-ui';
import type { LaporanDetail } from './types';
import { AlertTriangle, Loader2 } from 'lucide-react';

/**
 * Memuat laporan tersimpan lalu menyerahkannya ke wizard mode edit.
 * Wizard butuh payload lengkap (`meta`), jadi pemuatan dilakukan di client.
 */
export function LaporanEditLoader({ id, isAdmin }: { id: string; isAdmin: boolean }) {
  const [detail, setDetail] = React.useState<LaporanDetail | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [reloadToken, setReloadToken] = React.useState(0);

  React.useEffect(() => {
    let active = true;

    fetch(`/api/laporan/${id}`, { cache: 'no-store' })
      .then(async (response) => {
        const json = await response.json().catch(() => null);
        if (!response.ok || !json?.success) {
          throw new Error(apiErrorMessage(json, 'Gagal memuat laporan'));
        }
        return json.data as LaporanDetail;
      })
      .then((data) => {
        if (!active) return;
        setDetail(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Gagal memuat laporan');
      });

    return () => {
      active = false;
    };
  }, [id, reloadToken]);

  if (error) {
    return (
      <Card className="border-rose-200 bg-rose-50 space-y-3">
        <p className="text-xs font-semibold text-rose-800 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
        </p>
        <Button variant="outline" size="sm" onClick={() => setReloadToken((token) => token + 1)}>
          Coba lagi
        </Button>
      </Card>
    );
  }

  if (!detail) {
    return (
      <Card className="text-center py-10 text-slate-400">
        <span className="inline-flex items-center gap-2 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Memuat laporan untuk diedit...
        </span>
      </Card>
    );
  }

  return <LaporanWizard isAdmin={isAdmin} laporanId={id} initialDetail={detail} />;
}
