'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@clerk/nextjs';
import { createSupabaseClient } from './supabase';
import { defaultSettings, dk } from './utils';
import type { Settings, DayData, WeightEntry, TabName, PhotoEntry } from './types';
import type { SupabaseClient } from '@supabase/supabase-js';

// ─── Context shape ────────────────────────────────────────────
interface AppContextValue {
  // State
  settings:    Settings | null;
  dayCache:    Record<string, DayData>;
  weightCache: WeightEntry[];
  photoCache:  PhotoEntry[];
  isLoading:   boolean;
  currentTab:  TabName;

  // Mutations
  setCurrentTab:   (tab: TabName) => void;
  saveSettings:    (patch: Partial<Settings>) => Promise<void>;
  getDayData:      (date: Date) => DayData;
  saveDayData:     (date: Date, data: DayData) => Promise<void>;
  getWeightLog:    () => WeightEntry[];
  saveWeightLog:   (log: WeightEntry[]) => Promise<void>;
  savePhoto:       (file: File, date: string, note?: string) => Promise<void>;
  deletePhoto:     (id: string, storagePath: string) => Promise<void>;
  getCoachNote:    (weekNum: number) => string;
  saveCoachNote:   (weekNum: number, text: string) => Promise<void>;
  deleteAllData:   () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────
export function AppProvider({ children }: { children: React.ReactNode }) {
  const { userId, getToken } = useAuth();

  const [settings,    setSettingsState] = useState<Settings | null>(null);
  const [dayCache,    setDayCache]      = useState<Record<string, DayData>>({});
  const [weightCache, setWeightCache]   = useState<WeightEntry[]>([]);
  const [photoCache,  setPhotoCache]    = useState<PhotoEntry[]>([]);
  const [isLoading,   setIsLoading]     = useState(true);
  const [currentTab,  setCurrentTab]    = useState<TabName>('today');

  // Stable Supabase client — recreated only when the user changes
  const db = useMemo(() => {
    if (!userId) return null;
    return createSupabaseClient(() => getToken());
  }, [userId]); // getToken is stable from Clerk's useAuth

  // ── Load all data on sign-in ──
  useEffect(() => {
    if (!db || !userId) { setIsLoading(false); return; }
    (async () => {
      setIsLoading(true);
      try {
        const [{ data: days }, { data: wrow }, { data: srow }, { data: photos }] = await Promise.all([
          db.from('ft_days').select('date, data'),
          db.from('ft_weights').select('log').eq('user_id', userId).maybeSingle(),
          db.from('ft_settings').select('data').eq('user_id', userId).maybeSingle(),
          db.from('ft_photos').select('id, date, url, storage_path, note').eq('user_id', userId).order('date', { ascending: false }),
        ]);
        const cache: Record<string, DayData> = {};
        if (days) days.forEach((r: { date: string; data: DayData }) => { cache[r.date] = r.data; });
        setDayCache(cache);
        if (wrow?.log) setWeightCache(wrow.log);
        if (srow?.data) setSettingsState(srow.data);
        if (photos) setPhotoCache(photos.map((p: { id: string; date: string; url: string; storage_path: string; note?: string }) => ({ id: p.id, date: p.date, url: p.url, storagePath: p.storage_path, note: p.note })));
      } catch (e) {
        console.warn('Load error:', e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [db, userId]);

  // ── Mutations ──
  const saveSettings = useCallback(async (patch: Partial<Settings>) => {
    const next: Settings = { ...(settings ?? defaultSettings()), ...patch };
    setSettingsState(next);
    if (db && userId) {
      await db.from('ft_settings').upsert(
        { user_id: userId, data: next, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );
    }
  }, [settings, db, userId]);

  const getDayData = useCallback((date: Date): DayData => {
    return dayCache[dk(date)] ?? { wo: {}, check: {}, meals: [], notes: '', checkin: '' };
  }, [dayCache]);

  const saveDayData = useCallback(async (date: Date, data: DayData) => {
    const dateStr = dk(date);
    setDayCache(prev => ({ ...prev, [dateStr]: data }));
    if (db && userId) {
      await db.from('ft_days').upsert(
        { user_id: userId, date: dateStr, data, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,date' }
      );
    }
  }, [db, userId]);

  const getWeightLog = useCallback((): WeightEntry[] => {
    if (weightCache.length > 0) return weightCache;
    if (settings?.weight_start) return [{ date: settings.startDate ?? dk(new Date()), weight: settings.weight_start }];
    return [];
  }, [weightCache, settings]);

  const saveWeightLog = useCallback(async (log: WeightEntry[]) => {
    setWeightCache(log);
    if (db && userId) {
      await db.from('ft_weights').upsert({ user_id: userId, log }, { onConflict: 'user_id' });
    }
  }, [db, userId]);

  const savePhoto = useCallback(async (file: File, date: string, note?: string) => {
    if (!db || !userId) return;
    const ext = file.name.split('.').pop() ?? 'jpg';
    const storagePath = `${userId}/${date}-${Date.now()}.${ext}`;
    const { error: uploadErr } = await db.storage.from('progress-photos').upload(storagePath, file, { upsert: false });
    if (uploadErr) throw uploadErr;
    // Signed URL valid for 1 year — private bucket, user-scoped
    const { data: signedData, error: signErr } = await db.storage.from('progress-photos').createSignedUrl(storagePath, 60 * 60 * 24 * 365);
    if (signErr) throw signErr;
    const url = signedData.signedUrl;
    const { data: row, error: dbErr } = await db.from('ft_photos')
      .insert({ user_id: userId, date, url, storage_path: storagePath, note })
      .select('id').single();
    if (dbErr) throw dbErr;
    const entry: PhotoEntry = { id: row.id, date, url, storagePath, note };
    setPhotoCache(prev => [entry, ...prev].sort((a, b) => b.date.localeCompare(a.date)));
  }, [db, userId]);

  const deletePhoto = useCallback(async (id: string, storagePath: string) => {
    if (!db || !userId) return;
    await db.storage.from('progress-photos').remove([storagePath]);
    await db.from('ft_photos').delete().eq('id', id).eq('user_id', userId);
    setPhotoCache(prev => prev.filter(p => p.id !== id));
  }, [db, userId]);

  const getCoachNote = useCallback((weekNum: number): string => {
    return settings?.coachNotes?.[String(weekNum)] ?? '';
  }, [settings]);

  const saveCoachNote = useCallback(async (weekNum: number, text: string) => {
    const coachNotes = { ...(settings?.coachNotes ?? {}), [String(weekNum)]: text };
    await saveSettings({ coachNotes });
  }, [settings, saveSettings]);

  const deleteAllData = useCallback(async () => {
    if (!db || !userId) return;
    // Delete all storage files first
    const paths = photoCache.map(p => p.storagePath);
    if (paths.length > 0) await db.storage.from('progress-photos').remove(paths);
    // Delete all DB rows
    await Promise.all([
      db.from('ft_settings').delete().eq('user_id', userId),
      db.from('ft_days').delete().eq('user_id', userId),
      db.from('ft_weights').delete().eq('user_id', userId),
      db.from('ft_photos').delete().eq('user_id', userId),
    ]);
    // Clear local state — triggers onboarding wizard
    setSettingsState(null);
    setDayCache({});
    setWeightCache([]);
    setPhotoCache([]);
  }, [db, userId, photoCache]);

  const value: AppContextValue = {
    settings, dayCache, weightCache, photoCache, isLoading, currentTab,
    setCurrentTab, saveSettings, getDayData, saveDayData, getWeightLog, saveWeightLog,
    savePhoto, deletePhoto, getCoachNote, saveCoachNote, deleteAllData,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
