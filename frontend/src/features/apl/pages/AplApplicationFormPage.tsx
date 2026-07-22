import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useState } from 'react';

import { PageHeader, Stepper } from '@/components/shared';
import { AssistantWidget } from '@/features/chatbot/components/AssistantWidget';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const STEPS = [
  { id: 'housing', label: 'Logement' },
  { id: 'income', label: 'Revenus' },
  { id: 'household', label: 'Foyer' },
  { id: 'summary', label: 'Récapitulatif' },
];

/**
 * Guided declaration flow. Form fields are uncontrolled placeholders — no
 * validation library is wired yet (see roadmap: react-hook-form + zod).
 */
export default function AplApplicationFormPage() {
  useDocumentTitle('Mise à jour de ma situation');
  const [step, setStep] = useState(1);

  return (
    <div className="mx-auto max-w-container">
      <PageHeader
        title="Mise à jour de ma situation"
        description="Déclarez un changement pour que vos droits restent à jour."
      />

      <Stepper steps={STEPS} current={step} className="mb-8" />

      <div className="mx-auto max-w-form">
        <Card>
          <CardHeader>
            <CardTitle as="h2">Informations sur votre logement</CardTitle>
            <p className="text-body-sm text-on-surface-variant">
              Veuillez vérifier et mettre à jour les détails de votre résidence actuelle.
            </p>
          </CardHeader>

          <CardContent>
            <form className="flex flex-col gap-6" onSubmit={(event) => event.preventDefault()}>
              <div className="flex flex-col gap-2">
                <Label htmlFor="address">Adresse de résidence actuelle</Label>
                <Input id="address" name="address" autoComplete="street-address" />
              </div>

              <div className="grid gap-6 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="postalCode">Code postal</Label>
                  <Input
                    id="postalCode"
                    name="postalCode"
                    inputMode="numeric"
                    autoComplete="postal-code"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="city">Ville</Label>
                  <Input id="city" name="city" autoComplete="address-level2" />
                </div>
              </div>

              <div className="grid gap-6 border-t border-border pt-6 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="rent">Montant du loyer mensuel</Label>
                  <Input
                    id="rent"
                    name="rent"
                    inputMode="decimal"
                    endAdornment="EUR"
                    aria-describedby="rent-hint"
                  />
                  <p id="rent-hint" className="text-body-sm text-on-surface-variant">
                    Hors charges, tel qu’indiqué sur votre quittance.
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="leaseType">Type de bail</Label>
                  <Select>
                    <SelectTrigger id="leaseType">
                      <SelectValue placeholder="Sélectionnez…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unfurnished">Location non meublée</SelectItem>
                      <SelectItem value="furnished">Location meublée</SelectItem>
                      <SelectItem value="shared">Colocation</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <fieldset className="border-t border-border pt-6">
                <legend className="mb-4 text-label-md text-on-surface">
                  Coordonnées du bailleur
                </legend>
                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="landlordName">Nom du bailleur ou organisme</Label>
                    <Input id="landlordName" name="landlordName" />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="landlordEmail">E-mail du bailleur</Label>
                    <Input id="landlordEmail" name="landlordEmail" type="email" />
                  </div>
                </div>
              </fieldset>

              <div className="flex justify-between border-t border-border pt-6">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setStep((s) => Math.max(1, s - 1))}
                  disabled={step === 1}
                >
                  <ArrowLeft aria-hidden="true" />
                  Retour
                </Button>
                <Button
                  type="button"
                  onClick={() => setStep((s) => Math.min(STEPS.length, s + 1))}
                  disabled={step === STEPS.length}
                >
                  Suivant
                  <ArrowRight aria-hidden="true" />
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <AssistantWidget />
    </div>
  );
}
