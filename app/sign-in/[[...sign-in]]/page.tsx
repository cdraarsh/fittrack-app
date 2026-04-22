import { SignIn } from '@clerk/nextjs';

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-paper flex flex-col items-center justify-center p-6">
      <div className="mb-8 text-center">
        <h1 className="font-sans text-5xl font-black text-ink tracking-tight">FitTrack</h1>
        <p className="text-ink-3 text-sm mt-1">16-Week Transformation Program</p>
      </div>
      <SignIn routing="hash" forceRedirectUrl="/dashboard" />
    </div>
  );
}
