'use client';

import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Loader2,
  Maximize2,
  Plus,
  RefreshCw,
  UserPlus,
} from 'lucide-react';
import type { LaporanSigner, LaporanSignerRoleValue } from './types';
import type { SignerSelection } from './wizard-state';
import { apiErrorMessage } from './laporan-ui';
import { SignatureTable, personFromSigner } from './SignatureTable';

interface SignerFormState {
  role: LaporanSignerRoleValue;
  name: string;
  nip: string;
  position: string;
  department: string;
  isDefault: boolean;
  sortOrder: string;
}

const EMPTY_SIGNER_FORM: SignerFormState = {
  role: 'DIBUAT',
  name: '',
  nip: '',
  position: '',
  department: '',
  isDefault: false,
  sortOrder: '0',
};

interface SignersStepProps {
  signers: LaporanSigner[];
  loading: boolean;
  loadError: string | null;
  selection: SignerSelection;
  onChange: (next: SignerSelection) => void;
  onReload: () => Promise<void>;
  isAdmin: boolean;
  /** Tanggal dokumen (ISO `YYYY-MM-DD`) untuk baris "Tanggal:" pada preview. */
  documentDate: string;
  onBack: () => void;
  onNext: () => void;
  onNotify: (type: 'success' | 'error', text: string) => void;
}

/**
 * Langkah 3 — pilih penanda tangan dari master (`GET /api/laporan/signers`).
 *
 * Admin bisa menambah penanda tangan langsung dari modal; user lain hanya bisa
 * memilih dari master (sesuai hak tulis API).
 */
