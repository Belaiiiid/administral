import { cn } from '@/lib/utils';

export interface StatBarDatum {
  /** Row label, shown on the category axis. */
  label: string;
  value: number;
  /** Dims the row and appends a note — for a service not yet integrated. */
  muted?: boolean;
  /** Trailing note beside the value, e.g. « à venir ». */
  note?: string;
}

/**
 * Horizontal bars for a single measure across categories.
 *
 * One hue, not one hue per row. Colour here would encode nothing the category
 * axis does not already state — the bars carry magnitude, the labels carry
 * identity — and a categorical ramp across these rows fails colour-blind
 * separation for no gain. See the platform palette: this is `--primary`.
 *
 * Built from divs rather than a charting library: adding one is a
 * platform-wide decision, and a proportional bar is a width percentage.
 */
export function StatBar({
  data,
  caption,
  valueFormatter = (value) => value.toLocaleString('fr-FR'),
}: {
  data: StatBarDatum[];
  /** Describes the series for screen readers and print. */
  caption: string;
  valueFormatter?: (value: number) => string;
}) {
  // Scale to the largest bar, never to the total: with one dominant category
  // every other row would collapse to an invisible sliver.
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <table className="w-full border-collapse">
      <caption className="sr-only">{caption}</caption>
      <tbody>
        {data.map((datum) => (
          <tr key={datum.label} className="align-middle">
            <th
              scope="row"
              className={cn(
                'w-[40%] py-2 pr-4 text-left text-label-sm font-medium',
                datum.muted ? 'text-on-surface-variant' : 'text-on-surface',
              )}
            >
              {datum.label}
            </th>
            <td className="py-2">
              <div className="flex items-center gap-3">
                <div className="h-2 flex-1 bg-surface-container" aria-hidden="true">
                  <div
                    className={cn('h-full', datum.muted ? 'bg-outline-variant' : 'bg-primary')}
                    style={{ width: `${(datum.value / max) * 100}%` }}
                  />
                </div>
                {/* Direct label: values live in text ink, never in the mark's
                    colour, so the figure stays readable at any bar length. */}
                <span className="w-20 shrink-0 text-right text-label-sm tabular-nums text-on-surface">
                  {valueFormatter(datum.value)}
                  {datum.note && (
                    <span className="ml-1 text-on-surface-variant">{datum.note}</span>
                  )}
                </span>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
