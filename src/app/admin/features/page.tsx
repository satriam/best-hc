import React from 'react';
import { listUserFeatures } from '@/services/feature.service';
import { FEATURES } from '@/lib/features';
import { FeatureMatrix } from '@/components/admin/FeatureMatrix';

export const dynamic = 'force-dynamic';

export default async function AdminFeaturesPage() {
  const users = await listUserFeatures();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Akses Fitur</h1>
        <p className="text-xs text-slate-500 mt-1">
          Atur menu yang tampil untuk tiap user. Default user baru: Cuti dan SPKL. Admin selalu melihat semua.
        </p>
      </div>
      <FeatureMatrix
        users={users}
        features={FEATURES.map((f) => ({ key: f.key, label: f.label, description: f.description }))}
      />
    </div>
  );
}
