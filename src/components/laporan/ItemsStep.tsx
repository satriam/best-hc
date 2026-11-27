'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  ArrowUp,
  GripVertical,
  Image as ImageIcon,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  ITEM_STATUS_OPTIONS,
  SECTION_SHORT,
  SECTION_TITLE,
  averagePercent,
  countFilledItems,
  createEmptyItem,
  createEmptyModule,
  sanitizeItemTitle,
  sectionStats,
  type ItemDraft,
  type ModuleDraft,
} from './wizard-state';
import type { LaporanSection } from './types';

/** Warna aksen copper untuk drop zone aktif & tombol pindah kategori. */
const COPPER = '#b87333';

interface ItemsStepProps {
  modules: ModuleDraft[];
  onChange: (modules: ModuleDraft[]) => void;
  validationError: string | null;
  imagesDropped: boolean;
  onBack: () => void;
  onNext: () => void;
  onNotify: (type: 'success' | 'error', text: string) => void;
}

type DragPayload = { moduleKey: string; itemKey: string };

/**
 * Langkah 2 — review item dalam DUA PANEL (Pengembangan / Pemeliharaan).
 *
 * Item bisa dipindah antar panel lewat drag & drop HTML5 (tanpa library),
 * tombol "Pindahkan ke ..." di tiap baris (fallback HP/aksesibilitas), atau
 * keyboard: fokus baris lalu tekan `M`. Urutan item dalam modul bisa diatur
 * dengan tombol naik/turun.
 */
