'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import {
  ArrowLeft,
  FileSpreadsheet,
  Info,
  Loader2,
  RotateCcw,
  Save,
} from 'lucide-react';
import { WizardStepper } from './WizardStepper';
import { UploadStep, type ParsedDocSummary } from './UploadStep';
import { ItemsStep } from './ItemsStep';
import { SignersStep } from './SignersStep';
import { GenerateStep } from './GenerateStep';
import { LaporanToast, useLaporanToast } from './Toast';
import { EditActionsBar } from './EditActionsBar';
import {
  applyDefaultSignerSelection,
  buildGenerateRequest,
  clearWizardStorage,
  createEmptyWizardState,
  loadWizardState,
  modulesFromParsed,
  nextVersionLabel,
  persistWizardState,
  validateItems,
  validateMeta,
  wizardStateFromDetail,
  type MetaDraft,
  type ModuleDraft,
  type WizardState,
} from './wizard-state';
import { apiErrorMessage, downloadBlob, formatBytes } from './laporan-ui';
import { metaFromGuess } from './wizard-state';
import { loadDefaults, saveDefaults, defaultsFromMeta, type LaporanDefaults } from './defaults';
import { DefaultsModal } from './DefaultsModal';
import type { LaporanDetail, LaporanSigner, ParseResponseData } from './types';

/** Ambil master penanda tangan (tanpa menyentuh state — dipakai di effect). */
async function fetchLaporanSigners(): Promise<LaporanSigner[]> {
  const response = await fetch('/api/laporan/signers');
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) {
    throw new Error(apiErrorMessage(json, 'Gagal memuat master penanda tangan'));
  }
  return Array.isArray(json.data) ? (json.data as LaporanSigner[]) : [];
}

/**
 * Wizard Laporan Bulanan: upload .docx → review item → penanda tangan → generate
 * & arsip Drive. State disimpan di sessionStorage sehingga aman bila halaman
 * dimuat ulang di tab yang sama.
 *
 * Mode edit (`laporanId` diisi) memakai wizard yang sama, tetapi state awal
 * diambil dari `GET /api/laporan/[id]` dan penyimpanan sesi dipisah per id.
 */