export function SignersStep({
  signers,
  loading,
  loadError,
  selection,
  onChange,
  onReload,
  isAdmin,
  documentDate,
  onBack,
  onNext,
  onNotify,
}: SignersStepProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [previewZoom, setPreviewZoom] = useState(false);
  const [form, setForm] = useState<SignerFormState>(EMPTY_SIGNER_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reloading, setReloading] = useState(false);

  const byRole = useMemo(() => {
    const map: Record<LaporanSignerRoleValue, LaporanSigner[]> = {
      DIBUAT: [],
      DIPERIKSA: [],
      DISETUJUI: [],
    };
    signers
      .filter((signer) => signer.isActive)
      .forEach((signer) => {
        map[signer.role]?.push(signer);
      });
    (Object.keys(map) as LaporanSignerRoleValue[]).forEach((role) => {
      map[role].sort((a, b) => a.sortOrder - b.sortOrder);
    });
    return map;
  }, [signers]);

  const findSigner = (id: string): LaporanSigner | null =>
    signers.find((signer) => signer.id === id) ?? null;

  const handleReload = async () => {
    setReloading(true);
    try {
      await onReload();
    } finally {
      setReloading(false);
    }
  };

  const openAddModal = () => {
    setForm(EMPTY_SIGNER_FORM);
    setFormError(null);
    setModalOpen(true);
  };

  const submitSigner = async () => {
    if (form.name.trim().length < 2) {
      setFormError('Nama penanda tangan wajib diisi (minimal 2 karakter).');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const payload: Record<string, unknown> = {
        role: form.role,
        name: form.name.trim(),
        nip: form.nip.trim() || null,
        position: form.position.trim() || null,
        department: form.department.trim() || null,
        isDefault: form.isDefault,
        isActive: true,
        sortOrder: Number(form.sortOrder) || 0,
      };

      const response = await fetch('/api/laporan/signers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await response.json().catch(() => null);

      if (!response.ok || !json?.success) {
        throw new Error(apiErrorMessage(json, 'Gagal menambahkan penanda tangan'));
      }

      const created = json.data as LaporanSigner | undefined;
      await onReload();
      if (created?.id) {
        const next: SignerSelection = { ...selection };
        if (created.role === 'DIBUAT') next.dibuat = created.id;
        if (created.role === 'DIPERIKSA') next.diperiksa = created.id;
        if (created.role === 'DISETUJUI') next.disetujui = created.id;
        onChange(next);
      }
      setModalOpen(false);
      onNotify('success', `Penanda tangan "${form.name.trim()}" ditambahkan dan dipilih.`);
    } catch (error: unknown) {
      setFormError(error instanceof Error ? error.message : 'Gagal menambahkan penanda tangan');
    } finally {
      setSaving(false);
    }
  };

  const renderSelect = (
    role: LaporanSignerRoleValue,
    value: string,
    onSelect: (id: string) => void,
    id: string,
    label: string,
    helper?: string
  ) => {
    const options = byRole[role];
    return (
      <div>
        <label htmlFor={id} className="block text-xs font-semibold text-slate-700 mb-1.5">
          {label}
        </label>
        <select
          id={id}
          value={value}
          onChange={(event) => onSelect(event.target.value)}
          disabled={loading || options.length === 0}
          className="w-full h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-slate-50 disabled:text-slate-400"
        >
          <option value="">
            {options.length === 0 ? 'Belum ada penanda tangan aktif' : '— Pilih penanda tangan —'}
          </option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
              {option.position ? ` — ${option.position}` : ''}
            </option>
          ))}
        </select>
        {helper && <p className="mt-1 text-[11px] text-slate-500">{helper}</p>}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">Penanda tangan</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Dipakai pada lembar persetujuan dan riwayat revisi dokumen. Kosong berarti memakai penanda
              tangan default dari master.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleReload}
              disabled={reloading || loading}
              className="font-semibold"
            >
              {reloading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              Muat ulang
            </Button>
            {isAdmin && (
              <Button type="button" variant="outline" size="sm" className="font-semibold" onClick={openAddModal}>
                <Plus className="w-3.5 h-3.5" /> Tambah
              </Button>
            )}
          </div>
        </div>

        {loadError && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-semibold flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {loadError}
          </div>
        )}

        {!isAdmin && (
          <p className="text-[11px] text-slate-500">
            Menambah penanda tangan baru hanya bisa dilakukan admin. Hubungi admin bila nama yang dicari
            belum ada.
          </p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {renderSelect('DIBUAT', selection.dibuat, (id) => onChange({ ...selection, dibuat: id }), 'signer-dibuat', 'Dibuat Oleh')}
          {renderSelect(
            'DIPERIKSA',
            selection.diperiksa,
            (id) => onChange({ ...selection, diperiksa: id }),
            'signer-diperiksa',
            'Diperiksa Oleh'
          )}
          {renderSelect(
            'DISETUJUI',
            selection.disetujui,
            (id) => onChange({ ...selection, disetujui: id }),
            'signer-disetujui',
            'Disetujui Oleh',
            'Kolom pertama pada blok persetujuan.'
          )}
          {renderSelect(
            'DISETUJUI',
            selection.disetujui2,
            (id) => onChange({ ...selection, disetujui2: id }),
            'signer-disetujui2',
            'Disetujui Oleh (kolom kedua)',
            'Opsional — mis. Dept Head / pimpinan kedua.'
          )}
        </div>
      </Card>

      <Card className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Pratinjau Lembar Persetujuan (sama dengan dokumen)
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Tabel mengikuti template resmi: 11 baris, kolom Dibuat / Diperiksa / Disetujui.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="font-semibold shrink-0"
            onClick={() => setPreviewZoom(true)}
            data-testid="laporan-preview-zoom"
          >
            <Maximize2 className="w-3.5 h-3.5" /> Perbesar
          </Button>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-2 sm:p-3">
          <SignatureTable
            dibuat={personFromSigner(findSigner(selection.dibuat))}
            diperiksa={personFromSigner(findSigner(selection.diperiksa))}
            disetujui={personFromSigner(findSigner(selection.disetujui))}
            disetujui2={personFromSigner(findSigner(selection.disetujui2))}
            tanggal={documentDate}
          />
        </div>
      </Card>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2">
        <Button type="button" variant="outline" onClick={onBack} className="font-semibold">
          <ArrowLeft className="w-4 h-4" /> Kembali
        </Button>
        <Button type="button" onClick={onNext} className="font-bold">
          Lanjut ke Generate <ArrowRight className="w-4 h-4" />
        </Button>
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Tambah penanda tangan"
        description="Data ini tersimpan di master penanda tangan laporan."
        maxWidth="md"
      >
        <div className="space-y-3">
          <div>
            <label htmlFor="new-signer-role" className="block text-xs font-semibold text-slate-700 mb-1.5">
              Peran <span className="text-rose-600">*</span>
            </label>
            <select
              id="new-signer-role"
              value={form.role}
              onChange={(event) => setForm({ ...form, role: event.target.value as LaporanSignerRoleValue })}
              className="w-full h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="DIBUAT">Dibuat Oleh</option>
              <option value="DIPERIKSA">Diperiksa Oleh</option>
              <option value="DISETUJUI">Disetujui Oleh</option>
            </select>
          </div>

          <Input
            label="Nama *"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="Nama lengkap penanda tangan"
            error={formError ?? undefined}
          />
          <Input
            label="Jabatan"
            value={form.position}
            onChange={(event) => setForm({ ...form, position: event.target.value })}
            placeholder="Application Development Dept Head"
          />
          <Input
            label="Instansi / Unit"
            value={form.department}
            onChange={(event) => setForm({ ...form, department: event.target.value })}
            placeholder="PT Bukit Energi Servis Terpadu"
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="NIP"
              value={form.nip}
              onChange={(event) => setForm({ ...form, nip: event.target.value })}
              placeholder="Opsional"
            />
            <Input
              label="Urutan"
              type="number"
              min={0}
              value={form.sortOrder}
              onChange={(event) => setForm({ ...form, sortOrder: event.target.value })}
            />
          </div>

          <label className="flex items-center gap-2 text-xs font-medium text-slate-700 pt-1">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(event) => setForm({ ...form, isDefault: event.target.checked })}
              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            Jadikan penanda tangan default untuk peran ini
          </label>

          {formError && form.name.trim().length >= 2 && (
            <p className="text-xs text-rose-600">{formError}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => setModalOpen(false)} disabled={saving}>
              Batal
            </Button>
            <Button type="button" size="sm" onClick={submitSigner} disabled={saving} className="font-semibold">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
              {saving ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={previewZoom}
        onClose={() => setPreviewZoom(false)}
        title="Pratinjau Lembar Persetujuan"
        description="Tampilan ini mengikuti tabel pada dokumen .docx resmi."
        maxWidth="4xl"
      >
        <div className="p-1 sm:p-2 bg-white">
          <SignatureTable
            dibuat={personFromSigner(findSigner(selection.dibuat))}
            diperiksa={personFromSigner(findSigner(selection.diperiksa))}
            disetujui={personFromSigner(findSigner(selection.disetujui))}
            disetujui2={personFromSigner(findSigner(selection.disetujui2))}
            tanggal={documentDate}
          />
        </div>
      </Modal>
    </div>
  );
}
