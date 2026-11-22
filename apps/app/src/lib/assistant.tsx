import type { AssistantContext } from '@housekeeping/api';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

// Opens and closes the assistant from anywhere. The sheet itself lives in features/assistant.

interface AssistantHostValue {
  visible: boolean;
  context: AssistantContext;
  /** Opens the assistant; pass what it should refer to (e.g. the open recipe). */
  open: (context?: AssistantContext) => void;
  close: () => void;
  /** The floating button gives way, e.g. to the day window at the bottom (spec 0016). */
  buttonHidden: boolean;
  setButtonHidden: (hidden: boolean) => void;
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
  const [buttonHidden, setButtonHidden] = useState(false);
  const value = useMemo(
    () => ({ visible, context, open, close, buttonHidden, setButtonHidden }),
    [visible, context, open, close, buttonHidden],
  );
  return (
    <AssistantHostContext.Provider value={value}>{props.children}</AssistantHostContext.Provider>
  );
}

export function useAssistant(): AssistantHostValue {
  const value = useContext(AssistantHostContext);
  if (!value) throw new Error('useAssistant must be used inside AssistantProvider');
  return value;
}

/**
 * Hides the floating assistant button while `hidden`, so it does not cover the controls of a
 * panel at the bottom; it comes back when the caller unmounts.
 */
export function useHideAssistantButton(hidden: boolean): void {
  const { setButtonHidden } = useAssistant();
  useEffect(() => {
    setButtonHidden(hidden);
    return () => setButtonHidden(false);
  }, [hidden, setButtonHidden]);
}
