import { QRCodeSVG } from 'qrcode.react';
import { MessageCircle } from 'lucide-react';

import { APP_CONFIG } from '@/app/config/app';
import { CitizenCard, CitizenCardBody, CitizenCardHeader } from '@/components/citizen/CitizenCard';

/**
 * "Continuer sur WhatsApp" — a dedicated, reusable section (not a floating
 * overlay) so it reads as a real part of the page instead of a widget stuck
 * on top of whatever else is on screen — it previously covered the chat
 * window itself once a conversation started.
 *
 * Lets a citizen switch to the WhatsApp channel without typing a number by
 * hand: same assistant, reached from a phone camera instead of a browser.
 *
 * Placeholder QR: `APP_CONFIG.whatsappBotUrl` is a placeholder number (see
 * `app/config/app.ts`) until the real WhatsApp Business number exists —
 * swapping that one config value is the only change needed to go live,
 * nothing in this component changes.
 */
export function WhatsAppQrCard() {
  return (
    <CitizenCard>
      <CitizenCardHeader title="Continuer sur WhatsApp" icon={MessageCircle} />
      <CitizenCardBody className="flex flex-col items-center gap-4 text-center">
        <div className="rounded-xl border border-border/60 bg-card p-3">
          <QRCodeSVG value={APP_CONFIG.whatsappBotUrl} size={112} />
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Scannez pour poursuivre votre accompagnement depuis WhatsApp.
        </p>
      </CitizenCardBody>
    </CitizenCard>
  );
}
