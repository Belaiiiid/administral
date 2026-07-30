import React, { createContext, useState, useCallback, useContext, useEffect } from 'react';
import type { VoicePageAction, VoicePageField, VoicePageContextValue } from '../types';

interface VoicePageContextType {
  readableText: string;
  actions: VoicePageAction[];
  fields: VoicePageField[];
  actionCallbacks: Record<string, () => void>;
  setPageConfig: (config: VoicePageContextValue) => void;
  clearPageConfig: () => void;
}

export const VoicePageContext = createContext<VoicePageContextType | null>(null);

export const VoicePageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [readableText, setReadableText] = useState('');
  const [actions, setActions] = useState<VoicePageAction[]>([]);
  const [fields, setFields] = useState<VoicePageField[]>([]);
  const [actionCallbacks, setActionCallbacks] = useState<Record<string, () => void>>({});

  const setPageConfig = useCallback((config: VoicePageContextValue) => {
    setReadableText(config.readableText);
    setActions(config.actions);
    setFields(config.fields || []);
    setActionCallbacks(config.actionCallbacks || {});
  }, []);

  const clearPageConfig = useCallback(() => {
    setReadableText('');
    setActions([]);
    setFields([]);
    setActionCallbacks({});
  }, []);

  return (
    <VoicePageContext.Provider value={{ readableText, actions, fields, actionCallbacks, setPageConfig, clearPageConfig }}>
      {children}
    </VoicePageContext.Provider>
  );
};

export function useVoicePage(config: {
  readableText: string;
  actions: VoicePageAction[];
  fields?: VoicePageField[];
  actionCallbacks?: Record<string, () => void>;
}) {
  const context = useContext(VoicePageContext);
  if (!context) return;

  const actionsKey = JSON.stringify(config.actions.map(a => ({ id: a.id, label: a.label })));
  const fieldsKey = JSON.stringify(config.fields?.map(f => ({ fieldId: f.fieldId, labels: f.labels })));
  const callbacksKey = JSON.stringify(Object.keys(config.actionCallbacks || {}));

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    context.setPageConfig(config);
    return () => {
      context.clearPageConfig();
    };
  }, [config.readableText, actionsKey, fieldsKey, callbacksKey]);
}
