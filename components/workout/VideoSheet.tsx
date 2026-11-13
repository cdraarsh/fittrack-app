'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ExternalLink, Play, PlayCircle, WifiOff, X } from 'lucide-react';
import { embedUrl, thumbnailUrl, videoFor, watchUrl, type ExerciseVideo } from '@/lib/exercises/videos';

function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

/**
 * Bottom sheet with a privacy-friendly lazy embed: the thumbnail loads when the
 * sheet opens (the user tapped the video button); the youtube-nocookie iframe
 * only after a second tap on play. Offline it says videos need a connection.
 * z-50: above the rest timer (z-40), like the other dialogs.
 */
export function VideoSheet({ video, name, onClose }: { video: ExerciseVideo; name: string; onClose: () => void }) {
  const online = useOnline();
  const [playing, setPlaying] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Focus moves in, Escape closes, Tab stays inside, focus returns to the opener.
  // Escape is handled on the document so it still works after Play swaps the
  // focused button for the iframe container.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLElement>('button, a[href]')?.focus();
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      closeRef.current();
    };
    document.addEventListener('keydown', onEsc, true);
    return () => {
      document.removeEventListener('keydown', onEsc, true);
      opener?.focus?.();
    };
  }, []);
  const play = () => {
    setPlaying(true);
    // The Play button unmounts; keep focus inside the dialog.
    requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>('button')?.focus());
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab') {
      const items = [...(panelRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], iframe') ?? [])];
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose} onKeyDown={onKeyDown}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-app bg-bg1 border-t border-border rounded-t-2xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h3 id={titleId} className="font-condensed text-xl font-black leading-tight">{name}</h3>
            <p className="text-xs text-text3 truncate" title={video.title}>
              {video.channel} · {video.title}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close video"
            className="w-11 h-11 -mr-2 -mt-2 flex items-center justify-center rounded-lg text-text2 hover:text-text1"
          >
            <X size={20} />
          </button>
        </div>

        <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-bg3 border border-border">
          {!online && !playing ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-6 text-text2">
              <WifiOff size={22} aria-hidden />
              <p className="text-sm">Videos need a connection. Your workout still logs offline.</p>
            </div>
          ) : playing ? (
            <iframe
              src={embedUrl(video.id)}
              title={`${name} — ${video.title}`}
              className="absolute inset-0 w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : (
            <button
              onClick={play}
              aria-label={`Play video: ${video.title}`}
              className="absolute inset-0 w-full h-full flex items-center justify-center group"
            >
              {!thumbFailed && (
                // eslint-disable-next-line @next/next/no-img-element -- plain lazy third-party thumbnail, no optimizer
                <img
                  src={thumbnailUrl(video.id)}
                  alt=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={() => setThumbFailed(true)}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              )}
              <span className="relative flex items-center gap-2 px-4 py-2.5 rounded-full bg-black/70 text-white text-sm font-bold group-active:scale-95">
                <Play size={16} fill="currentColor" /> Play
              </span>
            </button>
          )}
        </div>

        <a
          href={watchUrl(video.id)}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full min-h-11 flex items-center justify-center gap-2 py-3 rounded-xl font-bold bg-bg3 border border-border text-sm"
        >
          <ExternalLink size={15} /> Open in YouTube
        </a>
      </div>
    </div>
  );
}

/** 44×44 video button; renders nothing when the id has no verified video. */
export function VideoButton({ videoKey, name, className = '' }: { videoKey: string | null | undefined; name: string; className?: string }) {
  const video = videoFor(videoKey);
  const [open, setOpen] = useState(false);
  if (!video) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Watch video: ${name}`}
        aria-haspopup="dialog"
        className={`w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-lg text-text3 hover:text-accent active:scale-95 ${className}`}
      >
        <PlayCircle size={19} />
      </button>
      {open && <VideoSheet video={video} name={name} onClose={() => setOpen(false)} />}
    </>
  );
}
