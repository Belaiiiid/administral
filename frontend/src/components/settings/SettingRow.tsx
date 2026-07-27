import type { LucideIcon } from 'lucide-react';

import { Switch } from '@/components/ui/switch';

/**
 * One labelled preference toggle. Presentational — it renders the row and calls
 * back on change; the page owns the value and persistence.
 */
export interface SettingRowProps {
  icon: LucideIcon;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function SettingRow({
  icon: Icon,
  label,
  description,
  checked,
  onCheckedChange,
  disabled = false,
}: SettingRowProps) {
  const id = `setting-${label.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <div className="flex items-start justify-between gap-4 px-5 py-4">
      <div className="flex flex-1 gap-3">
        <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0">
          <label htmlFor={id} className="cursor-pointer text-label-md text-on-surface">
            {label}
          </label>
          <p className="mt-1 text-body-sm text-on-surface-variant">{description}</p>
        </div>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-label={label}
      />
    </div>
  );
}
