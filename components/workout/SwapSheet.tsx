'use client';

import { useApp } from '@/lib/store';
import { SWAP_MAP } from '@/lib/constants';
import { getWorkoutMap } from '@/lib/utils';
import { toast } from '../shared/Toast';

interface Props {
  exId: string;
  onClose: () => void;
}

export default function SwapSheet({ exId, onClose }: Props) {
  const { settings, saveSettings } = useApp();

  const currentSwap = settings?.swaps?.[exId];
  const original = (() => {
    for (const wo of Object.values(getWorkoutMap(settings)))
      for (const ex of wo.exercises)
        if (ex.id === exId) return ex.name;
    return exId;
  })();

  const options = [
    { name: original, isOriginal: true },
    ...(SWAP_MAP[exId] ?? []).map(n => ({ name: n, isOriginal: false })),
  ];

  async function apply(name: string, isOriginal: boolean) {
    const swaps = { ...(settings?.swaps ?? {}) };
    if (isOriginal) delete swaps[exId];
    else swaps[exId] = name;
    await saveSettings({ swaps });
    onClose();
    toast(isOriginal ? 'Reverted to original' : `Swapped to ${name}`);
  }

  const active = currentSwap ?? original;

  return (
    <>
      <div className="fixed inset-0 z-[59] bg-ink/70" onClick={onClose} />
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-app z-[60] bg-surface border border-hairline rounded-t-2xl p-5 pb-8">
        <div className="text-[13px] font-black uppercase tracking-widest text-ink-2 mb-4">Swap Exercise</div>
        {options.map(opt => (
          <button
            key={opt.name}
            onClick={() => apply(opt.name, opt.isOriginal)}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-sm mb-2 border transition-colors text-left ${
              opt.name === active
                ? 'bg-clay-wash border-clay-dim text-ink'
                : 'bg-surface-2 border-hairline text-ink-2 hover:border-clay-dim'
            }`}
          >
            <span className="text-sm font-semibold">{opt.name}</span>
            <span className="flex gap-2">
              {opt.isOriginal && <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-surface-2 text-ink-3">Original</span>}
              {opt.name === active && <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-clay-wash text-clay">Active</span>}
            </span>
          </button>
        ))}
        <button onClick={onClose} className="w-full mt-2 py-2.5 bg-surface-2 border border-hairline rounded-sm text-sm font-semibold text-ink-2">
          Cancel
        </button>
      </div>
    </>
  );
}
