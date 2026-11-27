'use client';

import React, { useCallback, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileText,
  Info,
  Loader2,
  Plus,
  Settings2,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { effectivePeriodLabel, type MetaDraft } from './wizard-state';
import { ApprovalPreview, CoverPreview } from './CoverPreview';
import { formatBytes } from './laporan-ui';

const MAX_TOTAL_BYTES = 10 * 1024 * 1024;

export interface ParsedDocSummary {
  fileName: string;
  modules: number;
  items: number;
  captions: number;
  picturesSkipped: number;
}

interface UploadStepProps {
  files: File[];
  onFilesChange: (files: File[]) => void;
  meta: MetaDraft;
  onMetaChange: (patch: Partial<MetaDraft>) => void;
  metaErrors: Partial<Record<keyof MetaDraft, string>>;
  parsing: boolean;
  parseError: string | null;
  parsedDocs: ParsedDocSummary[];
  parseSummary: { files: number; modules: number; items: number } | null;
  onParse: () => void;
  onNext: () => void;
  canNext: boolean;
  imagesDropped: boolean;
  /** true = default dari server tersedia (semua field terisi otomatis). */
  defaultsAvailable: boolean;
  defaultsLoading: boolean;
  onEditDefaults: () => void;
}

/** Label kecil untuk menjelaskan asal nilai sebuah field. */
function FieldHint({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'warn' }) {
  return (
    <p
      className={
        tone === 'warn'
          ? 'mt-1 text-[10px] font-semibold text-amber-700'
          : 'mt-1 text-[10px] text-slate-500'
      }
    >
      {children}
    </p>
  );
}

/** Naikkan angka di belakang string: `SPPH 6557` → `SPPH 6558`. */
function incrementTrailingNumber(value: string): string {
  const match = value.match(/^(.*?)(\d+)(\D*)$/);
  if (!match) return value;
  const [, prefix, digits, suffix] = match;
  const next = String(Number(digits) + 1).padStart(digits.length, '0');
  return `${prefix}${next}${suffix}`;
}

/**
 * Langkah 1 — unggah .docx (opsional) + identitas dokumen.
 *
 * Nilai awal sudah terisi dari `GET /api/laporan/defaults`; user biasanya
 * hanya mengubah Nomor SPPH dan periode. `POST /api/laporan/parse` mengisi
 * ulang field dari dokumen sumber bila file diunggah.
 */
export function UploadStep({
  files,
  onFilesChange,
  meta,
  onMetaChange,
  metaErrors,
  parsing,
  parseError,
  parsedDocs,
  parseSummary,
  onParse,
  onNext,
  canNext,
  imagesDropped,
  defaultsAvailable,
  defaultsLoading,
  onEditDefaults,
}: UploadStepProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      const candidates = Array.from(incoming);
      const rejected = candidates.filter((file) => !file.name.toLowerCase().endsWith('.docx'));
      if (rejected.length > 0) {
        setFileError(`Hanya file .docx yang didukung (ditolak: ${rejected.map((f) => f.name).join(', ')}).`);
      } else {
        setFileError(null);
      }

      const accepted = candidates.filter((file) => file.name.toLowerCase().endsWith('.docx'));
      const merged = [...files, ...accepted];
      const totalBytes = merged.reduce((sum, file) => sum + file.size, 0);
      if (totalBytes > MAX_TOTAL_BYTES) {
        setFileError('Total ukuran file melebihi 10 MB. Hapus beberapa file lalu coba lagi.');
        return;
      }
      onFilesChange(merged);
    },
    [files, onFilesChange]
  );

  const removeFile = (index: number) => {
    onFilesChange(files.filter((_, current) => current !== index));
    setFileError(null);
  };

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const periodLabel = effectivePeriodLabel(meta);

  return (
    <div className="space-y-4">
      {!defaultsAvailable && !defaultsLoading && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-medium flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          Default belum tersedia, isi manual. Setelah laporan pertama dibuat, pengaturan akan tersimpan
          otomatis untuk periode berikutnya.
        </div>
      )}

      <Card className="space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-4 h-4 text-indigo-600" /> Unggah dokumen sumber (opsional)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Punya .docx laporan periode lalu? Unggah untuk mengambil modul, caption gambar, dan identitas
            dokumen otomatis. Tanpa file, wizard tetap bisa dipakai dengan isian default.
          </p>
        </div>

        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragActive(false);
            if (event.dataTransfer.files.length > 0) addFiles(event.dataTransfer.files);
          }}
          className={`rounded-2xl border-2 border-dashed p-6 md:p-8 text-center transition-colors ${
            dragActive ? 'border-indigo-400 bg-indigo-50/60' : 'border-slate-300 bg-slate-50/60'
          }`}
          data-testid="laporan-dropzone"
        >
          <input
            ref={inputRef}
            type="file"
            accept=".docx"
            multiple
            className="sr-only"
            aria-label="Pilih file .docx"
            onChange={(event) => {
              if (event.target.files && event.target.files.length > 0) addFiles(event.target.files);
              event.target.value = '';
            }}
          />
          <span className="mx-auto w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
            <UploadCloud className="w-6 h-6" />
          </span>
          <p className="mt-3 text-sm font-bold text-slate-800">Tarik & lepas file .docx di sini</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Maksimal total 10 MB untuk semua file.</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3 font-semibold"
            onClick={() => inputRef.current?.click()}
          >
            Pilih file .docx
          </Button>
        </div>

        {fileError && (
          <p className="text-xs font-semibold text-rose-600 flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {fileError}
          </p>
        )}

        {files.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {files.length} file dipilih — {formatBytes(totalBytes)}
              </p>
              <button
                type="button"
                onClick={() => onFilesChange([])}
                className="text-[11px] font-semibold text-slate-500 hover:text-rose-600 transition-colors"
              >
                Hapus semua
              </button>
            </div>
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
              {files.map((file, index) => (
                <li key={`${file.name}-${index}`} className="flex items-center gap-3 px-3 py-2">
                  <FileText className="w-4 h-4 text-indigo-500 shrink-0" />
                  <span className="flex-1 min-w-0 text-xs font-medium text-slate-800 truncate">
                    {file.name}
                  </span>
                  <span className="text-[11px] text-slate-500 whitespace-nowrap">{formatBytes(file.size)}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(index)}
                    aria-label={`Hapus ${file.name}`}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={onParse}
            disabled={files.length === 0 || parsing}
            className="font-semibold"
          >
            {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            {parsing ? 'Memproses dokumen...' : 'Proses dokumen'}
          </Button>
          {parseSummary && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {parseSummary.files} file · {parseSummary.modules} modul · {parseSummary.items} item
            </span>
          )}
        </div>

        {parseError && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-semibold">
            {parseError}
          </div>
        )}

        {imagesDropped && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium">
            Gambar lampiran terlalu besar untuk disimpan di sessionStorage. Pada sesi ini gambar{' '}
            <span className="font-bold">tetap ikut ke lampiran dokumen</span>; setelah halaman dimuat ulang,
            unggah ulang file .docx untuk memulihkan gambar.
          </div>
        )}

        {parsedDocs.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[520px] text-left text-[11px] text-slate-600">
              <thead className="bg-slate-50 text-slate-600 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="px-3 py-2">File</th>
                  <th className="px-3 py-2 text-center">Modul</th>
                  <th className="px-3 py-2 text-center">Item</th>
                  <th className="px-3 py-2 text-center">Caption</th>
                  <th className="px-3 py-2 text-center">Gambar dilewati</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {parsedDocs.map((doc) => (
                  <tr key={doc.fileName}>
                    <td className="px-3 py-2 font-medium text-slate-800">{doc.fileName}</td>
                    <td className="px-3 py-2 text-center font-bold text-slate-900">{doc.modules}</td>
                    <td className="px-3 py-2 text-center font-bold text-slate-900">{doc.items}</td>
                    <td className="px-3 py-2 text-center">{doc.captions}</td>
                    <td className="px-3 py-2 text-center text-slate-500">{doc.picturesSkipped}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900">Identitas laporan</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Field bertanda <span className="text-rose-600 font-bold">*</span> wajib. Nilai sudah terisi
              dari default — biasanya hanya <span className="font-semibold">Nomor SPPH</span> dan{' '}
              <span className="font-semibold">Periode</span> yang berubah tiap bulan.
            </p>
          </div>
          <button
            type="button"
            onClick={onEditDefaults}
            className="inline-flex items-center gap-1.5 shrink-0 text-[11px] font-semibold text-indigo-700 hover:text-indigo-900"
          >
            <Settings2 className="w-3.5 h-3.5" /> Ubah default
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Input
              label="Nama Proyek *"
              value={meta.project}
              onChange={(event) => onMetaChange({ project: event.target.value })}
              placeholder="Pekerjaan Jasa Joint Development"
              error={metaErrors.project}
              data-testid="laporan-meta-project"
            />
            <FieldHint>{defaultsLoading ? 'memuat default…' : 'otomatis dari default'}</FieldHint>
          </div>

          <div>
            <label
              htmlFor="laporan-meta-spph"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Nomor SPPH
            </label>
            <div className="flex items-center gap-1.5">
              <input
                id="laporan-meta-spph"
                value={meta.spphNo}
                onChange={(event) => onMetaChange({ spphNo: event.target.value })}
                placeholder="SPPH 6557"
                data-testid="laporan-meta-spph"
                className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              <button
                type="button"
                onClick={() => onMetaChange({ spphNo: incrementTrailingNumber(meta.spphNo) })}
                title="Naikkan nomor SPPH satu angka"
                aria-label="Naikkan nomor SPPH"
                className="shrink-0 h-10 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Plus className="w-3.5 h-3.5 inline" />1
              </button>
            </div>
            <FieldHint tone="warn">biasanya berubah tiap periode</FieldHint>
          </div>

          <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="laporan-meta-start"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Periode mulai <span className="text-rose-600">*</span>
              </label>
              <input
                id="laporan-meta-start"
                type="date"
                value={meta.periodStart}
                onChange={(event) => onMetaChange({ periodStart: event.target.value })}
                className={`flex h-10 w-full rounded-lg border bg-white px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                  metaErrors.periodStart ? 'border-rose-500' : 'border-slate-300'
                }`}
                data-testid="laporan-meta-period-start"
              />
              {metaErrors.periodStart && (
                <p className="mt-1 text-xs text-rose-600">{metaErrors.periodStart}</p>
              )}
              <FieldHint tone="warn">biasanya berubah tiap periode</FieldHint>
            </div>
            <div>
              <label htmlFor="laporan-meta-end" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Periode selesai <span className="text-rose-600">*</span>
              </label>
              <input
                id="laporan-meta-end"
                type="date"
                value={meta.periodEnd}
                onChange={(event) => onMetaChange({ periodEnd: event.target.value })}
                className={`flex h-10 w-full rounded-lg border bg-white px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                  metaErrors.periodEnd ? 'border-rose-500' : 'border-slate-300'
                }`}
                data-testid="laporan-meta-period-end"
              />
              {metaErrors.periodEnd && <p className="mt-1 text-xs text-rose-600">{metaErrors.periodEnd}</p>}
              <FieldHint tone="warn">biasanya berubah tiap periode</FieldHint>
            </div>
          </div>

          <div className="md:col-span-2 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Periode pada dokumen
              </p>
              {!meta.periodLabelManual ? (
                <button
                  type="button"
                  onClick={() => onMetaChange({ periodLabelManual: true })}
                  className="text-[11px] font-semibold text-indigo-700 hover:text-indigo-900 underline"
                >
                  ubah label
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onMetaChange({ periodLabelManual: false, periodLabel: '' })}
                  className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 underline"
                >
                  pakai otomatis
                </button>
              )}
            </div>
            {meta.periodLabelManual ? (
              <input
                value={meta.periodLabel}
                onChange={(event) =>
                  onMetaChange({ periodLabel: event.target.value, periodLabelManual: true })
                }
                placeholder="04 September - 03 Oktober 2026"
                aria-label="Label periode manual"
                className="mt-1 w-full h-9 rounded-md border border-slate-300 bg-white px-2 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            ) : (
              <p className="text-sm font-bold text-slate-900" data-testid="laporan-period-preview">
                {periodLabel || 'Pilih periode mulai dan selesai'}
              </p>
            )}
          </div>

          <div>
            <Input
              label="Judul Cover *"
              value={meta.coverTitle}
              onChange={(event) => onMetaChange({ coverTitle: event.target.value })}
              placeholder="Digitalisasi Aplikasi Human Capital Operations"
              error={metaErrors.coverTitle}
              data-testid="laporan-meta-cover-title"
            />
            <FieldHint>otomatis dari default</FieldHint>
          </div>

          <Input
            label="Versi"
            value={meta.version}
            onChange={(event) => onMetaChange({ version: event.target.value })}
            placeholder="1.0"
          />

          <div className="md:col-span-2">
            <Input
              label="Judul Dokumen *"
              value={meta.title}
              onChange={(event) => onMetaChange({ title: event.target.value })}
              placeholder="Laporan Pekerjaan Jasa Joint Developtment Digitalisasi Aplikasi Human Capital Operations"
              error={metaErrors.title}
              data-testid="laporan-meta-title"
            />
            <FieldHint>otomatis dari default — tampil di lembar persetujuan</FieldHint>
          </div>

          <Input
            label="No Dokumen"
            value={meta.docNo}
            onChange={(event) => onMetaChange({ docNo: event.target.value })}
            placeholder="2496/Eks-BEST/BA/PBOE-272/X/2026"
            data-testid="laporan-meta-docno"
          />

          <div>
            <label htmlFor="laporan-meta-date" className="block text-xs font-semibold text-slate-700 mb-1.5">
              Tanggal Dokumen
            </label>
            <input
              id="laporan-meta-date"
              type="date"
              value={meta.date}
              onChange={(event) => onMetaChange({ date: event.target.value })}
              className={`flex h-10 w-full rounded-lg border bg-white px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                metaErrors.date ? 'border-rose-500' : 'border-slate-300'
              }`}
            />
            {metaErrors.date && <p className="mt-1 text-xs text-rose-600">{metaErrors.date}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <CoverPreview
            project={meta.project}
            coverTitle={meta.coverTitle}
            spphNo={meta.spphNo}
            periodLabel={periodLabel}
          />
          <ApprovalPreview
            project={meta.project}
            docNo={meta.docNo}
            title={meta.title}
            periodLabel={periodLabel}
          />
        </div>

        <p className="text-[11px] text-slate-500 flex items-start gap-1.5">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-indigo-500" />
          Cover menampilkan judul pendek + Nomor SPPH + periode. Lembar persetujuan memakai Judul Dokumen
          panjang dan No Dokumen, tanpa SPPH.
        </p>
      </Card>

      <div className="flex justify-end">
        <Button type="button" onClick={onNext} disabled={!canNext || parsing} className="font-bold">
          Lanjut ke Review Item <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
