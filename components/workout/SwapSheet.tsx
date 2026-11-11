'use client';

import { getDb } from '@/lib/local/db';
import { swapExercise } from '@/lib/local/actions';
import { useSwapOptions } from '@/lib/local/hooks';
import { toast } from '../shared/Toast';

interface Props {
  sessionExerciseId: string;
  currentId: string;
  prescribedId: string;
  onClose: () => void;
}

/** Swap within the prescribed exercise's swap group (counts toward completion). */
export default function SwapSheet({ sessionExerciseId, currentId, prescribedId, onClose }: Props) {
  const options = useSwapOptions(prescribedId) ?? [];
  const sorted = [...options].sort((a, b) => (a.id === prescribedId ? -1 : b.id === prescribedId ? 1 : a.name.localeCompare(b.name)));

  async function apply(id: string, name: string) {
    try {
      await swapExercise(getDb(), sessionExerciseId, id);
      toast(id === prescribedId ? 'Reverted to original' : `Swapped to ${name}`);
      onClose();
    } catch {
      toast('Swap not allowed here');
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-[59] bg-bg/70" onClick={onClose} />
      <div role="dialog" aria-label="Swap exercise" className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-app z-[60] bg-bg1 border border-border rounded-t-2xl p-5 pb-8 max-h-[80vh] overflow-y-auto">
        <div className="text-[13px] font-black uppercase tracking-widest text-text2 mb-4">Swap Exercise</div>
        {sorted.map((opt) => (
          <button
            key={opt.id}
            onClick={() => void apply(opt.id, opt.name)}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl mb-2 border transition-colors text-left ${
              opt.id === currentId ? 'bg-accent/10 border-accent/35 text-text1' : 'bg-bg2 border-border text-text2 hover:border-accent/25'
            }`}
          >
            <span className="text-sm font-semibold">{opt.name}</span>
            <span className="flex gap-2">
              {opt.id === prescribedId && <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-bg3 text-text3">Original</span>}
              {opt.id === currentId && <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-accent/15 text-accent">Active</span>}
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
