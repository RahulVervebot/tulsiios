import React, { createContext, useContext, useState } from 'react';

const ActiveCallContext = createContext(null);

export function ActiveCallProvider({ children }) {
  const [activeCall, setActiveCall] = useState(null);

  return (
    <ActiveCallContext.Provider value={{ activeCall, setActiveCall }}>
      {children}
    </ActiveCallContext.Provider>
  );
}

export const useActiveCall = () => useContext(ActiveCallContext);
