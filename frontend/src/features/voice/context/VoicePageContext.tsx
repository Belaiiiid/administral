import React, { createContext, useState, useCallback, useContext, useEffect } from 'react';
import type { VoicePageAction, VoicePageField, VoicePageContextValue } from '../types';

interface VoicePageContextType {
  readableText: string;
  actions: VoicePageAction[];
  fields: VoicePageField[];
  setPageConfig: (config: VoicePageContextValue) => void;
  clearPageConfig: () => void;
}

export const VoicePageContext = createContext<VoicePageContextType | null>(null);

export const VoicePageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [readableText, setReadableText] = useState('');
  const [actions, setActions] = useState<VoicePageAction[]>([]);
  const [fields, setFields] = useState<VoicePageField[]>([]);

  const setPageConfig = useCallback((config: VoicePageContextValue) => {
    setReadableText(config.readableText);
    setActions(config.actions);
    setFields(config.fields || []);
  }, []);

  const clearPageConfig = useCallback(() => {
    setReadableText('');
    setActions([]);
    setFields([]);
  }, []);

  return (
    <VoicePageContext.Provider value={{ readableText, actions, fields, setPageConfig, clearPageConfig }}>
      {children}
    </VoicePageContext.Provider>
  );
};

export function useVoicePage(config: {
  readableText: string;
  actions: VoicePageAction[];
  fields?: VoicePageField[];
}) {
  const context = useContext(VoicePageContext);
  if (!context) return;

  const actionsKey = JSON.stringify(config.actions.map(a => ({ id: a.id, label: a.label })));
  const fieldsKey = JSON.stringify(config.fields?.map(f => ({ fieldId: f.fieldId, labels: f.labels })));

  useEffect(() => {
    context.setPageConfig(config);
    return () => {
      context.clearPageConfig();
    };
  }, [config.readableText, actionsKey, fieldsKey]);
}
