# Plan — Voice assistant ↔ Chatbot integration (voice → chatbot)

Goal
- When a voice utterance has no deterministic “app intent”, forward the transcript to the chatbot and show it in the UI
- Always speak chatbot replies when voice mode is enabled (PTT or standby)
- Surfaces: public landing page (/) and authenticated app (floating chatbot)
- No backend changes

Decisions
- Routing: Intents-first. If resolver returns unknown (and /api/voice/classify yields nothing actionable), send transcript to chatbot instead of apology
- Speaking: Auto‑speak assistant messages whenever modeVocal=true; guard against double‑speaking
- Providers: Mount voice providers globally so voice is available on public pages too

Files to modify (frontend only)
1) frontend/src/features/voice/components/VoiceAssistantProvider.tsx
   - Location: triggerCommand (frontend/src/features/voice/components/VoiceAssistantProvider.tsx:85-140)
   - Change unknown-intent fallback:
     - Before: speaks apology ("Désolé, je n’ai pas compris la commande.")
     - After: enqueue transcript to chatbot and standby (no apology)
   - Implementation notes:
     - Import: `import { useChatbotUiStore } from '@/features/chatbot/store/chatbotUiStore';`
     - In the final fallback block (after optional /api/voice/classify), replace apology with:
       ```ts
       const ask = useChatbotUiStore.getState().ask;
       ask(text);                 // queue + open panel where available
       sttProvider.current?.stop();
       setStatus('standby');
       return;
       ```
     - Keep existing deterministic intents behavior unchanged

2) frontend/src/features/chatbot/components/FloatingChatbot.tsx
   - Purpose: auto‑speak assistant replies in authenticated app
   - Add near the top-level component (after `const controller = useChatbot();`):
     ```ts
     import { useRef, useEffect } from 'react';
     import { useVoiceAssistant } from '@/features/voice/components/VoiceAssistantProvider';
     import { useVoiceStore } from '@/features/voice/store/voiceStore';

     const voice = useVoiceAssistant();
     const modeVocal = useVoiceStore((s) => s.modeVocal);
     const lastSpokenId = useRef<string | null>(null);

     useEffect(() => {
       const { messages } = controller;
       if (!modeVocal || messages.length === 0) return;
       const last = messages[messages.length - 1];
       if (last.role !== 'assistant') return;
       if (lastSpokenId.current === last.id) return;
       lastSpokenId.current = last.id;
       voice.speakText(String(last.content ?? ''));
     }, [controller.messages, modeVocal, voice]);
     ```
   - This speaks each assistant turn once while voice mode is active

3) frontend/src/features/chatbot/pages/PublicLandingPage.tsx
   - Purpose: support queued questions from voice and auto‑speak replies on public /
   - Add imports and effects:
     ```ts
     import { useEffect, useRef } from 'react';
     import { useChatbotUiStore } from '@/features/chatbot/store/chatbotUiStore';
     import { useVoiceAssistant } from '@/features/voice/components/VoiceAssistantProvider';
     import { useVoiceStore } from '@/features/voice/store/voiceStore';

     const pendingQuestion = useChatbotUiStore((s) => s.pendingQuestion);
     const consumePendingQuestion = useChatbotUiStore((s) => s.consumePendingQuestion);

     useEffect(() => {
       if (pendingQuestion === null) return;
       const q = consumePendingQuestion();
       if (q) controller.send(q);
     }, [pendingQuestion, consumePendingQuestion, controller]);

     const voice = useVoiceAssistant();
     const modeVocal = useVoiceStore((s) => s.modeVocal);
     const lastSpokenId = useRef<string | null>(null);

     useEffect(() => {
       if (!modeVocal || controller.messages.length === 0) return;
       const last = controller.messages[controller.messages.length - 1];
       if (last.role !== 'assistant') return;
       if (lastSpokenId.current === last.id) return;
       lastSpokenId.current = last.id;
       voice.speakText(String(last.content ?? ''));
     }, [controller.messages, modeVocal, voice]);
     ```

4) frontend/src/app/providers/AppProviders.tsx
   - Purpose: mount voice providers globally (voice needed on public / as well)
   - Wrap children:
     ```tsx
     import { VoicePageProvider } from '@/features/voice/context/VoicePageContext';
     import { VoiceAssistantProvider } from '@/features/voice/components/VoiceAssistantProvider';

     export function AppProviders({ children }: { children: ReactNode }) {
       // …existing bootstrap…
       return (
         <VoicePageProvider>
           <VoiceAssistantProvider>{children}</VoiceAssistantProvider>
         </VoicePageProvider>
       );
     }
     ```

5) frontend/src/components/layout/AppShell.tsx
   - Purpose: avoid double mounting after (4)
   - Remove `<VoicePageProvider>` and `<VoiceAssistantProvider>` wrappers currently around the shell
   - Keep UI components as-is: `<FloatingChatbot />` (citizen only) and `<VoiceAssistantPanel />`

Why this is safe
- VoiceAssistantProvider handles missing VoicePageContext by defaulting to { readableText: '', actions: [], fields: [] }
- ask()/pendingQuestion flow already exists across surfaces; FloatingChatbot currently consumes pendingQuestion, we add the equivalent on /
- speakText() already stops STT and transitions; lastSpokenId prevents double‑speak

Edge cases
- No floating chatbot (e.g. agent portal): ask() queues but nothing consumes; no crash. Public / consumes when present
- Deterministic voice actions remain first‑class; only unknown utterances route to chatbot
- Very short audio: unchanged behavior (server soft‑floor already in place)

Testing checklist
1) Public landing page (/)
   - Press PTT: “Quels documents pour l’APL ?”
   - Expect: user message appears in ChatWindow, assistant replies; reply is spoken once
   - Refresh page: no duplicate resend (pendingQuestion is consumed)
2) Authenticated app (citizen role) with FloatingChatbot
   - Unknown voice command → panel opens (if closed), question sent, reply spoken once
   - Known voice command (e.g. “Va aux documents”) → navigate without sending to chatbot
3) Double‑speak guard
   - Ask two times quickly; each assistant answer is spoken once, no echo
4) Regression
   - Voice onboarding redirect in AppShell unchanged
   - Existing voice actions (navigate, read_page, fill_field) unchanged

Rollback
- Revert the 5 files above; optionally re‑mount providers only in AppShell

No backend changes required