import { SignIn } from '@clerk/nextjs';

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center p-6">
      <div className="mb-8 text-center">
        <h1 className="font-condensed text-5xl font-black gradient-text tracking-tight">FitTrack</h1>
        <p className="text-text3 text-sm mt-1">Log every set. Unlock the next session.</p>
      </div>
      <SignIn routing="hash" forceRedirectUrl="/today" />
    </div>
  );
}
