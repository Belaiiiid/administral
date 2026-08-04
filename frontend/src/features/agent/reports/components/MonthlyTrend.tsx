import type { MonthlyVolume } from '@/features/agent/services';

/** « 2026-07 » → « juil. 2026 », the axis label an agent reads. */
function formatMonth(month: string): string {
  const [year, monthIndex] = month.split('-').map(Number);
  if (!year || !monthIndex) return month;
  return new Date(year, monthIndex - 1, 1).toLocaleDateString('fr-FR', {
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Submissions per month — vertical bars, oldest to newest.
 *
 * Bars rather than a line: the series is a count per discrete period, and the
 * history is short enough that a line would interpolate between months that
 * have no in-between. One hue, for the same reason as `StatBar` — the axis
 * carries the period, the height carries the volume.
 *
 * A table renders the same numbers below the plot, so the series is readable
 * without colour or shape.
 */
export function MonthlyTrend({ data }: { data: MonthlyVolume[] }) {
  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div>
      <div
        className="flex h-40 items-end gap-2 border-b border-border pb-0"
        role="presentation"
      >
        {data.map((datum) => (
          <div key={datum.month} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            {/* Direct label above each bar: the series is short enough that
                every point can be labelled without crowding. */}
            <span className="text-label-sm tabular-nums text-on-surface">{datum.count}</span>
            <div
              className="w-full bg-primary"
              style={{
                // Floor at 2px so a month with a single case is still a mark
                // rather than nothing at all.
                height: `${Math.max((datum.count / max) * 100, datum.count > 0 ? 2 : 0)}%`,
              }}
            />
          </div>
        ))}
      </div>

      <div className="flex gap-2" aria-hidden="true">
        {data.map((datum) => (
          <span
            key={datum.month}
            className="min-w-0 flex-1 truncate pt-2 text-center text-label-sm text-on-surface-variant"
          >
            {formatMonth(datum.month)}
          </span>
        ))}
      </div>

      {/* The plot is decorative for assistive tech; this is the real series. */}
      <table className="sr-only">
        <caption>Dépôts de dossiers par mois</caption>
        <thead>
          <tr>
            <th scope="col">Mois</th>
            <th scope="col">Dossiers déposés</th>
          </tr>
        </thead>
        <tbody>
          {data.map((datum) => (
            <tr key={datum.month}>
              <th scope="row">{formatMonth(datum.month)}</th>
              <td>{datum.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