export function LaporanWizard({
  isAdmin,
  laporanId = null,
  initialDetail = null,
}: {
  isAdmin: boolean;
  laporanId?: string | null;
  initialDetail?: LaporanDetail | null;
}) {
  const isEdit = Boolean(laporanId);
  const { toast, showToast, clearToast } = useLaporanToast();

  const [state, setState] = useState<WizardState>(createEmptyWizardState);
  const [hydrated, setHydrated] = useState(false);
  const [defaults, setDefaults] = useState<LaporanDefaults | null>(null);
  const [defaultsLoading, setDefaultsLoading] = useState(true);
  const [defaultsModalOpen, setDefaultsModalOpen] = useState(false);
  const [savingDefaults, setSavingDefaults] = useState(false);
  const [maxStep, setMaxStep] = useState(1);
  const [files, setFiles] = useState<File[]>([]);
  const [parsedDocs, setParsedDocs] = useState<ParsedDocSummary[]>([]);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [metaErrors, setMetaErrors] = useState<Partial<Record<keyof MetaDraft, string>>>({});
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [signers, setSigners] = useState<LaporanSigner[]>([]);
  const [signersLoading, setSignersLoading] = useState(true);
  const [signersError, setSignersError] = useState<string | null>(null);
  const [signersReloadToken, setSignersReloadToken] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftEndpointAvailable, setDraftEndpointAvailable] = useState<boolean | null>(null);
  const [driveOutdated, setDriveOutdated] = useState(false);
  const [saveAsNewVersion, setSaveAsNewVersion] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);

  const serverStatus = initialDetail?.status ?? 'draft';

  // Pulihkan draft dari sesi browser (hanya sekali, setelah mount).
  // Mode edit menunggu master penanda tangan karena id-nya dicocokkan lewat
  // nama pada payload tersimpan.
  // Dibungkus timer agar tidak memicu render sinkron langsung di dalam effect
  // (aturan react-hooks/set-state-in-effect) dan aman terhadap hidrasi SSR.
  useEffect(() => {
    if (hydrated) return;
    if (isEdit && signersLoading) return;

    const timer = setTimeout(() => {
      const stored = loadWizardState(laporanId);
      if (stored) {
        const step = Math.min(4, Math.max(1, Number(stored.step) || 1));
        setState({ ...stored, step });
        setMaxStep(step);
        showToast('success', 'Draft wizard dilanjutkan dari sesi browser ini.');
      } else if (initialDetail) {
        const prefilled = wizardStateFromDetail(initialDetail, signers);
        setState(prefilled);
        setMaxStep(4);
        showToast(
          'success',
          `Laporan v${initialDetail.version} dimuat: ${prefilled.modules.length} modul siap diedit.`
        );
      }
      setHydrated(true);
    }, 0);

    return () => clearTimeout(timer);
  }, [showToast, hydrated, isEdit, signersLoading, signers, laporanId, initialDetail]);

  useEffect(() => {
    let active = true;

    // Default dipakai untuk prefill: user biasanya hanya mengubah SPPH & periode.
    loadDefaults()
      .then((result) => {
        if (!active) return;
        setDefaults(result.defaults);
        setState((current) => ({
          ...current,
          meta: {
            ...current.meta,
            project: current.meta.project || result.defaults.project,
            coverTitle: current.meta.coverTitle || result.defaults.coverTitle,
            title: current.meta.title || result.defaults.title,
            docNo: current.meta.docNo || result.defaults.docNo,
            spphNo: current.meta.spphNo || result.defaults.spphNo,
            version: current.meta.version || result.defaults.version,
            periodLabel:
              current.meta.periodLabel ||
              (current.meta.periodStart ? '' : result.defaults.suggestedPeriod),
          },
        }));
      })
      .finally(() => {
        if (active) setDefaultsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  // Simpan state (debounce). Gambar bisa terlalu besar untuk sessionStorage —
  // bila kuota penuh, hanya salinan tersimpan yang kehilangan gambar.
  useEffect(() => {
    if (!hydrated) return;
    const timer = setTimeout(() => {
      const result = persistWizardState(state, laporanId);
      if (result.imagesDropped && !state.imagesDropped) {
        setState((current) => ({ ...current, imagesDropped: true }));
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [state, hydrated, laporanId]);

  const loadSigners = useCallback(async () => {
    setSignersReloadToken((token) => token + 1);
  }, []);

  useEffect(() => {
    let active = true;

    // setState hanya di callback async (aturan react-hooks/set-state-in-effect).
    fetchLaporanSigners()
      .then((list) => {
        if (!active) return;
        setSigners(list);
        setSignersError(null);
        setState((current) => ({
          ...current,
          signers: applyDefaultSignerSelection(current.signers, list),
        }));
      })
      .catch((error: unknown) => {
        if (!active) return;
        setSignersError(error instanceof Error ? error.message : 'Gagal memuat master penanda tangan');
      })
      .finally(() => {
        if (active) setSignersLoading(false);
      });

    return () => {
      active = false;
    };
  }, [signersReloadToken]);

  const goToStep = (step: number) => {
    const next = Math.min(4, Math.max(1, step));
    setState((current) => ({ ...current, step: next }));
    setMaxStep((current) => Math.max(current, next));
  };

  const patchMeta = (patch: Partial<MetaDraft>) => {
    setState((current) => ({ ...current, meta: { ...current.meta, ...patch } }));
    setMetaErrors((current) => {
      const next = { ...current };
      (Object.keys(patch) as Array<keyof MetaDraft>).forEach((key) => delete next[key]);
      return next;
    });
  };

  const handleFilesChange = (nextFiles: File[]) => {
    setFiles(nextFiles);
    setParseError(null);
  };

  const handleParse = async () => {
    if (files.length === 0) {
      setParseError('Pilih minimal satu file .docx untuk diproses.');
      return;
    }

    setParsing(true);
    setParseError(null);
    try {
      const formData = new FormData();
      files.forEach((file) => formData.append('files', file));

      const response = await fetch('/api/laporan/parse', { method: 'POST', body: formData });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) {
        throw new Error(apiErrorMessage(json, 'Gagal membaca file .docx'));
      }

      const data = json.data as ParseResponseData;
      const guessPatch = metaFromGuess(data.metaGuess);

      setState((current) => ({
        ...current,
        meta: { ...current.meta, ...guessPatch },
        modules: modulesFromParsed(data.modules),
        files: files.map((file) => ({ name: file.name, size: file.size })),
        parseSummary: data.stats,
        generated: null,
        drive: null,
        imagesDropped: false,
      }));

      setParsedDocs(
        data.docs.map((doc) => ({
          fileName: doc.fileName,
          modules: doc.stats.modules,
          items: doc.stats.items,
          captions: doc.stats.captions,
          picturesSkipped: doc.stats.picturesSkipped,
        }))
      );
      setMetaErrors({});
      setItemsError(null);
      showToast(
        'success',
        `Dokumen diproses: ${data.stats.modules} modul dan ${data.stats.items} item ditemukan.`
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Gagal membaca file .docx';
      setParseError(message);
      showToast('error', message);
    } finally {
      setParsing(false);
    }
  };

  const handleUploadNext = () => {
    const errors = validateMeta(state.meta);
    setMetaErrors(errors);
    if (Object.keys(errors).length > 0) {
      showToast('error', 'Lengkapi identitas laporan (field bertanda *) sebelum lanjut.');
      return;
    }
    goToStep(2);
  };

  const handleModulesChange = (modules: ModuleDraft[]) => {
    setState((current) => ({ ...current, modules }));
    setItemsError(null);
  };

  const handleItemsNext = () => {
    const error = validateItems(state.modules);
    setItemsError(error);
    if (error) {
      showToast('error', error);
      return;
    }
    goToStep(3);
  };

  /** Jalankan `POST /api/laporan/generate` untuk satu state tertentu. */
  const requestGenerate = async (target: WizardState) => {
    const payload = buildGenerateRequest(target);
    const response = await fetch('/api/laporan/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const contentType = response.headers.get('content-type') ?? '';
      const json = contentType.includes('application/json')
        ? await response.json().catch(() => null)
        : null;
      throw new Error(apiErrorMessage(json, 'Gagal membuat laporan'));
    }

    const id = response.headers.get('X-Laporan-Id') ?? '';
    const fileName = response.headers.get('X-Laporan-File-Name') ?? 'laporan-bulanan.docx';
    const blob = await response.blob();
    return { id, fileName, blob, version: payload.meta.version ?? '1.0' };
  };

  const handleGenerate = async () => {
    const metaValidation = validateMeta(state.meta);
    if (Object.keys(metaValidation).length > 0) {
      setMetaErrors(metaValidation);
      showToast('error', 'Identitas laporan belum lengkap.');
      goToStep(1);
      return;
    }

    const itemsValidation = validateItems(state.modules);
    if (itemsValidation) {
      setItemsError(itemsValidation);
      showToast('error', itemsValidation);
      goToStep(2);
      return;
    }

    setGenerating(true);
    try {
      const { id, fileName, blob } = await requestGenerate(state);

      downloadBlob(blob, fileName);

      const hadDrive = Boolean(state.drive) || serverStatus === 'selesai';
      const versionChanged = Boolean(id) && Boolean(laporanId) && id !== laporanId;

      setState((current) => ({
        ...current,
        // Pada mode edit, draft Drive lama tidak otomatis terbarui.
        generated: { id, fileName, generatedAt: new Date().toISOString() },
        drive: current.drive,
      }));

      if (isEdit && hadDrive) setDriveOutdated(true);

      showToast(
        'success',
        versionChanged
          ? `Versi baru (v${state.meta.version}) dibuat: ${formatBytes(blob.size)} terunduh.`
          : `Laporan dibuat (${formatBytes(blob.size)}) dan mulai diunduh.`
      );

      // Simpan default tanpa dialog: periode & SPPH periode ini jadi acuan berikutnya.
      if (!isEdit) {
        void saveDefaults(defaultsFromMeta(state.meta, state.signers)).then((ok) => {
          showToast('success', 'Pengaturan disimpan untuk laporan berikutnya.');
          return ok;
        });
      }
    } catch (error: unknown) {
      showToast('error', error instanceof Error ? error.message : 'Gagal membuat laporan');
    } finally {
      setGenerating(false);
    }
  };

  /** Arsipkan laporan (id tertentu) ke Drive lewat `POST /api/laporan/:id/selesai`. */
  const archiveToDrive = async (targetId: string, fallbackFileName: string) => {
    const response = await fetch(`/api/laporan/${targetId}/selesai`, { method: 'POST' });
    const json = await response.json().catch(() => null);
    if (!response.ok || !json?.success) {
      throw new Error(apiErrorMessage(json, 'Gagal menyimpan laporan ke Google Drive'));
    }

    const file = (json.data?.file ?? {}) as { name?: string; link?: string };
    const record = (json.data?.laporan ?? {}) as { id?: string };

    setState((current) => ({
      ...current,
      generated: current.generated
        ? { ...current.generated, id: record.id ?? targetId }
        : { id: record.id ?? targetId, fileName: fallbackFileName, generatedAt: new Date().toISOString() },
      drive: {
        link: file.link ?? '',
        fileName: file.name ?? fallbackFileName,
        archivedAt: new Date().toISOString(),
      },
    }));
    setDriveOutdated(false);
    return file;
  };

  const handleArchive = async () => {
    const generated = state.generated;
    if (!generated?.id) {
      showToast('error', 'Buat dokumen laporan terlebih dahulu.');
      return;
    }

    setFinalizing(true);
    try {
      await archiveToDrive(generated.id, generated.fileName);
      showToast('success', 'Laporan tersimpan di Google Drive dan ditandai selesai.');
    } catch (error: unknown) {
      showToast('error', error instanceof Error ? error.message : 'Gagal menyimpan laporan ke Google Drive');
    } finally {
      setFinalizing(false);
    }
  };

  /**
   * Perbarui arsip Drive dari halaman edit.
   *
   * - Tanpa versi baru: dokumen dibuat ulang untuk versi yang sama lalu Drive
   *   diperbarui (file lama diganti backend).
   * - Dengan "Simpan sebagai versi baru": versi dinaikkan (mis. 1.0 → 1.1),
   *   dokumen versi baru dibuat (baris laporan baru), lalu diarsipkan ke Drive.
   */
  const handleUpdateDrive = async () => {
    if (!laporanId) return;

    const metaValidation = validateMeta(state.meta);
    if (Object.keys(metaValidation).length > 0) {
      setMetaErrors(metaValidation);
      showToast('error', 'Identitas laporan belum lengkap.');
      goToStep(1);
      return;
    }
    const itemsValidation = validateItems(state.modules);
    if (itemsValidation) {
      setItemsError(itemsValidation);
      showToast('error', itemsValidation);
      goToStep(2);
      return;
    }

    setFinalizing(true);
    try {
      let target = state;
      if (saveAsNewVersion) {
        const bumped = nextVersionLabel(state.meta.version);
        target = { ...state, meta: { ...state.meta, version: bumped } };
        patchMeta({ version: bumped });
      }

      const { id, fileName, blob } = await requestGenerate(target);
      downloadBlob(blob, fileName);
      const driveId = id || laporanId;

      setState((current) => ({
        ...current,
        generated: { id: driveId, fileName, generatedAt: new Date().toISOString() },
      }));

      await archiveToDrive(driveId, fileName);
      setSaveAsNewVersion(false);
      showToast(
        'success',
        saveAsNewVersion
          ? `Versi ${target.meta.version} dibuat dan diarsipkan ke Google Drive.`
          : 'Arsip Google Drive diperbarui dengan dokumen terbaru.'
      );
    } catch (error: unknown) {
      showToast('error', error instanceof Error ? error.message : 'Gagal memperbarui arsip Drive');
    } finally {
      setFinalizing(false);
    }
  };

  /**
   * Simpan draft tanpa membuat berkas baru untuk diunduh.
   *
   * Endpoint resminya `PUT /api/laporan/[id]`. Bila server belum menyediakannya
   * (404/405), draft tetap bisa disimpan lewat `POST /api/laporan/generate`
   * tanpa mengunduh hasilnya — payload yang tersimpan identik.
   */
  const handleSaveDraft = async () => {
    if (!laporanId) return;

    const metaValidation = validateMeta(state.meta);
    if (Object.keys(metaValidation).length > 0) {
      setMetaErrors(metaValidation);
      showToast('error', 'Identitas laporan belum lengkap.');
      goToStep(1);
      return;
    }
    const itemsValidation = validateItems(state.modules);
    if (itemsValidation) {
      setItemsError(itemsValidation);
      showToast('error', itemsValidation);
      goToStep(2);
      return;
    }

    setSavingDraft(true);
    try {
      const payload = buildGenerateRequest(state);
      const response = await fetch(`/api/laporan/${laporanId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.status === 404 || response.status === 405) {
        // Fallback: simpan lewat generator (payload tersimpan, status tetap draft).
        const fallback = await fetch('/api/laporan/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!fallback.ok) {
          const contentType = fallback.headers.get('content-type') ?? '';
          const json = contentType.includes('application/json')
            ? await fallback.json().catch(() => null)
            : null;
          throw new Error(apiErrorMessage(json, 'Gagal menyimpan draft laporan'));
        }
        const savedId = fallback.headers.get('X-Laporan-Id') ?? laporanId;
        await fallback.blob();
        setDraftEndpointAvailable(false);
        setState((current) => ({
          ...current,
          generated: {
            id: savedId,
            fileName: fallback.headers.get('X-Laporan-File-Name') ?? '',
            generatedAt: new Date().toISOString(),
          },
        }));
        showToast('success', 'Draft tersimpan (lewat generator dokumen).');
        return;
      }

      const json = await response.json().catch(() => null);
      if (!response.ok || json?.success === false) {
        throw new Error(apiErrorMessage(json, 'Gagal menyimpan draft laporan'));
      }
      setDraftEndpointAvailable(true);
      showToast('success', 'Draft laporan tersimpan. Dokumen belum dibuat ulang.');
    } catch (error: unknown) {
      showToast('error', error instanceof Error ? error.message : 'Gagal menyimpan draft laporan');
    } finally {
      setSavingDraft(false);
    }
  };

  const handleReset = () => {
    clearWizardStorage(laporanId);
    setState(createEmptyWizardState());
    setFiles([]);
    setParsedDocs([]);
    setParseError(null);
    setMetaErrors({});
    setItemsError(null);
    setMaxStep(1);
    setResetConfirm(false);
    showToast('success', 'Wizard direset. Semua isian dikosongkan.');
    if (signers.length > 0) {
      setState((current) => ({
        ...current,
        signers: applyDefaultSignerSelection(current.signers, signers),
      }));
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="w-11 h-11 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm shadow-indigo-200 shrink-0">
            <FileSpreadsheet className="w-5 h-5" />
          </span>
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              {isEdit ? `Edit Laporan v${initialDetail?.version ?? ''}` : 'Buat Laporan Bulanan'}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {isEdit
                ? 'Ubah isi laporan, buat ulang dokumen .docx, lalu perbarui arsipnya di Google Drive.'
                : 'Unggah laporan periode lalu, rapikan item, lalu generate dokumen .docx resmi dan arsipkan ke Google Drive.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/laporan">
            <Button variant="ghost" size="sm" className="font-semibold">
              <ArrowLeft className="w-3.5 h-3.5" /> Daftar laporan
            </Button>
          </Link>

          {resetConfirm ? (
            <span className="flex items-center gap-1">
              <Button variant="danger" size="sm" className="font-semibold" onClick={handleReset}>
                Ya, reset
              </Button>
              <Button variant="outline" size="sm" onClick={() => setResetConfirm(false)}>
                Batal
              </Button>
            </span>
          ) : (
            <Button variant="outline" size="sm" className="font-semibold" onClick={() => setResetConfirm(true)}>
              <RotateCcw className="w-3.5 h-3.5" /> Reset
            </Button>
          )}
        </div>
      </div>

      <LaporanToast toast={toast} onClose={clearToast} />

      <WizardStepper step={state.step} maxStep={maxStep} onSelect={goToStep} />

      {isEdit && laporanId && (
        <EditActionsBar
          laporanId={laporanId}
          status={serverStatus}
          driveOutdated={driveOutdated}
          savingDraft={savingDraft}
          generating={generating}
          finalizing={finalizing}
          nextVersion={nextVersionLabel(state.meta.version)}
          saveAsNewVersion={saveAsNewVersion}
          onToggleNewVersion={setSaveAsNewVersion}
          onSaveDraft={handleSaveDraft}
          onGenerate={handleGenerate}
          onUpdateDrive={handleUpdateDrive}
          notice={
            draftEndpointAvailable === false
              ? 'Server belum menyediakan endpoint simpan-draft; tombol Simpan draft memakai generator dokumen.'
              : null
          }
        />
      )}

      {state.step === 1 && state.modules.length > 0 && files.length === 0 && (
        <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-900 text-[11px] font-medium flex items-start gap-2">
          <Info className="w-4 h-4 shrink-0 mt-0.5 text-indigo-600" />
          <span>
            Hasil parse dari sesi sebelumnya masih tersimpan ({state.modules.length} modul
            {state.parseSummary ? `, ${state.parseSummary.items} item` : ''}). Unggah ulang file .docx bila
            ingin memproses dari awal — isian yang sudah dirapikan tidak hilang sampai Anda menekan Proses.
            {state.files.length > 0 && (
              <span className="block text-indigo-700/80 mt-0.5">
                File sebelumnya: {state.files.map((file) => file.name).join(', ')}
              </span>
            )}
          </span>
        </div>
      )}

      {state.step === 1 && (
        <UploadStep
          files={files}
          onFilesChange={handleFilesChange}
          meta={state.meta}
          onMetaChange={patchMeta}
          metaErrors={metaErrors}
          parsing={parsing}
          parseError={parseError}
          parsedDocs={parsedDocs}
          parseSummary={state.parseSummary}
          onParse={handleParse}
          onNext={handleUploadNext}
          canNext={!parsing}
          imagesDropped={state.imagesDropped}
          defaultsAvailable={Boolean(defaults) && !defaultsLoading}
          defaultsLoading={defaultsLoading}
          onEditDefaults={() => setDefaultsModalOpen(true)}
        />
      )}

      {state.step === 2 && (
        <ItemsStep
          modules={state.modules}
          onChange={handleModulesChange}
          validationError={itemsError}
          imagesDropped={state.imagesDropped}
          onBack={() => goToStep(1)}
          onNext={handleItemsNext}
          onNotify={showToast}
        />
      )}

      {state.step === 3 && (
        <SignersStep
          signers={signers}
          loading={signersLoading}
          loadError={signersError}
          selection={state.signers}
          onChange={(next) => setState((current) => ({ ...current, signers: next }))}
          onReload={loadSigners}
          isAdmin={isAdmin}
          documentDate={state.meta.date}
          onBack={() => goToStep(2)}
          onNext={() => goToStep(4)}
          onNotify={showToast}
        />
      )}

      {state.step === 4 && (
        <GenerateStep
          state={state}
          signers={signers}
          generating={generating}
          finalizing={finalizing}
          onGenerate={handleGenerate}
          onArchive={handleArchive}
          onBack={() => goToStep(3)}
          onGoToStep={goToStep}
        />
      )}

      {defaultsModalOpen && defaults && (
        <DefaultsModal
          isOpen={defaultsModalOpen}
          defaults={defaults}
          saving={savingDefaults}
          onClose={() => setDefaultsModalOpen(false)}
          onSave={async (next) => {
            setSavingDefaults(true);
            try {
              await saveDefaults(next);
              setDefaults(next);
              setDefaultsModalOpen(false);
              showToast('success', 'Default diperbarui untuk laporan berikutnya.');
            } finally {
              setSavingDefaults(false);
            }
          }}
        />
      )}

      <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
        {hydrated ? <Save className="w-3 h-3" /> : <Loader2 className="w-3 h-3 animate-spin" />}
        {hydrated
          ? 'Isian wizard tersimpan otomatis di sesi browser ini (sessionStorage).'
          : 'Memuat draft wizard...'}
      </p>
    </div>
  );
}
