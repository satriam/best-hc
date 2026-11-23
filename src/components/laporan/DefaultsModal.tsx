'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Loader2, Save } from 'lucide-react';
import type { LaporanDefaults } from './defaults';
import { normalizeDefaults } from './defaults';

/**
 * Modal "Ubah default" — mengedit nilai yang dipakai untuk mem-prefill wizard
 * laporan berikutnya. Disimpan lewat `PUT /api/laporan/defaults`.
 */
export function DefaultsModal({
  isOpen,
  defaults,
  saving,
  onClose,
  onSave,
}: {
  isOpen: boolean;
  defaults: LaporanDefaults;
  saving: boolean;
  onClose: () => void;
  onSave: (next: LaporanDefaults) => void;
}) {
  const [draft, setDraft] = useState<LaporanDefaults>(defaults);
  const [error, setError] = useState<string | null>(null);

  // Modal hanya dirender saat terbuka (lihat LaporanWizard), sehingga
  // `useState(defaults)` sudah memberi nilai awal yang benar tanpa effect.

  const submit = () => {
    if (draft.project.trim().length < 3) {
      setError('Nama proyek wajib diisi (minimal 3 karakter).');
      return;
    }
    if (draft.coverTitle.trim().length < 3) {
      setError('Judul cover wajib diisi (minimal 3 karakter).');
      return;
    }
    if (draft.title.trim().length < 3) {
      setError('Judul dokumen wajib diisi (minimal 3 karakter).');
      return;
    }
    onSave(normalizeDefaults(draft));
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Ubah default laporan"
      description="Nilai ini dipakai untuk mengisi otomatis wizard laporan periode berikutnya."
      maxWidth="lg"
    >
      <div className="space-y-3">
        <Input
          label="Nama Proyek *"
          value={draft.project}
          onChange={(event) => setDraft({ ...draft, project: event.target.value })}
        />
        <Input
          label="Judul Cover *"
          value={draft.coverTitle}
          onChange={(event) => setDraft({ ...draft, coverTitle: event.target.value })}
        />
        <Input
          label="Judul Dokumen *"
          value={draft.title}
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="No Dokumen"
            value={draft.docNo}
            onChange={(event) => setDraft({ ...draft, docNo: event.target.value })}
          />
          <Input
            label="Nomor SPPH"
            value={draft.spphNo}
            onChange={(event) => setDraft({ ...draft, spphNo: event.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Versi"
            value={draft.version}
            onChange={(event) => setDraft({ ...draft, version: event.target.value })}
          />
          <Input
            label="Label periode saran"
            value={draft.suggestedPeriod}
            onChange={(event) => setDraft({ ...draft, suggestedPeriod: event.target.value })}
            placeholder="04 Oktober - 03 November 2026"
          />
        </div>

        {error && <p className="text-xs text-rose-600 font-semibold">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Batal
          </Button>
          <Button type="button" size="sm" className="font-semibold" onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? 'Menyimpan...' : 'Simpan default'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
