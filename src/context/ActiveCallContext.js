import React, { createContext, useContext, useState, useRef, useCallback } from 'react';

const ActiveCallContext = createContext(null);

export function ActiveCallProvider({ children }) {
  const [activeCall, setActiveCall] = useState(null);
  const remoteURLRef = useRef(null);
  const callDurationRef = useRef(0);
  const [miniTick, setMiniTick] = useState(0);

  // Persistent video call overlay — params + visibility
  const [videoCallParams, setVideoCallParams] = useState(null); // { outgoingUser } | { incomingCallId }
  const [videoCallVisible, setVideoCallVisible] = useState(false);

  const setMiniRemoteURL = useCallback((url) => {
    remoteURLRef.current = url;
    setMiniTick((t) => t + 1);
  }, []);

  const setMiniDuration = useCallback((d) => {
    callDurationRef.current = d;
    setMiniTick((t) => t + 1);
  }, []);

  const showVideoCall = useCallback((params) => {
    setVideoCallParams(params);
    setVideoCallVisible(true);
  }, []);

  const hideVideoCall = useCallback(() => {
    setVideoCallVisible(false);
  }, []);

  const closeVideoCall = useCallback(() => {
    setVideoCallVisible(false);
    setVideoCallParams(null);
  }, []);

  return (
    <ActiveCallContext.Provider value={{
      activeCall,
      setActiveCall,
      remoteURLRef,
      callDurationRef,
      setMiniRemoteURL,
      setMiniDuration,
      miniTick,
      videoCallParams,
      videoCallVisible,
      showVideoCall,
      hideVideoCall,
      closeVideoCall,
    }}>
      {children}
    </ActiveCallContext.Provider>
  );
}

export const useActiveCall = () => useContext(ActiveCallContext);
