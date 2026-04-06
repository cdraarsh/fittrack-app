'use client';

import { useState, useRef, useCallback } from 'react';
import { useApp } from '@/lib/store';
import { toast } from '../shared/Toast';
import type { PhotoEntry } from '@/lib/types';

export default function PhotoGrid() {
  const { photoCache, savePhoto, deletePhoto } = useApp();
  const [uploading, setUploading]   = useState(false);
  const [note, setNote]             = useState('');
  const [compareA, setCompareA]     = useState<PhotoEntry | null>(null);
  const [lightbox, setLightbox]     = useState<PhotoEntry | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const today = new Date().toISOString().split('T')[0];

  const startPress = useCallback((photo: PhotoEntry) => {
    pressTimer.current = setTimeout(() => {
      setCompareA(prev => prev?.id === photo.id ? null : photo);
    }, 500);
  }, []);

  const endPress = useCallback(() => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  }, []);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await savePhoto(file, today, note || undefined);
      toast('Photo saved');
      setNote('');
    } catch {
      toast('Upload failed — check Supabase Storage bucket "progress-photos" exists');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleDelete(photo: PhotoEntry) {
    if (!confirm('Delete this photo?')) return;
    try {
      await deletePhoto(photo.id, photo.storagePath);
      toast('Photo deleted');
      if (compareA?.id === photo.id) setCompareA(null);
      if (lightbox?.id === photo.id) setLightbox(null);
    } catch {
      toast('Delete failed');
    }
  }

  return (
    <div className="bg-bg1 border border-border rounded-card p-4 mb-3">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[13px] font-black uppercase tracking-widest text-text2">Progress Photos</div>
          {compareA && (
            <div className="text-[11px] text-accent mt-0.5">Tap another photo to compare</div>
          )}
        </div>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="text-xs font-bold px-3 py-1.5 bg-bg3 border border-border rounded-lg text-text2 disabled:opacity-50"
        >
          {uploading ? 'Uploading…' : '+ Add Photo'}
        </button>
      </div>

      <input ref={fileRef} type="file" accept="image/*" capture="user" onChange={handleFile} className="hidden" />

      {/* Optional note input */}
      <input
        type="text" value={note} onChange={e => setNote(e.target.value)}
        placeholder="Add a note (optional)"
        className="w-full bg-bg3 border border-border rounded-xl text-sm px-3 py-2.5 outline-none focus:border-accent text-text1 mb-3"
      />

      {photoCache.length === 0 ? (
        <div className="text-center py-8 text-text3 text-sm">No progress photos yet</div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {photoCache.map(photo => {
            const isCompareA = compareA?.id === photo.id;
            return (
              <div key={photo.id} className={`relative rounded-xl overflow-hidden border-2 transition-all ${isCompareA ? 'border-accent' : 'border-transparent'}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url}
                  alt={photo.note ?? photo.date}
                  className="w-full aspect-[3/4] object-cover cursor-pointer"
                  onClick={() => { if (!compareA) setLightbox(photo); }}
                  onMouseDown={() => startPress(photo)}
                  onMouseUp={endPress}
                  onTouchStart={() => startPress(photo)}
                  onTouchEnd={endPress}
                />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                  <div className="text-[11px] text-white font-semibold">{photo.date}</div>
                  {photo.note && <div className="text-[10px] text-white/70 truncate">{photo.note}</div>}
                </div>
                <button
                  onClick={() => handleDelete(photo)}
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/50 text-white text-xs flex items-center justify-center hover:bg-danger/70"
                >
                  ×
                </button>
                {isCompareA && (
                  <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-accent text-black text-[10px] font-black">A</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Compare view */}
      {compareA && photoCache.length > 1 && (
        <div className="mt-3">
          <div className="text-[11px] text-text3 mb-2">Compare — tap a photo above to set B</div>
          <div className="grid grid-cols-2 gap-2">
            {[compareA, photoCache.find(p => p.id !== compareA.id)].filter(Boolean).map((photo, i) => photo && (
              <div key={photo.id}>
                <div className="text-[10px] text-text3 font-bold mb-1 text-center">{i === 0 ? 'Before' : 'After'}</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.url} alt={photo.date} className="w-full aspect-[3/4] object-cover rounded-xl" />
                <div className="text-[10px] text-text3 text-center mt-1">{photo.date}</div>
              </div>
            ))}
          </div>
          <button onClick={() => setCompareA(null)} className="mt-2 w-full py-2 text-xs font-bold text-text3 bg-bg3 border border-border rounded-lg">Clear Compare</button>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox.url} alt={lightbox.date} className="max-h-[90vh] max-w-full rounded-xl object-contain" onClick={e => e.stopPropagation()} />
          <div className="absolute bottom-8 text-white text-sm font-semibold">{lightbox.date}{lightbox.note ? ` · ${lightbox.note}` : ''}</div>
        </div>
      )}
    </div>
  );
}