export function ItemsStep({
  modules,
  onChange,
  validationError,
  imagesDropped,
  onBack,
  onNext,
  onNotify,
}: ItemsStepProps) {
  const [preview, setPreview] = useState<{ moduleKey: string; itemKey: string } | null>(null);
  const [pendingRemoveModule, setPendingRemoveModule] = useState<string | null>(null);
  const [dragging, setDragging] = useState<DragPayload | null>(null);
  const [dragOverSection, setDragOverSection] = useState<LaporanSection | null>(null);
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const totalItems = useMemo(() => countFilledItems(modules), [modules]);
  const avgPercent = useMemo(() => averagePercent(modules), [modules]);
  const totalImages = useMemo(
    () =>
      modules.reduce((total, modul) => total + modul.items.filter((item) => Boolean(item.gambar)).length, 0),
    [modules]
  );
  const stats = useMemo(() => sectionStats(modules), [modules]);

  const previewItem = useMemo(() => {
    if (!preview) return null;
    const modul = modules.find((entry) => entry.key === preview.moduleKey);
    const item = modul?.items.find((entry) => entry.key === preview.itemKey);
    return modul && item
      ? { modul, item, moduleKey: preview.moduleKey, itemKey: preview.itemKey }
      : null;
  }, [preview, modules]);

  const flash = useCallback((itemKey: string) => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlashKey(itemKey);
    flashTimer.current = setTimeout(() => setFlashKey(null), 900);
  }, []);

  /** Normalisasi nama modul untuk perbandingan "sama persis" (abai spasi/kapital). */
  const normalizeModuleName = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();

  const updateModule = (moduleKey: string, patch: Partial<ModuleDraft>) => {
    // Ganti nama modul ke nama yang SUDAH ADA di modul lain -> gabungkan semua
    // itemnya ke modul tujuan (yang sudah ada), lalu hapus modul sumber.
    if (typeof patch.name === 'string') {
      const newKey = normalizeModuleName(patch.name);
      const source = modules.find((m) => m.key === moduleKey);
      const target = newKey
        ? modules.find((m) => m.key !== moduleKey && normalizeModuleName(m.name) === newKey)
        : undefined;
      if (source && target) {
        const merged = modules
          .map((modul) =>
            modul.key === target.key
              ? { ...modul, items: [...modul.items, ...source.items] }
              : modul
          )
          .filter((modul) => modul.key !== moduleKey);
        onChange(merged);
        return;
      }
    }
    onChange(modules.map((modul) => (modul.key === moduleKey ? { ...modul, ...patch } : modul)));
  };

  const updateItem = (moduleKey: string, itemKey: string, patch: Partial<ItemDraft>) => {
    onChange(
      modules.map((modul) =>
        modul.key === moduleKey
          ? {
              ...modul,
              items: modul.items.map((item) => (item.key === itemKey ? { ...item, ...patch } : item)),
            }
          : modul
      )
    );
  };

  const addItem = (moduleKey: string, section: LaporanSection) => {
    onChange(
      modules.map((modul) =>
        modul.key === moduleKey ? { ...modul, items: [...modul.items, createEmptyItem(section)] } : modul
      )
    );
  };

  const removeItem = (moduleKey: string, itemKey: string) => {
    onChange(
      modules.map((modul) =>
        modul.key === moduleKey ? { ...modul, items: modul.items.filter((item) => item.key !== itemKey) } : modul
      )
    );
  };

  const addModule = (section: LaporanSection) => {
    onChange([...modules, createEmptyModule('', section)]);
  };

  const removeModule = (moduleKey: string) => {
    onChange(modules.filter((modul) => modul.key !== moduleKey));
    setPendingRemoveModule(null);
    if (preview?.moduleKey === moduleKey) setPreview(null);
  };

  /** Pindahkan item ke panel lain (dipakai tombol, keyboard, dan drop). */
  const moveItem = (moduleKey: string, itemKey: string, target: LaporanSection) => {
    const modul = modules.find((entry) => entry.key === moduleKey);
    const item = modul?.items.find((entry) => entry.key === itemKey);
    if (!item || item.section === target) return;

    updateItem(moduleKey, itemKey, { section: target });
    flash(itemKey);
    onNotify('success', `Dipindah ke ${SECTION_SHORT[target]}`);
  };

  const toggleSection = (moduleKey: string, itemKey: string, current: LaporanSection) => {
    moveItem(moduleKey, itemKey, current === 'development' ? 'maintenance' : 'development');
  };

  /** Geser urutan item di dalam modulnya (tanpa mengubah kategori). */
  const moveOrder = (moduleKey: string, itemKey: string, direction: -1 | 1) => {
    onChange(
      modules.map((modul) => {
        if (modul.key !== moduleKey) return modul;
        const index = modul.items.findIndex((item) => item.key === itemKey);
        const target = index + direction;
        if (index < 0 || target < 0 || target >= modul.items.length) return modul;
        const items = [...modul.items];
        const [moved] = items.splice(index, 1);
        items.splice(target, 0, moved);
        return { ...modul, items };
      })
    );
  };

  /** Modul + item yang kategorinya cocok dengan panel; modul kosong disembunyikan. */
  const panelGroups = (section: LaporanSection) =>
    modules
      .map((modul) => ({ modul, items: modul.items.filter((item) => item.section === section) }))
      .filter((group) => group.items.length > 0);

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">Review item pekerjaan</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Seret item ke panel lain, atau pakai tombol <span className="font-semibold">⇄</span> di tiap
              baris (HP/aksesibilitas). Keyboard: fokus baris lalu tekan{' '}
              <kbd className="px-1 py-0.5 rounded border border-slate-300 bg-slate-50 text-[10px] font-bold">M</kbd>
              .
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="font-semibold"
            onClick={() => addModule('development')}
          >
            <Plus className="w-3.5 h-3.5" /> Tambah modul
          </Button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <SummaryStat label="Modul" value={String(stats.moduleCount)} />
          <SummaryStat label="Item terisi" value={String(totalItems)} />
          <SummaryStat label="Gambar lampiran" value={String(totalImages)} />
          <SummaryStat label="Rata-rata %" value={totalItems === 0 ? '—' : `${avgPercent}%`} />
        </div>

        {imagesDropped && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-medium">
            Gambar lampiran tidak ikut tersimpan di sessionStorage (kuota browser). Pada sesi ini gambar
            tetap dipakai saat generate; setelah reload halaman, unggah ulang .docx agar lampiran lengkap.
          </div>
        )}

        {validationError && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-semibold flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {validationError}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {(['development', 'maintenance'] as LaporanSection[]).map((section) => {
          const groups = panelGroups(section);
          const isOver = dragOverSection === section;
          const sectionCount = section === 'development' ? stats.development.count : stats.maintenance.count;
          const sectionAvg =
            section === 'development' ? stats.development.avgPercent : stats.maintenance.avgPercent;

          return (
            <section
              key={section}
              aria-label={SECTION_TITLE[section]}
              data-testid={`panel-${section}`}
              onDragOver={(event) => {
                if (!dragging) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                if (dragOverSection !== section) setDragOverSection(section);
              }}
              onDragLeave={(event) => {
                if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                setDragOverSection((current) => (current === section ? null : current));
              }}
              onDrop={(event) => {
                event.preventDefault();
                setDragOverSection(null);
                const raw = event.dataTransfer.getData('application/x-laporan-item');
                setDragging(null);
                if (!raw) return;
                try {
                  const payload = JSON.parse(raw) as DragPayload;
                  moveItem(payload.moduleKey, payload.itemKey, section);
                } catch {
                  // payload rusak — tidak ada perubahan data
                }
              }}
              className={cn(
                'rounded-xl bg-white border transition-colors',
                isOver ? 'border-2 border-dashed bg-amber-50/40' : 'border border-slate-200'
              )}
              style={isOver ? { borderColor: COPPER } : undefined}
            >
              <header
                className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2"
                style={{
                  borderTopWidth: 4,
                  borderTopStyle: 'solid',
                  borderTopColor: section === 'development' ? '#4f46e5' : COPPER,
                }}
              >
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-slate-900 truncate">{SECTION_TITLE[section]}</h3>
                  <p className="text-[11px] text-slate-500">
                    {sectionCount} item · rata-rata {sectionCount === 0 ? '—' : `${sectionAvg}%`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => addModule(section)}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-700 hover:bg-indigo-50 transition-colors"
                  aria-label={`Tambah modul di ${SECTION_TITLE[section]}`}
                  title={`Tambah modul di ${SECTION_TITLE[section]}`}
                >
                  <Plus className="w-4 h-4" />
                </button>
              </header>

              <div className="p-3 space-y-3 min-h-[140px]">
                {groups.length === 0 && (
                  <div
                    className={cn(
                      'rounded-lg border border-dashed px-3 py-6 text-center text-[11px]',
                      isOver
                        ? 'border-amber-500 text-amber-900 bg-amber-50/60'
                        : 'border-slate-300 text-slate-500'
                    )}
                  >
                    {dragging
                      ? 'Lepas di sini untuk memindahkan item ke panel ini.'
                      : `Belum ada item di ${SECTION_TITLE[section]}. Seret item ke sini atau tambah modul.`}
                  </div>
                )}

                {groups.map(({ modul, items }) => (
                  <div
                    key={`${section}-${modul.key}`}
                    className="rounded-lg border border-slate-200 overflow-hidden"
                  >
                    <div className="flex items-center gap-2 px-2.5 py-2 bg-slate-50/80 border-b border-slate-200">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                        Modul
                      </span>
                      <input
                        value={modul.name}
                        onChange={(event) => updateModule(modul.key, { name: event.target.value })}
                        placeholder="Travel, Leave, Absensi..."
                        aria-label="Nama modul"
                        className="flex-1 min-w-0 h-8 rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      />
                      <span className="text-[10px] text-slate-500 whitespace-nowrap">{items.length} item</span>
                      {pendingRemoveModule === modul.key ? (
                        <span className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => removeModule(modul.key)}
                            className="px-1.5 py-0.5 rounded bg-rose-600 text-white text-[10px] font-bold"
                          >
                            Hapus
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingRemoveModule(null)}
                            className="px-1.5 py-0.5 rounded border border-slate-300 text-[10px] font-semibold text-slate-700"
                          >
                            Batal
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setPendingRemoveModule(modul.key)}
                          aria-label={`Hapus modul ${modul.name || 'tanpa nama'}`}
                          className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <ul className="divide-y divide-slate-100">
                      {items.map((item, itemIndex) => {
                        const isDragged = dragging?.itemKey === item.key;
                        const target: LaporanSection =
                          section === 'development' ? 'maintenance' : 'development';
                        return (
                          <li
                            key={item.key}
                            draggable
                            tabIndex={0}
                            role="group"
                            aria-label={`Item ${item.fitur || 'baru'}`}
                            data-testid={`item-${item.key}`}
                            onDragStart={(event) => {
                              const payload: DragPayload = { moduleKey: modul.key, itemKey: item.key };
                              event.dataTransfer.setData(
                                'application/x-laporan-item',
                                JSON.stringify(payload)
                              );
                              event.dataTransfer.effectAllowed = 'move';
                              setDragging(payload);
                            }}
                            onDragEnd={() => {
                              setDragging(null);
                              setDragOverSection(null);
                            }}
                            onKeyDown={(event) => {
                              // Hanya saat baris sendiri fokus (bukan input di dalamnya).
                              if (event.target !== event.currentTarget) return;
                              if (event.key === 'm' || event.key === 'M') {
                                event.preventDefault();
                                toggleSection(modul.key, item.key, section);
                              }
                            }}
                            className={cn(
                              'px-2.5 py-2.5 transition-all duration-200 outline-none',
                              isDragged ? 'opacity-40' : 'opacity-100',
                              flashKey === item.key
                                ? 'bg-amber-50 ring-2 ring-amber-400'
                                : 'bg-white focus-visible:ring-2 focus-visible:ring-indigo-400'
                            )}
                          >
                            <div className="flex items-start gap-2">
                              <span
                                className="mt-1.5 text-slate-300 cursor-grab active:cursor-grabbing"
                                aria-hidden="true"
                                title="Seret untuk pindah kategori"
                              >
                                <GripVertical className="w-4 h-4" />
                              </span>

                              {item.gambar ? (
                                <button
                                  type="button"
                                  onClick={() => setPreview({ moduleKey: modul.key, itemKey: item.key })}
                                  className="shrink-0 rounded-md overflow-hidden border border-slate-200 hover:ring-2 hover:ring-indigo-400 transition-all"
                                  aria-label={`Lihat gambar ${item.caption || item.fitur}`}
                                >
                                  <img
                                    src={item.gambar}
                                    alt={item.caption || item.fitur || 'Gambar lampiran'}
                                    width={56}
                                    height={40}
                                    loading="lazy"
                                    decoding="async"
                                    className="w-14 h-10 object-cover"
                                  />
                                </button>
                              ) : (
                                <span className="shrink-0 w-14 h-10 rounded-md border border-dashed border-slate-200 text-slate-300 flex items-center justify-center">
                                  <ImageIcon className="w-4 h-4" />
                                </span>
                              )}

                              <div className="flex-1 min-w-0 space-y-1.5">
                                <input
                                  value={item.fitur}
                                  onChange={(event) =>
                                    updateItem(modul.key, item.key, { fitur: event.target.value })
                                  }
                                  onBlur={(event) => {
                                    // Sanitasi penanda `[Kategori]` saat field ditinggalkan.
                                    const clean = sanitizeItemTitle(event.target.value);
                                    if (clean !== event.target.value) {
                                      updateItem(modul.key, item.key, { fitur: clean });
                                    }
                                  }}
                                  placeholder="Nama fitur / pekerjaan (tanpa penanda [kategori])"
                                  aria-label={`Fitur ${modul.name || 'modul'} baris ${itemIndex + 1}`}
                                  className={cn(
                                    'w-full h-8 rounded-md border bg-white px-2 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent',
                                    item.fitur.trim()
                                      ? 'border-slate-300'
                                      : 'border-amber-300 bg-amber-50/40'
                                  )}
                                />
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <select
                                    value={item.status}
                                    onChange={(event) =>
                                      updateItem(modul.key, item.key, { status: event.target.value })
                                    }
                                    aria-label={`Status ${item.fitur || 'item'}`}
                                    className="h-7 rounded-md border border-slate-300 bg-white px-1.5 text-[11px] text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                  >
                                    {ITEM_STATUS_OPTIONS.map((option) => (
                                      <option key={option} value={option}>
                                        {option}
                                      </option>
                                    ))}
                                  </select>

                                  <div className="flex items-center gap-0.5">
                                    <input
                                      type="number"
                                      min={0}
                                      max={100}
                                      inputMode="numeric"
                                      value={item.percent}
                                      onChange={(event) => {
                                        const raw = event.target.value;
                                        if (raw === '') {
                                          updateItem(modul.key, item.key, { percent: '' });
                                          return;
                                        }
                                        const value = Math.max(0, Math.min(100, Number(raw)));
                                        updateItem(modul.key, item.key, {
                                          percent: Number.isFinite(value) ? String(value) : '',
                                        });
                                      }}
                                      aria-label={`Persentase ${item.fitur || 'item'}`}
                                      placeholder="0"
                                      className="w-12 h-7 rounded-md border border-slate-300 bg-white px-1 text-center text-[11px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                    <span className="text-[10px] text-slate-400">%</span>
                                  </div>

                                  <input
                                    value={item.note}
                                    onChange={(event) =>
                                      updateItem(modul.key, item.key, { note: event.target.value })
                                    }
                                    placeholder="Keterangan (opsional)"
                                    aria-label={`Keterangan ${item.fitur || 'item'}`}
                                    className="flex-1 min-w-[120px] h-7 rounded-md border border-slate-300 bg-white px-2 text-[11px] text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                  />
                                </div>
                              </div>

                              <div className="flex flex-col items-center gap-0.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => moveOrder(modul.key, item.key, -1)}
                                  aria-label="Naikkan urutan"
                                  title="Naikkan urutan"
                                  className="p-0.5 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                                >
                                  <ArrowUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveOrder(modul.key, item.key, 1)}
                                  aria-label="Turunkan urutan"
                                  title="Turunkan urutan"
                                  className="p-0.5 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                                >
                                  <ArrowDown className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeItem(modul.key, item.key)}
                                  aria-label={`Hapus item ${item.fitur || 'baru'}`}
                                  title="Hapus item"
                                  className="p-0.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            <div className="mt-1.5 flex items-center justify-between gap-2 pl-6">
                              <button
                                type="button"
                                onClick={() => moveItem(modul.key, item.key, target)}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold rounded-md px-1.5 py-0.5 border transition-colors hover:bg-amber-50"
                                style={{ color: COPPER, borderColor: 'rgba(184,115,51,0.45)' }}
                              >
                                <ArrowRightLeft className="w-3 h-3" />
                                Pindahkan ke {SECTION_SHORT[target]}
                              </button>
                              <button
                                type="button"
                                onClick={() => addItem(modul.key, section)}
                                className="text-[11px] font-semibold text-slate-500 hover:text-indigo-700"
                              >
                                + baris di modul ini
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2">
        <Button type="button" variant="outline" onClick={onBack} className="font-semibold">
          <ArrowLeft className="w-4 h-4" /> Kembali
        </Button>
        <Button type="button" onClick={onNext} className="font-bold">
          Lanjut ke Penanda Tangan <ArrowRight className="w-4 h-4" />
        </Button>
      </div>

      <Modal
        isOpen={Boolean(previewItem)}
        onClose={() => setPreview(null)}
        title="Gambar lampiran"
        description={previewItem ? previewItem.modul.name || 'Modul tanpa nama' : undefined}
        maxWidth="lg"
      >
        {previewItem && (
          <div className="space-y-3">
            {previewItem.item.gambar ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 max-h-[60vh] overflow-auto">
                <img
                  src={previewItem.item.gambar}
                  alt={previewItem.item.caption || previewItem.item.fitur}
                  className="mx-auto max-h-[52vh] w-auto rounded-lg"
                />
              </div>
            ) : (
              <p className="text-xs text-slate-500">Gambar untuk item ini sudah dihapus.</p>
            )}

            <div>
              <label htmlFor="preview-caption" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Caption lampiran
              </label>
              <input
                id="preview-caption"
                value={previewItem.item.caption}
                onChange={(event) =>
                  updateItem(previewItem.moduleKey, previewItem.itemKey, { caption: event.target.value })
                }
                placeholder={previewItem.item.fitur || 'Caption gambar'}
                className="w-full h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Caption dipakai pada Daftar Gambar. Kosongkan untuk memakai nama fitur.
              </p>
            </div>

            {previewItem.item.imageName && (
              <p className="text-[11px] text-slate-400">File asal: {previewItem.item.imageName}</p>
            )}

            <div className="flex justify-end">
              <Button type="button" size="sm" onClick={() => setPreview(null)}>
                Selesai
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="text-sm font-extrabold text-slate-900 leading-tight">{value}</p>
    </div>
  );
}
