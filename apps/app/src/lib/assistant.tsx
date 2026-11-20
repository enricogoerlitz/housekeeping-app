import type { AssistantContext } from '@housekeeping/api';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

// Opens and closes the assistant from anywhere. The sheet itself lives in features/assistant.

interface AssistantHostValue {
  visible: boolean;
  context: AssistantContext;
  /** Opens the assistant; pass what it should refer to (e.g. the open recipe). */
  open: (context?: AssistantContext) => void;
  close: () => void;
}

const AssistantHostContext = createContext<AssistantHostValue | undefined>(undefined);

export function AssistantProvider(props: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [context, setContext] = useState<AssistantContext>({});
  const open = useCallback((next?: AssistantContext) => {
    setContext(next ?? {});
    setVisible(true);
  }, []);
  const close = useCallback(() => setVisible(false), []);
  const value = useMemo(() => ({ visible, context, open, close }), [visible, context, open, close]);
  return (
    <AssistantHostContext.Provider value={value}>{props.children}</AssistantHostContext.Provider>
  );
}

export function useAssistant(): AssistantHostValue {
  const value = useContext(AssistantHostContext);
  if (!value) throw new Error('useAssistant must be used inside AssistantProvider');
  return value;
}
