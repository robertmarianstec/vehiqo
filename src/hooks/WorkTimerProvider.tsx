import { createContext, useContext } from 'react';

import { useWorkTimer, type UseWorkTimerReturn } from '@/hooks/useWorkTimer';

const WorkTimerContext = createContext<UseWorkTimerReturn | null>(null);

export function WorkTimerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const value = useWorkTimer();
  return (
    <WorkTimerContext.Provider value={value}>
      {children}
    </WorkTimerContext.Provider>
  );
}

// A second useWorkTimer() call would create its own independent SQLite load
// and ticker, drifting from this one (e.g. switchMode() in one instance
// wouldn't update the other until its next tick) — every consumer must go
// through this context instead.
export function useWorkTimerContext(): UseWorkTimerReturn {
  const value = useContext(WorkTimerContext);
  if (!value) {
    throw new Error(
      'useWorkTimerContext must be used within a WorkTimerProvider',
    );
  }
  return value;
}
