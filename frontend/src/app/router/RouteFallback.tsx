import { Skeleton } from '@/components/ui/skeleton';

/** Shown while a lazily-loaded route module is fetched. */
export function RouteFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-screen flex-col gap-6 bg-background p-gutter"
    >
      <span className="sr-only">Chargement de la page…</span>
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-32 w-full" />
      <div className="grid gap-6 md:grid-cols-3">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    </div>
  );
}
