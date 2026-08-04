import type { LucideIcon } from 'lucide-react';

import { Switch } from '@/components/ui/switch';

export interface CitizenSettingRowProps {
  icon: LucideIcon;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}

/**
 * Administral-styled preference row — citizen area only. Structural twin of
 * `components/settings/SettingRow`, restyled with the Administral tokens.
 * Kept separate so the agent back-office settings, which reuse the original
 * row, are never affected by this redesign.
 */
export function CitizenSettingRow({
  icon: Icon,
  label,
  description,
  checked,
  onCheckedChange,
  disabled = false,
}: CitizenSettingRowProps) {
  const id = `citizen-setting-${label.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <div className="flex items-start justify-between gap-4 px-6 py-5">
      <div className="flex flex-1 gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <label htmlFor={id} className="cursor-pointer text-label-md text-ink">
            {label}
          </label>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
        </div>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-label={label}
        className="data-[state=checked]:bg-brand data-[state=unchecked]:bg-border"
      />
    </div>
  );
}
