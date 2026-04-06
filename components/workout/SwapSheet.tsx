'use client';

import { useApp } from '@/lib/store';
import { SWAP_MAP, WORKOUTS } from '@/lib/constants';
import { toast } from '../shared/Toast';

interface Props {
  exId: string;
  onClose: () => void;
}

export default function SwapSheet({ exId, onClose }: Props) {
  const { settings, saveSettings } = useApp();

  const currentSwap = settings?.swaps?.[exId];
  const original = (() => {
    for (const wo of Object.values(WORKOUTS))
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
      <div className="fixed inset-0 z-[59] bg-bg/70" onClick={onClose} />
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-app z-[60] bg-bg1 border border-border rounded-t-2xl p-5 pb-8">
        <div className="text-[13px] font-black uppercase tracking-widest text-text2 mb-4">Swap Exercise</div>
        {options.map(opt => (
          <button
            key={opt.name}
            onClick={() => apply(opt.name, opt.isOriginal)}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl mb-2 border transition-colors text-left ${
              opt.name === active
                ? 'bg-accent/10 border-accent/35 text-text1'
                : 'bg-bg2 border-border text-text2 hover:border-accent/25'
            }`}
          >
            <span className="text-sm font-semibold">{opt.name}</span>
            <span className="flex gap-2">
              {opt.isOriginal && <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-bg3 text-text3">Original</span>}
              {opt.name === active && <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-accent/15 text-accent">Active</span>}
            </span>
          </button>
        ))}
        <button onClick={onClose} className="w-full mt-2 py-2.5 bg-bg3 border border-border rounded-xl text-sm font-semibold text-text2">
          Cancel
        </button>
      </div>
    </>
  );
}
