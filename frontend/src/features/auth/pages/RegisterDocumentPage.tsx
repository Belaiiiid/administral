import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Loader2 } from 'lucide-react';

import { ROUTES } from '@/app/router/paths';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useProfilageStore } from '@/features/citizen/profiling/store/profilageStore';
import { profilageService } from '@/features/citizen/profiling/services/profilageService';
import { ProfilageAssistantPanel } from '@/features/citizen/profiling/components/ProfilageAssistantPanel';
import { useSessionStore } from '@/store/sessionStore';
import { citizenProfileService, profilingAnswersToPayload } from '@/features/citizen/profiling/services/citizenProfileService';

export default function RegisterDocumentPage() {
  useDocumentTitle('Inscription par Document');
  const navigate = useNavigate();
  const register = useSessionStore((state) => state.register);
  const { initFromUpload, profilComplet, profilPartiel, isLoading: isChatLoading } = useProfilageStore();

  const [step, setStep] = useState<'upload' | 'chat' | 'password'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);

  // Transition from chat to password once profile is complete
  useEffect(() => {
    if (step === 'chat' && profilComplet && !isChatLoading) {
      setEmail(profilPartiel?.email || '');
      setStep('password');
    }
  }, [step, profilComplet, isChatLoading, profilPartiel]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected && (selected.type === 'application/pdf' || selected.type.startsWith('image/'))) {
      setFile(selected);
      setError(null);
    } else {
      setFile(null);
      setError('Veuillez sélectionner un fichier PDF ou une image.');
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setIsUploading(true);
    setError(null);
    try {
      const session = await profilageService.creerSession(false);
      const tourResponse = await profilageService.uploadDocument(session.session_id, file);
      initFromUpload(session.session_id, tourResponse);
      setStep('chat');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du traitement du document.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError('Veuillez choisir un mot de passe.');
      return;
    }
    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    
    setIsRegistering(true);
    setError(null);
    try {
      await register({
        firstName: profilPartiel?.prenom || 'Inconnu',
        lastName: profilPartiel?.nom || 'Inconnu',
        email: email || profilPartiel?.email || 'inconnu@exemple.fr',
        password,
      });

      // Persist the 12 profile questions
      const payload = profilingAnswersToPayload(profilPartiel);
      if (Object.keys(payload).length > 0) {
        await citizenProfileService.mettreAJour(payload);
      }

      navigate(ROUTES.portal, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'La création du compte a échoué.');
      setIsRegistering(false);
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto">
      {error && (
        <Alert tone="error" className="mb-5">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {step === 'upload' && (
        <Card>
          <CardContent className="p-6 sm:p-8 flex flex-col items-center">
            <h1 className="mb-2 text-headline-md text-on-surface text-center">Importer un justificatif</h1>
            <p className="mb-4 text-body-sm text-on-surface-variant text-center">
              Pour gagner du temps, importez un document au format PDF ou Image (JPG, PNG).
              L'assistant pré-remplira votre profil.
            </p>
            
            <Alert className="mb-6 bg-surface-lowest">
              <AlertDescription className="text-body-sm text-on-surface-variant">
                <strong>Types de documents recommandés :</strong> Carte d'identité (CIN), carte vitale, attestation de résidence, carte de séjour, quittance de loyer, attestation de bourse...
              </AlertDescription>
            </Alert>

            <div className="w-full flex flex-col items-center gap-4">
              <label 
                htmlFor="doc-upload" 
                className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-border rounded-lg cursor-pointer hover:bg-surface-lowest transition-colors"
              >
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <Upload className="w-8 h-8 mb-2 text-on-surface-variant" />
                  <p className="text-body-sm text-on-surface-variant">
                    {file ? file.name : 'Cliquez pour sélectionner un PDF ou une image'}
                  </p>
                </div>
                <input 
                  id="doc-upload" 
                  type="file" 
                  accept=".pdf,image/*" 
                  className="hidden" 
                  onChange={handleFileChange}
                />
              </label>
              
              <Button 
                onClick={handleUpload} 
                disabled={!file || isUploading} 
                className="w-full mt-4"
              >
                {isUploading ? <Loader2 className="animate-spin" /> : 'Analyser le document'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'chat' && (
        <div>
          <h1 className="mb-6 text-headline-md text-on-surface text-center">Finalisation du profil</h1>
          <ProfilageAssistantPanel />
        </div>
      )}

      {step === 'password' && (
        <Card>
          <CardContent className="p-6 sm:p-8">
            <h1 className="mb-2 text-headline-md text-on-surface">Sécuriser votre compte</h1>
            <p className="mb-8 text-body-sm text-on-surface-variant">
              Nous avons recueilli vos informations. Veuillez choisir un mot de passe pour finaliser la création de votre compte.
            </p>
            <form onSubmit={handleRegister} className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <Label htmlFor="final-email">Adresse e-mail</Label>
                <Input
                  id="final-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="exemple@domaine.fr"
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="final-password">Mot de passe</Label>
                <Input
                  id="final-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <Button type="submit" disabled={isRegistering} className="w-full">
                {isRegistering ? 'Création du compte...' : 'Créer mon compte'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
