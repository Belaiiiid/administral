import { ArrowRight, Minus, Plus, Send, ShieldCheck, Sparkles } from 'lucide-react';
import { useState } from 'react';

import { DataRow, PageHeader, Stepper } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { RadioCard, RadioGroup } from '@/components/ui/radio-group';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const STEPS = [
  { id: 'situation', label: 'Situation' },
  { id: 'housing', label: 'Logement' },
  { id: 'income', label: 'Ressources' },
];

/**
 * Eligibility simulator skeleton.
 *
 * Step navigation is local UI state. The estimate panel shows placeholder
 * figures — no calculation is performed (that belongs to `aplService.simulate`).
 */
export default function AplSimulatorPage() {
  useDocumentTitle('Simulateur APL');
  const [step, setStep] = useState(1);
  const [dependents, setDependents] = useState(0);

  return (
    <div className="mx-auto max-w-container">
      <PageHeader
        title="Simulateur d’aide au logement"
        description="Estimez vos droits en moins de deux minutes avec notre moteur de calcul certifié."
      />

      <div className="grid gap-gutter lg:grid-cols-3">
        {/* Form column */}
        <div className="lg:col-span-2">
          <Progress
            value={(step / STEPS.length) * 100}
            className="mb-8"
            aria-label={`Progression : étape ${step} sur ${STEPS.length}`}
          />
          <Stepper steps={STEPS} current={step} className="mb-8" />

          <Card>
            <CardHeader>
              <CardTitle as="h2">Votre situation familiale</CardTitle>
              <p className="text-body-sm text-on-surface-variant">
                Ces informations nous permettent de définir le plafond de ressources applicable.
              </p>
            </CardHeader>

            <CardContent className="flex flex-col gap-8">
              <fieldset>
                <legend className="sr-only">Situation familiale</legend>
                <RadioGroup defaultValue="single" className="sm:grid-cols-2">
                  <RadioCard
                    value="single"
                    id="marital-single"
                    label="Célibataire"
                    description="Seul(e) sans enfant"
                  />
                  <RadioCard
                    value="couple"
                    id="marital-couple"
                    label="En couple"
                    description="Marié(e), pacsé(e) ou concubinage"
                  />
                </RadioGroup>
              </fieldset>

              <div>
                <Label htmlFor="dependents-value" className="mb-3 block">
                  Nombre d’enfants ou personnes à charge
                </Label>
                <div className="flex items-center gap-4">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setDependents((n) => Math.max(0, n - 1))}
                    aria-label="Retirer une personne à charge"
                    disabled={dependents === 0}
                  >
                    <Minus aria-hidden="true" />
                  </Button>
                  <output
                    id="dependents-value"
                    aria-live="polite"
                    className="min-w-12 text-center text-headline-md text-on-surface"
                  >
                    {dependents}
                  </output>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setDependents((n) => n + 1)}
                    aria-label="Ajouter une personne à charge"
                  >
                    <Plus aria-hidden="true" />
                  </Button>
                </div>
              </div>

              <div className="flex justify-between border-t border-border pt-6">
                <Button
                  variant="ghost"
                  onClick={() => setStep((s) => Math.max(1, s - 1))}
                  disabled={step === 1}
                >
                  Retour
                </Button>
                <Button
                  onClick={() => setStep((s) => Math.min(STEPS.length, s + 1))}
                  disabled={step === STEPS.length}
                >
                  Suivant
                  <ArrowRight aria-hidden="true" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Live estimate — sticky side panel */}
        <aside className="lg:sticky lg:top-[calc(theme(spacing.header)+1rem)] lg:self-start">
          <Card className="overflow-hidden">
            <div className="bg-primary p-6 text-primary-foreground">
              <p className="mb-1 text-label-sm uppercase tracking-wider opacity-80">
                Estimation en direct
              </p>
              <p className="text-display" aria-live="polite">
                <span aria-hidden="true">—</span>
                <span className="sr-only">Estimation non disponible</span>
                <span className="text-body-md opacity-80"> / mois</span>
              </p>
            </div>

            <CardContent className="flex flex-col gap-3 p-6">
              <DataRow label="Loyer de référence" />
              <DataRow label="Nombre de parts" />
              <DataRow label="Zone géographique" />

              <div className="mt-2 rounded-lg border-l-4 border-l-ai bg-ai-surface p-4">
                <p className="mb-1 flex items-center gap-2 text-label-md text-ai">
                  <Sparkles className="size-4" aria-hidden="true" />
                  Pourquoi ce montant ?
                </p>
                <p className="text-body-sm text-on-surface-variant">
                  Le détail du calcul s’affichera ici une fois le moteur de calcul officiel branché.
                </p>
              </div>

              <Button block className="mt-2">
                Déposer ma demande
                <Send aria-hidden="true" />
              </Button>
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardContent className="flex gap-3 p-6">
              <ShieldCheck className="size-5 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <p className="mb-1 text-label-md text-on-surface">Garantie service public</p>
                <p className="text-body-sm text-on-surface-variant">
                  Cette simulation est purement indicative et n’engage pas la responsabilité de la
                  CAF ou de la MSA.
                </p>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
