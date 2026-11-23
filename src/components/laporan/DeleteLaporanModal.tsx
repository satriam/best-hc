'use client';

import React, { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { apiErrorMessage } from '@/components/laporan/laporan-ui';

interface DeleteLaporanModalProps {
  target: { id: string; title: string; driveLink?: string | null } | null;
  onClose: () => void;
  onDeleted: (id: string) => void;
  onError: (message: string) => void;
}

/** Konfirmasi + eksekusi hapus laporan (`DELETE /api/laporan/:id`). */
export function DeleteLaporanModal({ target, onClose, onDeleted, onError }: DeleteLaporanModalProps) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!target) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/laporan/${target.id}`, { method: 'DELETE' });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) {
        throw new Error(apiErrorMessage(json, 'Gagal menghapus laporan'));
      }
      onDeleted(target.id);
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : 'Gagal menghapus laporan');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal isOpen={target !== null} onClose={deleting ? () => undefined : onClose} title="Hapus laporan?">
      <div className="space-y-4">
        <p className="text-sm text-slate-700">
          Laporan <span className="font-bold">{target?.title}</span> akan dihapus permanen dari sistem.
        </p>
        {target?.driveLink && (
          <p className="text-xs text-slate-500">Arsip di Google Drive tidak ikut terhapus.</p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={deleting}>
            Batal
          </Button>
          <Button variant="danger" size="sm" onClick={handleDelete} disabled={deleting} data-testid="laporan-delete-confirm">
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            Hapus
          </Button>
        </div>
      </div>
    </Modal>
  );
}
