import { createRef } from 'react';
import { StackActions } from '@react-navigation/routers';

export const rootNavigationRef = createRef();

const CALL_SCREENS = new Set(['VideoCallScreen', 'VoiceCallScreen', 'ConferenceCallScreen']);

export function rootNavigate(screen, params) {
  const nav = rootNavigationRef.current;
  if (!nav?.isReady?.()) return;
  // Call screens must always be pushed as a fresh instance so the stack stays
  // predictable: [..., VideoCallScreen, MainDrawer] after minimize.
  // navigate() would reuse an existing stale instance if one is already in the stack.
  if (CALL_SCREENS.has(screen)) {
    nav.dispatch(StackActions.push(screen, params));
  } else {
    nav.navigate(screen, params);
  }
}
