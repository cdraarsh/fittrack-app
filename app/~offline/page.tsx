export const dynamic = 'force-static';

export default function OfflinePage() {
  return (
    <main className="max-w-app mx-auto min-h-screen flex flex-col items-center justify-center p-8 text-center">
      <h1 className="font-condensed text-3xl font-black gradient-text mb-2">You’re offline</h1>
      <p className="text-text2 text-sm mb-6">This page hasn’t been saved on this phone yet. Your workout is.</p>
      <a href="/today" className="px-5 py-3 rounded-xl bg-accent text-bg font-bold">Open Today</a>
    </main>
  );
}
