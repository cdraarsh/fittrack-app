export default function Spinner() {
  return (
    <div className="flex items-center justify-center py-20" aria-busy="true">
      <div className="w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin" />
    </div>
  );
}
