import React, { useEffect, useMemo, useRef, useState } from 'react';

import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Linking,
  Share,
  useWindowDimensions,
  Image,
  Alert,
  RefreshControl
} from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';
import Voice from '@react-native-voice/voice';
import { request, PERMISSIONS, RESULTS } from 'react-native-permissions';
import Sound from 'react-native-sound';
import RNBlobUtil from 'react-native-blob-util';
import AttachmentButton from './AttachmentButton';
import AttachmentPreview from './AttachmentPreview';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

const normalizeBaseUrl = (value) => String(value || '').replace(/\/$/, '');
const normalizeAttachmentBase = (value) => {
  const base = normalizeBaseUrl(value);
  if (!base) return '';
  const apiIndex = base.indexOf('/api');
  if (apiIndex === -1) return base;
  return base.slice(0, apiIndex);
};
const normalizeWsUrl = (value) => {
  const raw = String(value || '').replace(/\/$/, '');
  if (!raw) return '';
  if (raw.startsWith('ws://') || raw.startsWith('wss://')) return raw;
  if (raw.startsWith('https://')) return `wss://${raw.slice('https://'.length)}`;
  if (raw.startsWith('http://')) return `ws://${raw.slice('http://'.length)}`;
  return raw;
};
const withTrailingSlash = (value) => (value.endsWith('/') ? value : `${value}/`);
const buildApiUrl = (base, path) => {
  const normalized = normalizeBaseUrl(base);
  if (!normalized) return path;
  const hasApiSegment = /\/api(\/|$)/.test(normalized);
  return hasApiSegment ? `${normalized}${path}` : `${normalized}/api${path}`;
};
const createChatEndpoints = (base) => {
  if (!base) return null;
  return {
    conversations: withTrailingSlash(buildApiUrl(base, '/chat/conversations')),
    conversationHistory: (id) => withTrailingSlash(buildApiUrl(base, `/chat/conversations/${id}/messages`)),
    sendMessage: (id) => withTrailingSlash(buildApiUrl(base, `/chat/conversations/${id}/messages`)),
    createConversation: withTrailingSlash(buildApiUrl(base, '/chat/conversations')),
    switchAgent: (id) => withTrailingSlash(buildApiUrl(base, `/ai/chat/${id}/switch-agent`)),
    submitRating: (id) => withTrailingSlash(buildApiUrl(base, `/chat/conversations/${id}/submit-rating`)),
    submitAIFeedback: (id) => withTrailingSlash(buildApiUrl(base, `/ai/feedback/${id}`)),
    uploadAttachment: withTrailingSlash(buildApiUrl(base, '/chat/attachments/upload')),
  };
};
const createAuthHeaders = (token) => {
  const headers = {
    accept: 'application/json',
    'Content-Type': 'application/json',
    access_token: token || '',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
};

const splitNumericTokens = (value) => {
  const text = String(value ?? '');
  if (!text) return [];
  const tokens = [];
  const pattern = /\d+(?:[.,]\d+)?/g;
  let lastIndex = 0;
  let match;
  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }
    tokens.push({ type: 'number', value: match[0] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    tokens.push({ type: 'text', value: text.slice(lastIndex) });
  }
  return tokens;
};

const stripMarkdownBold = (value) => String(value ?? '').replace(/\*\*/g, '');

const getFileNameFromUrl = (value, fallbackExt = 'xlsx') => {
  const raw = String(value || '').split('?')[0].split('#')[0];
  const name = raw.split('/').filter(Boolean).pop() || '';
  if (name) return decodeURIComponent(name);
  const stamp = new Date().toISOString().slice(0, 10);
  return `export-${stamp}.${fallbackExt}`;
};

const parseJsonSafe = async (res, context = '') => {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (error) {
    const snippet = text.slice(0, 200);
    const status = res?.status ? ` (${res.status})` : '';
    const label = context ? ` ${context}` : '';
    throw new Error(`Invalid JSON${status}${label}: ${snippet}`);
  }
};

export default function Chat({ style, buttonStyle, isOpen: externalIsOpen, setIsOpen: externalSetIsOpen, hideFab }) {
  // const [isOpen, setIsOpen] = useState(false);
  const [internalOpen, setInternalOpen] = useState(false);
    const insets = useSafeAreaInsets();
  const isOpen = externalIsOpen !== undefined ? externalIsOpen : internalOpen;
 const setIsOpen = externalSetIsOpen || setInternalOpen;
  const [conversations, setConversations] = useState([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [showTypeSelector, setShowTypeSelector] = useState(false);
  const [switchingAgent, setSwitchingAgent] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [, forceUpdate] = useState({});
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);
  const [waitingForAI, setWaitingForAI] = useState(false);
  const [selectedRating, setSelectedRating] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);
  const [aiFeedbackMap, setAiFeedbackMap] = useState({});
  const [submittingAIFeedbackId, setSubmittingAIFeedbackId] = useState(null);
  const [accessToken, setAccessToken] = useState('');
  const [userName, setUserName] = useState('');
  const [apiBase, setApiBase] = useState('');
  const [frontBase, setFrontBase] = useState('');
  const [downloadedExports, setDownloadedExports] = useState({});
  const [downloadingUrls, setDownloadingUrls] = useState({});
  const [wsBase, setWsBase] = useState('');
  const [recording, setRecording] = useState(false);
  const [micGranted, setMicGranted] = useState(false);
  const [typingMessageId, setTypingMessageId] = useState(null);
  const [typedText, setTypedText] = useState('');
  const { height: windowHeight } = useWindowDimensions();
  const sheetHeight = Math.max(Math.round(windowHeight * 0.6), 420);
  const beepRef = useRef(null);
  const messageRef = useRef('');
  const voiceAutoSendRef = useRef(false);
  const pendingTypeMessageRef = useRef('');
  const showTypeSelectorRef = useRef(false);
  const selectedConversationRef = useRef(null);
  const navigationRef = useRef(null);
  const messagesEndRef = useRef(null);
  const wsRef = useRef(null);
  const loadedConversationRef = useRef(null);
  const aiPollingRef = useRef(null);
  const typingIntervalRef = useRef(null);
  const accessTokenRef = useRef('');
    const navigation = useNavigation();
  const authBootstrapRef = useRef(Promise.resolve(false));
  const authContextRef = useRef({
    accessToken: '',
    apiBase: '',
    frontBase: '',
    wsBase: '',
  });

  const isAuthenticated = !!accessToken;
  const showAttachments = true;

  const renderMessageContent = (msg, isClient, isAI) => {
    const baseStyle = isClient ? styles.clientText : styles.otherText;
    const content = isAI ? stripMarkdownBold(msg.content) : msg.content;
    if (!isAI || isClient) {
      return <Text style={baseStyle}>{content}</Text>;
    }
    const tokens = splitNumericTokens(content);
    if (tokens.length === 0) {
      return <Text style={baseStyle}>{content}</Text>;
    }
    return (
      <Text style={baseStyle}>
        {tokens.map((token, index) => {
          if (token.type === 'number') {
            return (
              <Text key={`num-${index}`} style={[baseStyle, styles.aiNumberBold]}>
                {token.value}
              </Text>
            );
          }
          return token.value;
        })}
      </Text>
    );
  };

  const ConversationTypeSelector = ({ onSelect, onCancel }) => (
    <>
    {!sending ?
  <View style={styles.typeSelector}>
    <Text style={styles.typeTitle}>Choose conversation type</Text>
    <Text style={styles.typeSubtitle}>Pick how you want to chat with us.</Text>
    <TouchableOpacity style={styles.typeCard} onPress={() => onSelect('ai')}>
      <View style={styles.typeCardIcon}>
        <Icon name="smart-toy" size={18} color="#16A34A" />
      </View>
      <View style={styles.typeCardBody}>
        <Text style={styles.typeCardTitle}>Ask AI Agent</Text>
        <Text style={styles.typeCardText}>Get instant answers and insights from your POS data.</Text>
      </View>
      <View style={styles.typeCardAction}>
         <Text style={styles.typeCardActionText}> {sending ? 'Sending...' : 'Send'}</Text>
      </View>
    </TouchableOpacity>
    <TouchableOpacity style={styles.typeCard} onPress={() => onSelect('support')}>
      <View style={styles.typeCardIcon}>
        <Icon name="support-agent" size={18} color="#16A34A" />
      </View>
      <View style={styles.typeCardBody}>
        <Text style={styles.typeCardTitle}>Contact Support</Text>
        <Text style={styles.typeCardText}>Message a live support agent for help and troubleshooting.</Text>
      </View>
      <View style={styles.typeCardAction}>
        <Text style={styles.typeCardActionText}>Start</Text>
      </View>
    </TouchableOpacity>
    <TouchableOpacity style={[styles.typeBtn, styles.typeCancel]} onPress={onCancel}>
      <Text style={styles.typeCancelText}>Cancel</Text>
    </TouchableOpacity>
  </View>
  :''
}
  </>
);

  useEffect(() => {
    authBootstrapRef.current = (async () => {
      const entries = await AsyncStorage.multiGet([
        'chatai_access',
        'chatai_full_name',
        'chatai_username',
        'chatai_email',
        'tulsi_ai_backend',
        'tulsi_websocket',
        'tulsifrontendurl'
      ]);
      const getEntry = (key) => entries.find(([k]) => k === key)?.[1];
      const token = getEntry('chatai_access');
      const fullName = getEntry('chatai_full_name');
      const userHandle = getEntry('chatai_username');
      const userEmail = getEntry('chatai_email');
      const apiUrl = getEntry('tulsi_ai_backend');
      const frontUrl = getEntry('tulsifrontendurl');
      const wsUrl = getEntry('tulsi_websocket');
      console.log("access_token chat",token);
      console.log('[Chat] storage snapshot:', {
        hasAccessToken: !!token,
        accessTokenPreview: token ? `${String(token).slice(0, 12)}...` : '',
        hasApiUrl: !!apiUrl,
        apiUrl,
        hasFrontUrl: !!frontUrl,
        frontUrl,
        hasWsUrl: !!wsUrl,
        wsUrl,
      });
      setAccessToken(token || '');
      setUserName(fullName || userHandle || userEmail || 'You');
      setApiBase(normalizeBaseUrl(apiUrl));
      setFrontBase(normalizeBaseUrl(frontUrl));
      accessTokenRef.current = token || '';
      setWsBase(normalizeWsUrl(wsUrl));
      authContextRef.current = {
        accessToken: token || '',
        apiBase: normalizeBaseUrl(apiUrl),
        frontBase: normalizeBaseUrl(frontUrl),
        wsBase: normalizeWsUrl(wsUrl),
      };
      return !!token;
    })();
  }, []);

  useEffect(() => {
    messageRef.current = message;
  }, [message]);

  useEffect(() => {
    accessTokenRef.current = accessToken || '';
  }, [accessToken]);

  useEffect(() => {
    authContextRef.current = {
      ...authContextRef.current,
      accessToken: accessToken || '',
      apiBase: apiBase || '',
      frontBase: frontBase || '',
      wsBase: wsBase || '',
    };
  }, [accessToken, apiBase, frontBase, wsBase]);

  useEffect(() => {
    showTypeSelectorRef.current = showTypeSelector;
  }, [showTypeSelector]);

  useEffect(() => {
    selectedConversationRef.current = selectedConversation;
  }, [selectedConversation]);

  useEffect(() => {
    try {
      if (Sound && typeof Sound.setCategory === 'function') {
        Sound.setCategory('Playback');
      }
      const asset = Image.resolveAssetSource(require('../assets/beep.mp3'));
      const sourceUri = String(asset?.uri || '');
      if (!sourceUri) return;
      const sound = new Sound(sourceUri, (e) => {
        if (e) console.log('beep load error:', e);
      });
      beepRef.current = sound;
    } catch (error) {
      console.warn('Sound library error:', error);
      beepRef.current = null;
    }
    return () => {
      if (beepRef.current) {
        try {
          beepRef.current.release();
        } catch (e) {
          console.warn('Error releasing sound:', e);
        }
        beepRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        if (Platform.OS === 'ios') {
          const micResult = await request(PERMISSIONS.IOS.MICROPHONE);
          const speechResult = await request(PERMISSIONS.IOS.SPEECH_RECOGNITION);

          console.log('iOS mic permission:', micResult);
          console.log('iOS speech permission:', speechResult);

          setMicGranted(
            micResult === RESULTS.GRANTED &&
            speechResult === RESULTS.GRANTED
          );
        } else {
          const androidResult = await request(PERMISSIONS.ANDROID.RECORD_AUDIO);
          console.log('Android mic permission:', androidResult);
          setMicGranted(androidResult === RESULTS.GRANTED);
        }
      } catch (error) {
        console.log('Permission request error:', error);
        setMicGranted(false);
      }
    })();
  }, []);

  useEffect(() => {
    Voice.onSpeechStart = (event) => {
      console.log('Voice.onSpeechStart:', event);
    };

    Voice.onSpeechRecognized = (event) => {
      console.log('Voice.onSpeechRecognized:', event);
    };

    Voice.onSpeechEnd = (event) => {
      console.log('Voice.onSpeechEnd:', event);
      setRecording(false);
    };

    Voice.onSpeechResults = (event) => {
      console.log('Voice.onSpeechResults:', event);
      const text = event?.value?.[0] || '';
      if (text) {
        console.log('Final speech text:', text);
        setMessage(text);
      }
    };

    Voice.onSpeechPartialResults = (event) => {
      console.log('Voice.onSpeechPartialResults:', event);
      const text = event?.value?.[0] || '';
      if (text) {
        console.log('Partial speech text:', text);
        setMessage(text);
      }
    };

    Voice.onSpeechError = (event) => {
      console.log('Voice.onSpeechError:', JSON.stringify(event));
      setRecording(false);
    };

    return () => {
      Voice.destroy().then(() => {
        Voice.removeAllListeners();
        console.log('Voice listeners removed');
      });
    };
  }, []);

  const authHeaders = useMemo(() => createAuthHeaders(accessToken), [accessToken]);

  const endpoints = useMemo(() => createChatEndpoints(apiBase), [apiBase]);

  const attachmentBase = useMemo(() => normalizeAttachmentBase(apiBase), [apiBase]);
  const withApiBase = (url) =>
    url && !String(url).startsWith('http') ? `${apiBase}${url}` : url;
  const withFrontBase = (url) => {
    const base = frontBase || apiBase;
    return url && !String(url).startsWith('http') ? `${base}${url}` : url;
  };

  const normalizeList = (input) => {
    if (Array.isArray(input)) return input;
    if (Array.isArray(input?.data)) return input.data;
    if (Array.isArray(input?.results)) return input.results;
    if (Array.isArray(input?.conversations)) return input.conversations;
    return [];
  };

  const transformMessages = (items) =>
    normalizeList(items).map((msg) => {
      if (msg?.metadata && !msg.ai_data) {
        return {
          ...msg,
          ai_data: {
            sql: msg.metadata.sql,
            results: msg.metadata.results,
            export_url: msg.metadata.export_url,
            pdf_url: msg.metadata.pdf_url,
            error: msg.metadata.error,
          },
        };
      }
      return msg;
    });
  const activeConversations = conversations.filter(
    (c) => c.status !== 'closed' && c.status !== 'resolved'
  );

  const ensureAuthenticated = async () => {
    if (accessTokenRef.current) return true;
    try {
      const hydrated = await authBootstrapRef.current;
      return hydrated || !!accessTokenRef.current;
    } catch (error) {
      console.warn('Auth bootstrap failed:', error);
      return false;
    }
  };

  const ensureChatContext = async () => {
    try {
      await authBootstrapRef.current;
    } catch (error) {
      console.warn('Auth bootstrap failed while preparing chat context:', error);
    }
    await ensureAuthenticated();
    const context = authContextRef.current || {};
    const token = context.accessToken || accessTokenRef.current || '';
    const resolvedApiBase = normalizeBaseUrl(context.apiBase || apiBase || '');
    const resolvedEndpoints = createChatEndpoints(resolvedApiBase);
    if (!token || !resolvedEndpoints) {
      return null;
    }
    return {
      accessToken: token,
      apiBase: resolvedApiBase,
      endpoints: resolvedEndpoints,
      authHeaders: createAuthHeaders(token),
    };
  };

  useEffect(() => {
    if (waitingForAI && selectedConversation && accessToken && endpoints) {
      const pollForAIResponse = async () => {
        try {
          const url = endpoints.conversationHistory(selectedConversation.id);
          const res = await fetch(url, {
            method: 'GET',
            headers: authHeaders,
          });
          if (!res.ok) {
            const text = await res.text();
            console.warn('AI polling failed:', res.status, url, text.slice(0, 200));
            return;
          }
          const rawData = await parseJsonSafe(res, url);
          const data = transformMessages(rawData || []);
          const hasAIResponse = data.some(
            (m) =>
              (m.sender_type === 'ai' || m.sender_type === 'bot') &&
              !messages.some((existing) => existing.id === m.id)
          );

          if (hasAIResponse) {
            const aiMessages = data.filter((m) => m.sender_type === 'ai' || m.sender_type === 'bot');
            const latestAi = aiMessages[aiMessages.length - 1];
            if (latestAi) {
              console.log('AI polling response:', latestAi);
            }
            setMessages(data);
            setWaitingForAI(false);
          }
        } catch (error) {
          console.error('Polling error:', error);
        }
      };

      aiPollingRef.current = setInterval(pollForAIResponse, 3000);
      pollForAIResponse();

      return () => {
        if (aiPollingRef.current) {
          clearInterval(aiPollingRef.current);
          aiPollingRef.current = null;
        }
      };
    }
  }, [waitingForAI, selectedConversation?.id, accessToken, messages, authHeaders, endpoints]);


  useEffect(() => {
    if (selectedConversation && wsBase) {
      console.log('Chat WebSocket base:', wsBase, 'conversation:', selectedConversation.id);
      connectWebSocket(selectedConversation.id);
    } else if (selectedConversation && !wsBase) {
      console.warn('Chat WebSocket base missing for conversation:', selectedConversation.id);
    }
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [selectedConversation, wsBase]);

  const connectWebSocket = (conversationId) => {
    try {
      if (!wsBase) return;
      const wsUrl = `${wsBase}/ws/chat/${conversationId}/`;
      console.log('Chat WebSocket connect:', wsUrl);
      const ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        console.log('Chat WebSocket connected');
        setWsConnected(true);
      };
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'chat_message' && data.message) {
            const msg = data.message;
            if (msg.sender_type === 'ai' || msg.sender_type === 'bot') {
              console.log('AI WebSocket response:', msg);
            }
            const newMessage = {
              id: msg.id,
              conversation: msg.conversation || msg.conversation_id,
              sender_type: msg.sender_type,
              sender_name: msg.sender_name,
              content: msg.content,
              message_type: msg.message_type,
              metadata: msg.metadata,
              created_at: msg.created_at,
              is_read: msg.is_read,
              ai_feedback: msg.ai_feedback,
              attachments: msg.attachments || [],
              ai_data: msg.metadata ? {
                sql: msg.metadata.sql,
                results: msg.metadata.results_summary || msg.metadata.results,
                export_url: msg.metadata.export_url,
                pdf_url: msg.metadata.pdf_url,
                error: msg.metadata.error,
              } : undefined,
            };

            setMessages((prev) => {
              const isAIResponse = msg.sender_type === 'ai' || msg.sender_type === 'bot';
              if (isAIResponse) setWaitingForAI(false);

              const withoutThinking = isAIResponse
                ? prev.filter((m) => !String(m.id || '').startsWith('thinking-'))
                : prev;

              const tempIndex = withoutThinking.findIndex(
                (m) => String(m.id || '').startsWith('temp-') &&
                  m.content === msg.content &&
                  m.sender_type === 'client'
              );

              if (tempIndex >= 0) {
                const tempMsg = withoutThinking[tempIndex];
                const messageToUse = {
                  ...newMessage,
                  attachments: (msg.attachments && msg.attachments.length > 0)
                    ? msg.attachments
                    : (tempMsg.attachments || []),
                };
                return [
                  ...withoutThinking.slice(0, tempIndex),
                  messageToUse,
                  ...withoutThinking.slice(tempIndex + 1),
                ];
              }

              const existingIndex = withoutThinking.findIndex((m) => m.id === msg.id);
              if (existingIndex >= 0) {
                const existingMsg = withoutThinking[existingIndex];
                const hasNewAttachments = msg.attachments && msg.attachments.length > 0;
                const existingHasAttachments = existingMsg.attachments && existingMsg.attachments.length > 0;
                const existingArePreview = existingHasAttachments &&
                  existingMsg.attachments?.some((a) => {
                    const fileUrl = String(a?.file_url || '');
                    return fileUrl.startsWith('file:') || fileUrl.startsWith('content:');
                  });

                if (hasNewAttachments && (!existingHasAttachments || existingArePreview ||
                  JSON.stringify(existingMsg.attachments) !== JSON.stringify(msg.attachments))) {
                  return [
                    ...withoutThinking.slice(0, existingIndex),
                    newMessage,
                    ...withoutThinking.slice(existingIndex + 1),
                  ];
                }
                return withoutThinking;
              }
              return [...withoutThinking, newMessage];
            });

            setTimeout(() => forceUpdate({}), 10);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };
      ws.onerror = (e) => {
        console.warn('Chat WebSocket error:', e?.message || e);
        setWsConnected(false);
      };
      ws.onclose = (e) => {
        console.warn('Chat WebSocket closed:', e?.code, e?.reason);
        setWsConnected(false);
      };
      wsRef.current = ws;
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
    }
  };

  useEffect(() => {
    if (!isOpen || !endpoints) return;
    let cancelled = false;

    (async () => {
      const authenticated = await ensureAuthenticated();
      if (!cancelled && authenticated) {
        loadConversations();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, endpoints]);

  useEffect(() => {
    if (!selectedConversation || !endpoints) {
      if (!selectedConversation && loadedConversationRef.current !== null) {
        setMessages([]);
        loadedConversationRef.current = null;
      }
      return;
    }

    let cancelled = false;

    (async () => {
      const authenticated = await ensureAuthenticated();
      if (!cancelled && authenticated && loadedConversationRef.current !== selectedConversation.id) {
        loadedConversationRef.current = selectedConversation.id;
        loadMessages(selectedConversation.id);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedConversation?.id, endpoints]);

  useEffect(() => {
    messagesEndRef.current?.scrollToEnd?.({ animated: true });
  }, [messages, sending, uploadingAttachments]);

  useEffect(() => {
    if (!selectedConversation || selectedConversation.conversation_type !== 'ai') return;
    const aiMessages = messages.filter(
      (m) => (m.sender_type === 'ai' || m.sender_type === 'bot') && !String(m.id || '').startsWith('thinking-')
    );
    if (aiMessages.length === 0) return;
    const latest = aiMessages[aiMessages.length - 1];
    if (!latest?.id || latest.id === typingMessageId) return;
    if (typingIntervalRef.current) {
      clearInterval(typingIntervalRef.current);
      typingIntervalRef.current = null;
    }
    const fullText = String(latest.content || '');
    setTypingMessageId(latest.id);
    setTypedText('');
    if (!fullText) return;
    let index = 0;
    const totalDurationMs = 3000;
    const tickMs = 30;
    const steps = Math.max(1, Math.ceil(totalDurationMs / tickMs));
    const charsPerTick = Math.max(1, Math.ceil(fullText.length / steps));
    typingIntervalRef.current = setInterval(() => {
      index += charsPerTick;
      if (index >= fullText.length) {
        setTypedText(fullText);
        clearInterval(typingIntervalRef.current);
        typingIntervalRef.current = null;
        return;
      }
      setTypedText(fullText.slice(0, index));
    }, tickMs);
  }, [messages, selectedConversation?.conversation_type, typingMessageId]);

  useEffect(() => () => {
    if (typingIntervalRef.current) {
      clearInterval(typingIntervalRef.current);
      typingIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    const feedbackMap = {};
    messages.forEach((msg) => {
      if (msg?.ai_feedback === 'positive' || msg?.ai_feedback === 'negative') {
        feedbackMap[msg.id] = msg.ai_feedback;
      }
    });
    if (Object.keys(feedbackMap).length > 0) {
      setAiFeedbackMap((prev) => ({ ...prev, ...feedbackMap }));
    }
  }, [messages]);

const loadConversations = async () => {
  try {
    const chatContext = await ensureChatContext();
    if (!chatContext) return;
    const { endpoints: resolvedEndpoints, authHeaders: resolvedAuthHeaders } = chatContext;

    setLoadingConversations(true);
    const res = await fetch(resolvedEndpoints.conversations, {
      method: 'GET',
      headers: resolvedAuthHeaders,
    });

    if (!res.ok) {
      const text = await res.text();
      console.warn('loadConversations failed:', res.status, resolvedEndpoints.conversations, text.slice(0, 300));
      setConversations([]);
      return;
    }

    const data = await parseJsonSafe(res, resolvedEndpoints.conversations);
    setConversations(normalizeList(data));
  } catch (error) {
    console.error('Failed to load conversations:', error);
    setConversations([]);
     navigation.navigate('Login');
          Alert.alert(
            'Authentication Error',
            'Your session has expired. Please log in again.');
  } finally {
    setLoadingConversations(false);
  }
};

const loadMessages = async (conversationId) => {
  try {
    const chatContext = await ensureChatContext();
    if (!chatContext) return;
    const { endpoints: resolvedEndpoints, authHeaders: resolvedAuthHeaders } = chatContext;

    const url = resolvedEndpoints.conversationHistory(conversationId);
    const res = await fetch(url, {
      method: 'GET',
      headers: resolvedAuthHeaders,
    });

    if (!res.ok) {
      const text = await res.text();
      console.warn('loadMessages failed:', res.status, url, text.slice(0, 300));
      return;
    }

    const rawData = await parseJsonSafe(res, url);
    const data = transformMessages(rawData || []);

    if (loadedConversationRef.current === conversationId) {
      setMessages(data);
    }
  } catch (error) {
    console.error('Failed to load messages:', error);
     navigation.navigate('Login');
          Alert.alert(
            'Authentication Error',
            'Your session has expired. Please log in again.');
  }
};

  const handleFileSelect = (files) => {
    setPendingAttachments((prev) => [...prev, ...files]);
  };

  const handleRemovePendingAttachment = (attachmentId) => {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
  };

  const uploadAttachments = async (messageId) => {
    const chatContext = await ensureChatContext();
    if (!chatContext) return;
    const { accessToken: resolvedToken, endpoints: resolvedEndpoints } = chatContext;
    for (const attachment of pendingAttachments) {
      try {
        const formData = new FormData();
        formData.append('file', {
          uri: attachment.file.uri,
          name: attachment.file.name,
          type: attachment.file.type,
        });
        formData.append('message_id', messageId);

        const uploadHeaders = { accept: 'application/json', access_token: resolvedToken || '' };
        if (resolvedToken) uploadHeaders.Authorization = `Bearer ${resolvedToken}`;
        await fetch(resolvedEndpoints.uploadAttachment, {
          method: 'POST',
          headers: uploadHeaders,
          body: formData,
        });
      } catch (error) {
        console.error('Failed to upload attachment:', attachment.file.name, error);
      }
    }
    if (selectedConversation?.id) {
      loadMessages(selectedConversation.id);
    }
  };

  const handleSendMessage = async (overrideText) => {
    const safeOverride = typeof overrideText === 'string' ? overrideText : undefined;
    const trimmedText = String(safeOverride ?? messageRef.current ?? message).trim();
    if ((!trimmedText && pendingAttachments.length === 0) || sending) return;

    const chatContext = await ensureChatContext();
    if (!chatContext) return;
    const { authHeaders: resolvedAuthHeaders, endpoints: resolvedEndpoints } = chatContext;

    const hasAttachments = pendingAttachments.length > 0;
    const messageContent = trimmedText || (hasAttachments ? `📎 ${pendingAttachments.length} file(s)` : '');

    try {
      setSending(true);

      if (!selectedConversation) {
        setShowTypeSelector(true);
        pendingTypeMessageRef.current = messageContent;
        setMessage('');
        return;
      }

      setMessage('');
      setUploadingAttachments(hasAttachments);

      if (selectedConversation.conversation_type === 'ai') {
        const optimisticMessage = {
          id: `temp-${Date.now()}`,
          conversation: selectedConversation.id,
          sender_type: 'client',
          sender_name: userName || 'You',
          content: messageContent,
          message_type: 'text',
          created_at: new Date().toISOString(),
          is_read: false,
        };

        setMessages((prev) => [...prev, optimisticMessage]);

        const thinkingMessage = {
          id: `thinking-${Date.now()}`,
          conversation: selectedConversation.id,
          sender_type: 'agent',
          sender_name: 'AI Assistant',
          content: 'AI Agent is thinking...',
          message_type: 'text',
          created_at: new Date().toISOString(),
          is_read: true,
        };

        setTimeout(() => {
          setMessages((prev) => [...prev, thinkingMessage]);
          setWaitingForAI(true);
        }, 300);

        if (wsRef.current?.readyState === 1) {
          console.log('AI send via WebSocket:', selectedConversation.id);
          wsRef.current.send(JSON.stringify({
            type: 'chat_message',
            content: messageContent,
            message_type: 'text',
          }));
        } else {
          console.warn('WebSocket not connected for AI send:', wsRef.current?.readyState, {
            wsBase,
            conversationId: selectedConversation.id,
            wsUrl: wsBase ? `${wsBase}/ws/chat/${selectedConversation.id}/` : '',
          });
          setMessages((prev) => prev.filter((m) => m.id !== optimisticMessage.id && m.id !== thinkingMessage.id));
          setWaitingForAI(false);
        }
      } else {
        const optimisticMessage = {
          id: `temp-${Date.now()}`,
          conversation: selectedConversation.id,
          sender_type: 'client',
          sender_name: userName || 'You',
          content: messageContent,
          message_type: 'text',
          created_at: new Date().toISOString(),
          is_read: false,
          attachments: hasAttachments ? pendingAttachments.map((a) => ({
            id: a.id,
            file_name: a.file.name,
            file_type: 'other',
            file_size: a.file.size,
            file_url: a.preview || '',
            mime_type: a.file.type,
            uploaded_at: new Date().toISOString(),
          })) : undefined,
        };

        setMessages((prev) => [...prev, optimisticMessage]);

        const res = await fetch(resolvedEndpoints.sendMessage(selectedConversation.id), {
          method: 'POST',
          headers: resolvedAuthHeaders,
          body: JSON.stringify({ content: messageContent, message_type: 'text' }),
        });
        const sentMessage = await res.json();
        if (hasAttachments && sentMessage && sentMessage.id) {
          await uploadAttachments(sentMessage.id);
        }

        setPendingAttachments([]);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setSending(false);
      setUploadingAttachments(false);
    }
  };
  const startRecording = async () => {
    console.log('startRecording called');

    if (!micGranted) {
      console.log('Microphone/Speech permission not granted');
      Alert.alert(
        'Permission Required',
        'Enable microphone and speech recognition access in settings to use voice chat.'
      );
      return;
    }

    if (recording) {
      console.log('Already recording');
      return;
    }

    try {
      const beep = beepRef.current;
      if (beep && typeof beep.stop === 'function') {
        try {
          beep.stop(() => {
            try {
              console.log('Beep stopped, playing again');
              if (beep && typeof beep.play === 'function') {
                beep.play((success) => {
                  console.log('Beep play success:', success);
                });
              }
            } catch (e) {
              console.warn('Error playing beep:', e);
            }
          });
        } catch (e) {
          console.warn('Error stopping beep:', e);
        }
      }

      console.log('Starting voice recognition...');
      setRecording(true);
      await Voice.start('en-US');
      console.log('Voice.start success');
    } catch (error) {
      console.log('Voice.start error:', error);
      setRecording(false);
    }
  };

  const stopRecording = async () => {
    console.log('stopRecording called');

    if (!recording) {
      console.log('Not recording, skip stop');
      return;
    }

    try {
      voiceAutoSendRef.current = true;
      await Voice.stop();
      console.log('Voice.stop success');
    } catch (error) {
      console.log('Voice.stop error:', error);
    } finally {
      setRecording(false);
    }

    setTimeout(() => {
      if (!voiceAutoSendRef.current) return;
      voiceAutoSendRef.current = false;

      const latestText = String(messageRef.current || '').trim();
      console.log('Auto send latestText:', latestText);

      if (!latestText) return;

      const needsTypeSelection =
        showTypeSelectorRef.current || !selectedConversationRef.current;

      if (needsTypeSelection) {
        pendingTypeMessageRef.current = latestText;
        setShowTypeSelector(true);
        return;
      }

      handleSendMessage(latestText);
    }, 350);
  };

  const handleTypeSelection = async (type) => {
    try {
      const chatContext = await ensureChatContext();
      console.log('handleTypeSelection accessToken and endpoints:', chatContext?.accessToken, chatContext?.endpoints);
      if (!chatContext) return;
      const { endpoints: resolvedEndpoints, authHeaders: resolvedAuthHeaders } = chatContext;
      const messageContent = (pendingTypeMessageRef.current || message).trim();
      setSending(true);

      console.log('Chat createConversation URL:', resolvedEndpoints.createConversation);
      const res = await fetch(resolvedEndpoints.createConversation, {
        method: 'POST',
        headers: resolvedAuthHeaders,
        body: JSON.stringify({
          subject: type === 'ai' ? 'AI Query' : 'Support Request',
          content: messageContent,
          conversation_type: type,
        }),
      });
      const rawConversation = await parseJsonSafe(res, resolvedEndpoints.createConversation);
      const conversation =
        rawConversation?.conversation ||
        rawConversation?.data ||
        rawConversation?.result ||
        rawConversation;
      const conversationId = conversation?.id || rawConversation?.id;
      if (!conversationId) {
        console.warn('Chat createConversation missing id:', rawConversation);
      }

      const updatedRes = await fetch(resolvedEndpoints.conversations, {
        method: 'GET',
        headers: resolvedAuthHeaders,
      });
      const updatedConversations = await parseJsonSafe(updatedRes, resolvedEndpoints.conversations);
      const list = normalizeList(updatedConversations);
      setConversations(list);
      const newConv = list.find((c) => String(c.id) === String(conversationId));
      if (newConv || conversationId) {
        const fallbackConv = newConv || {
          id: conversationId,
          subject: conversation?.subject || (type === 'ai' ? 'AI Query' : 'Support Request'),
          status: conversation?.status || 'open',
          created_at: conversation?.created_at || new Date().toISOString(),
          last_message_at: conversation?.last_message_at || new Date().toISOString(),
          message_count: conversation?.message_count ?? 0,
          conversation_type: conversation?.conversation_type || type,
        };
        setSelectedConversation(fallbackConv);
        const msgsRes = await fetch(resolvedEndpoints.conversationHistory(conversationId), {
          method: 'GET',
          headers: resolvedAuthHeaders,
        });
        const msgs = await parseJsonSafe(msgsRes, resolvedEndpoints.conversationHistory(conversationId));
        setMessages(transformMessages(msgs || []));
        if (!newConv && conversationId) {
          setConversations((prev) => [fallbackConv, ...prev]);
        }
      }

      setShowTypeSelector(false);
      setMessage('');
      pendingTypeMessageRef.current = '';
    } catch (error) {
      console.error('Failed to create conversation:', error);
        navigation.navigate('Login');
          Alert.alert(
            'Authentication Error',
            'Your session has expired. Please log in again.');
    } finally {
      setSending(false);
    }
  };

  const handleSwitchAgent = async () => {
    if (!selectedConversation) return;

    try {
      const chatContext = await ensureChatContext();
      if (!chatContext) return;
      const { endpoints: resolvedEndpoints, authHeaders: resolvedAuthHeaders } = chatContext;
      setSwitchingAgent(true);
      const newType = selectedConversation.conversation_type === 'ai' ? 'support' : 'ai';
      const res = await fetch(resolvedEndpoints.switchAgent(selectedConversation.id), {
        method: 'POST',
        headers: resolvedAuthHeaders,
        body: JSON.stringify({ agent_type: newType }),
      });
      const data = await parseJsonSafe(res, resolvedEndpoints.switchAgent(selectedConversation.id));
      if (!res.ok) {
        throw new Error(data?.detail || 'Failed to switch agent');
      }

      const updatedConv = {
        ...selectedConversation,
        conversation_type: newType,
        subject: data?.subject || selectedConversation.subject,
        chat_display_name: data?.chat_display_name || selectedConversation.chat_display_name,
      };
      setSelectedConversation(updatedConv);
      setConversations((prev) =>
        prev.map((c) => (String(c.id) === String(selectedConversation.id) ? updatedConv : c))
      );

      const msgsRes = await fetch(resolvedEndpoints.conversationHistory(selectedConversation.id), {
        method: 'GET',
        headers: resolvedAuthHeaders,
      });
      const msgs = await parseJsonSafe(msgsRes, resolvedEndpoints.conversationHistory(selectedConversation.id));
      setMessages(transformMessages(msgs || []));
      setWaitingForAI(false);
    } catch (error) {
      console.error('Failed to switch agent:', error);
    } finally {
      setSwitchingAgent(false);
    }
  };

  const handleSubmitRating = async () => {
    if (!selectedConversation || selectedRating === 0) return;
    try {
      const chatContext = await ensureChatContext();
      if (!chatContext) return;
      const { endpoints: resolvedEndpoints, authHeaders: resolvedAuthHeaders } = chatContext;
      setSubmittingRating(true);
      const res = await fetch(resolvedEndpoints.submitRating(selectedConversation.id), {
        method: 'POST',
        headers: resolvedAuthHeaders,
        body: JSON.stringify({ rating: selectedRating, comment: ratingComment }),
      });
      const data = await parseJsonSafe(res, resolvedEndpoints.submitRating(selectedConversation.id));
      if (!res.ok) {
        throw new Error(data?.detail || 'Failed to submit rating');
      }

      const updatedConv = {
        ...selectedConversation,
        rating: selectedRating,
        rating_identifier: 'client_rated',
        status: 'resolved',
      };
      setSelectedConversation(updatedConv);
      setConversations((prev) =>
        prev.map((c) => (String(c.id) === String(selectedConversation.id) ? updatedConv : c))
      );
      setSelectedRating(0);
      setRatingComment('');
    } catch (error) {
      console.error('Failed to submit rating:', error);
    } finally {
      setSubmittingRating(false);
    }
  };

  const handleAIFeedback = async (messageId, feedback) => {
    if (submittingAIFeedbackId === messageId) return;
    try {
      const chatContext = await ensureChatContext();
      if (!chatContext) return;
      const { endpoints: resolvedEndpoints, authHeaders: resolvedAuthHeaders } = chatContext;
      setSubmittingAIFeedbackId(messageId);
      const res = await fetch(resolvedEndpoints.submitAIFeedback(messageId), {
        method: 'POST',
        headers: resolvedAuthHeaders,
        body: JSON.stringify({ feedback, comment: '' }),
      });
      const data = await parseJsonSafe(res, resolvedEndpoints.submitAIFeedback(messageId));
      if (!res.ok) {
        throw new Error(data?.detail || 'Failed to submit feedback');
      }
      setAiFeedbackMap((prev) => ({ ...prev, [messageId]: feedback }));
    } catch (error) {
      console.error('Failed to submit AI feedback:', error);
    } finally {
      setSubmittingAIFeedbackId(null);
    }
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const formatShortDate = (dateString) => {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const EXPORT_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const PDF_MIME = 'application/pdf';

  const getExportMeta = (url) => {
    const lower = String(url || '').toLowerCase();
    if (lower.endsWith('.pdf')) return { mime: PDF_MIME, fallbackExt: 'pdf' };
    return { mime: EXPORT_MIME, fallbackExt: 'xlsx' };
  };

  const downloadExport = async (url) => {
    const full = String(url || '');
    if (!full) return null;
    const meta = getExportMeta(full);
    const fileName = getFileNameFromUrl(full, meta.fallbackExt);
    try {
      if (Platform.OS === 'android') {
        const downloadDir = RNBlobUtil.fs.dirs.DownloadDir;
        const path = `${downloadDir}/${fileName}`;
        await RNBlobUtil.config({
          addAndroidDownloads: {
            useDownloadManager: true,
            notification: true,
            path,
            title: fileName,
            description: 'Downloading export',
            mime: meta.mime,
            mediaScannable: true,
          },
        }).fetch('GET', full);
        return path;
      }
      const path = `${RNBlobUtil.fs.dirs.DocumentDir}/${fileName}`;
      const res = await RNBlobUtil.config({ path, fileCache: true }).fetch('GET', full);
      return res.path();
    } catch (error) {
      console.warn('Export download failed:', error);
      return null;
    }
  };

  const openLocalExport = async (path, mime) => {
    if (!path) return;
    const localPath = String(path);
    const fileUrl = localPath.startsWith('file://') ? localPath : `file://${localPath}`;
    try {
      if (Platform.OS === 'ios') {
        // For iOS, use Share API to properly open file:// URLs
        await Share.share({
          url: fileUrl,
          message: 'Exported File',
        }).catch((error) => {
          if (error.message !== 'User did not share') {
            console.warn('Share failed:', error);
          }
        });
      } else if (Platform.OS === 'android') {
        // For Android, use RNBlobUtil
        const filePath = localPath.startsWith('file://') ? localPath.substring(7) : localPath;
        if (RNBlobUtil.android?.actionViewIntent) {
          await RNBlobUtil.android.actionViewIntent(filePath, mime || EXPORT_MIME);
        } else {
          await Linking.openURL(fileUrl);
        }
      }
    } catch (error) {
      console.warn('Open export failed:', error);
    }
  };

  const handleExportPress = async (url, { useBaseUrl = true } = {}) => {
    const full = useBaseUrl ? withFrontBase(url) : String(url || '');
    console.log("full url:",full);
    if (!full) return;
    const meta = getExportMeta(full);
    const existing = downloadedExports[full];
    if (existing) {
      const exists = await RNBlobUtil.fs.exists(existing);
      if (exists) {
        await openLocalExport(existing, meta.mime);
        return;
      }
      setDownloadedExports((prev) => {
        const next = { ...prev };
        delete next[full];
        return next;
      });
    }
    try {
      setDownloadingUrls((prev) => ({ ...prev, [full]: true }));
      const path = await downloadExport(full);
      if (path) {
        setDownloadedExports((prev) => ({ ...prev, [full]: path }));
      }
    } finally {
      setDownloadingUrls((prev) => {
        const next = { ...prev };
        delete next[full];
        return next;
      });
    }
  };

  // if (!isAuthenticated) {
  //   console.warn('[Chat] FAB hidden because chatai_access is missing. Check chat login response and AsyncStorage.');
  //   return null;
  // }

  const hasFeedbackRequest = messages.some(
    (msg) => msg.message_type === 'system' && msg.metadata && msg.metadata.type === 'feedback_request'
  );

  const shouldShowFeedback = hasFeedbackRequest;
  const inputBlocked = shouldShowFeedback && selectedConversation && !selectedConversation?.rating;

  return (
    <SafeAreaView
        pointerEvents="box-none"
        edges={["left", "right"]}
        style={[styles.overlayRoot, style]}
      >
      {!isOpen && accessToken && (
        <TouchableOpacity
             activeOpacity={0.85}
           style={[styles.createFab, { bottom: 16 + insets.bottom }, buttonStyle]}
          onPress={() => setIsOpen(true)}
        >
          <Icon name="support-agent" size={30} color="#fff" />
        </TouchableOpacity>
      )}
      <Modal visible={isOpen} transparent animationType="slide" onRequestClose={() => setIsOpen(false)}>
        <View style={styles.backdrop} />
        <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', android: undefined })} style={styles.sheetWrap}>
          <View style={[styles.sheet, { height: sheetHeight }]}>
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <View style={styles.headerIcon}>
                  <Icon
                    name={selectedConversation?.conversation_type === 'ai' ? 'smart-toy' : 'support-agent'}
                    size={20}
                    color="#fff"
                  />
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.headerTitle}>
                  {selectedConversation?.conversation_type === 'ai' ? "AI Agent" : 'Support Chat'}
                </Text>
                <Text style={styles.headerSubtitle}>{userName}</Text>
              </View>
              <View style={styles.headerActions}>
                {selectedConversation && (
                  <TouchableOpacity
                    style={styles.headerBtn}
                    onPress={() => {
                      setSelectedConversation(null);
                      setMessages([]);
                      setShowTypeSelector(false);
                      setWaitingForAI(false);
                    }}
                  >
                    <Text style={styles.headerBtnText}>Dashboard</Text>
                  </TouchableOpacity>
                )}
                {selectedConversation && (
                  <TouchableOpacity
                    style={[styles.headerBtn, switchingAgent && styles.headerBtnDisabled]}
                    onPress={handleSwitchAgent}
                    disabled={switchingAgent}
                  >
                    <Text style={styles.headerBtnText}>Switch</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.headerBtn} onPress={() => setIsOpen(false)}>
                  <Text style={styles.headerBtnText}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.messagesPanel}>
              {showTypeSelector ? (
                <ConversationTypeSelector
                  onSelect={handleTypeSelection}
                  onCancel={() => {
                    setShowTypeSelector(false);
                    setMessage('');
                    setSending(false);
                  }}
                />
              ) : !selectedConversation ? (
                <ScrollView contentContainerStyle={styles.emptyWrap}>
                  {loadingConversations ? (
                    <View style={styles.emptyLoaderWrap}>
                      
                      <ActivityIndicator size="large" color="#319241" />
                    </View>
                  ) : activeConversations.length > 0 ? (
                    <View style={{ gap: 10 }}>
                      {activeConversations.map((conv) => (
                          <TouchableOpacity
                            key={conv.id}
                            style={styles.conversationCard}
                            onPress={() => setSelectedConversation(conv)}
                          >
                            <View style={styles.conversationRow}>
                              <View style={styles.conversationIcon}>
                                <Icon
                                  name={conv.conversation_type === 'ai' ? 'smart-toy' : 'support-agent'}
                                  size={22}
                                  color={conv.conversation_type === 'ai' ? '#5B21B6' : '#0F8B65'}
                                />
                              </View>
                              <View style={styles.conversationBody}>
                                <View style={styles.conversationHeaderRow}>
                                  <Text style={styles.conversationTitle} numberOfLines={1}>
                                    {conv.subject || 'Support Request'}
                                  </Text>
                                  <View
                                    style={[
                                      styles.conversationBadge,
                                      conv.conversation_type === 'ai'
                                        ? styles.conversationBadgeAi
                                        : styles.conversationBadgeSupport,
                                    ]}
                                  >
                                    <Text style={styles.conversationBadgeText}>
                                      {conv.conversation_type === 'ai' ? 'AI Agent' : 'Support'}
                                    </Text>
                                  </View>
                                </View>
                                <Text style={styles.conversationMeta}>
                                  {conv.message_count} messages · {formatShortDate(conv.last_message_at || conv.created_at)}
                                </Text>
                              </View>
                            </View>
                          </TouchableOpacity>
                        ))}
                      <TouchableOpacity
                        style={styles.startBtn}
                        onPress={() => {
                          setSelectedConversation(null);
                          setMessages([]);
                          setShowTypeSelector(true);
                          setWaitingForAI(false);
                        }}
                      >
                        <View style={styles.startBtnIcon}>
                          <Icon name="add-circle" size={18} color="#fff" />
                        </View>
                        <Text style={styles.startBtnText}>Start New Conversation</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={{ gap: 12 }}>
                      <View style={styles.emptyLoaderWrap}>
                        <Text style={styles.emptyTitle}>Start a conversation</Text>
                        <Text style={styles.emptyText}>No active conversations found.</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.startBtn}
                        onPress={() => {
                          setSelectedConversation(null);
                          setMessages([]);
                          setShowTypeSelector(true);
                          setWaitingForAI(false);
                        }}
                      >
                        <View style={styles.startBtnIcon}>
                          <Icon name="add-circle" size={18} color="#fff" />
                        </View>
                        <Text style={styles.startBtnText}>Start New Conversation</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </ScrollView>
              ) : (
                <ScrollView
                  ref={messagesEndRef}
                  contentContainerStyle={{ paddingVertical: 8 }}
                  showsVerticalScrollIndicator={false}
                >
                  {messages.map((msg) => {
                    const isClient = msg.sender_type === 'client';
                    const isAI = (msg.sender_type === 'bot' || msg.sender_type === 'ai') &&
                      selectedConversation?.conversation_type === 'ai';
                    const isThinking = String(msg.id || '').startsWith('thinking-');
                    const isSystemFeedback = msg.message_type === 'system' && msg.metadata && msg.metadata.type === 'feedback_request';
                    const showAIFeedback =
                      selectedConversation?.conversation_type === 'ai' &&
                      (msg.sender_type === 'bot' || msg.sender_type === 'ai') &&
                      !isThinking &&
                      !isSystemFeedback &&
                      msg.sender_type !== 'system';
                    const selectedAIFeedback = aiFeedbackMap[msg.id];
                    if (isSystemFeedback && shouldShowFeedback && !selectedConversation?.rating) {
                      return (
                        <View key={msg.id} style={styles.feedbackWrap}>
                          <View style={styles.feedbackCard}>
                            <Text style={styles.feedbackTitle}>Share your feedback</Text>
                            <Text style={styles.feedbackText}>
                              Your rating will close and resolve this conversation.
                            </Text>
                            <View style={styles.feedbackStars}>
                              {[1, 2, 3, 4, 5].map((star) => (
                                <TouchableOpacity
                                  key={star}
                                  onPress={() => setSelectedRating(star)}
                                  style={styles.feedbackStarBtn}
                                >
                                  <Text style={[
                                    styles.feedbackStar,
                                    star <= selectedRating && styles.feedbackStarActive,
                                  ]}>
                                    ★
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                            <TextInput
                              value={ratingComment}
                              onChangeText={setRatingComment}
                              placeholder="Optional: Add a comment..."
                              placeholderTextColor="#9CA3AF"
                              style={styles.feedbackInput}
                              multiline
                            />
                            <TouchableOpacity
                              style={[styles.feedbackSubmit, (selectedRating === 0 || submittingRating) && styles.feedbackSubmitDisabled]}
                              onPress={handleSubmitRating}
                              disabled={selectedRating === 0 || submittingRating}
                            >
                              <Text style={styles.feedbackSubmitText}>
                                {submittingRating ? 'Submitting...' : 'Submit Rating'}
                              </Text>
                            </TouchableOpacity>
                            <Text style={styles.feedbackTime}>{formatTime(msg.created_at)}</Text>
                          </View>
                        </View>
                      );
                    }
                    if (isSystemFeedback && shouldShowFeedback && selectedConversation?.rating) {
                      return (
                        <View key={msg.id} style={styles.feedbackWrap}>
                          <View style={styles.feedbackThanks}>
                            <Text style={styles.feedbackThanksText}>Thank you for your feedback!</Text>
                            <Text style={styles.feedbackResolveText}>
                              This conversation is resolved. Please start a new conversation.
                            </Text>
                            <TouchableOpacity
                              style={styles.feedbackStartBtn}
                              onPress={() => {
                                setSelectedConversation(null);
                                setMessages([]);
                                setShowTypeSelector(true);
                                setWaitingForAI(false);
                              }}
                            >
                              <Text style={styles.feedbackStartBtnText}>Start New Conversation</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    }
                    const exportUrl = withFrontBase(msg.ai_data?.export_url);
                    const pdfUrl = withFrontBase(msg.ai_data?.pdf_url);
                    const isDownloaded = !!(exportUrl && downloadedExports[exportUrl]);
                    const isPdfDownloaded = !!(pdfUrl && downloadedExports[pdfUrl]);
                    return (
                      <View key={msg.id} style={[styles.messageRow, isClient && styles.messageRowRight]}>
                        <View style={[
                          styles.messageBubble,
                          isClient ? styles.clientBubble : styles.otherBubble,
                          isAI && styles.aiBubble,
                        ]}>
                          {isThinking ? (
                            <View style={styles.thinkingRow}>
                              <ActivityIndicator size="small" color="#7c3aed" />
                              <Text style={styles.thinkingText}>AI Agent is thinking...</Text>
                            </View>
                          ) : (
                            renderMessageContent(
                              msg.id === typingMessageId ? { ...msg, content: typedText } : msg,
                              isClient,
                              isAI
                            )
                          )}

                          {msg.attachments && msg.attachments.length > 0 && (
                            <View style={{ marginTop: 8 }}>
                              <AttachmentPreview attachments={msg.attachments} showActions layout="list" baseUrl={attachmentBase} />
                            </View>
                          )}

                          {msg.ai_data?.export_url && msg.ai_data.results?.total_rows > 5 && (
                            <View style={styles.exportCard}>
                              <Text style={styles.exportText}>
                                Download Excel ({msg.ai_data.results?.total_rows?.toLocaleString()} records)
                              </Text>
                              <TouchableOpacity
                                style={[styles.exportBtn, downloadingUrls[exportUrl] && styles.exportBtnDisabled]}
                                onPress={() => handleExportPress(msg.ai_data.export_url)}
                                disabled={downloadingUrls[exportUrl]}
                              >
                                {downloadingUrls[exportUrl] ? (
                                  <>
                                    <ActivityIndicator size="small" color="#fff" />
                                    <Text style={styles.exportBtnText}>Downloading...</Text>
                                  </>
                                ) : (
                                  <>
                                    <Icon name={isDownloaded ? 'open-in-new' : 'download'} size={14} color="#fff" />
                                    <Text style={styles.exportBtnText}>{isDownloaded ? 'Open' : 'Download'}</Text>
                                  </>
                                )}
                              </TouchableOpacity>
                            </View>
                          )}
                           {msg.ai_data?.pdf_url  && (
                            <View style={styles.exportCard}>
                              <Text style={styles.exportText}>
                                Download PDF ({msg.ai_data.results?.total_rows?.toLocaleString()} records)
                              </Text>
                              <TouchableOpacity
                                style={[styles.exportBtn, downloadingUrls[pdfUrl] && styles.exportBtnDisabled]}
                                onPress={() => handleExportPress(msg.ai_data.pdf_url, { useBaseUrl: false })}
                                disabled={downloadingUrls[pdfUrl]}
                              >
                                {downloadingUrls[pdfUrl] ? (
                                  <>
                                    <ActivityIndicator size="small" color="#fff" />
                                    <Text style={styles.exportBtnText}>Downloading...</Text>
                                  </>
                                ) : (
                                  <>
                                    <Icon name={isPdfDownloaded ? 'open-in-new' : 'download'} size={14} color="#fff" />
                                    <Text style={styles.exportBtnText}>{isPdfDownloaded ? 'Open' : 'Download'}</Text>
                                  </>
                                )}
                              </TouchableOpacity>
                            </View>
                          )}

                          <Text style={isClient ? styles.timeTextClient : styles.timeText}>
                            {formatTime(msg.created_at)}
                          </Text>

                          {showAIFeedback && (
                            <View style={styles.aiFeedbackRow}>
                              <TouchableOpacity
                                onPress={() => handleAIFeedback(msg.id, 'positive')}
                                disabled={submittingAIFeedbackId === msg.id || !!selectedAIFeedback}
                                style={[
                                  styles.aiFeedbackBtn,
                                  selectedAIFeedback === 'positive' && styles.aiFeedbackBtnPositive,
                                  selectedAIFeedback && styles.aiFeedbackBtnSelected,
                                ]}
                              >
                                <Icon
                                  name="thumb-up"
                                  size={14}
                                  color={selectedAIFeedback === 'positive' ? '#15803D' : '#6B7280'}
                                />
                                <Text
                                  style={[
                                    styles.aiFeedbackText,
                                    selectedAIFeedback === 'positive' && styles.aiFeedbackTextPositive,
                                  ]}
                                >
                                  Helpful
                                </Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => handleAIFeedback(msg.id, 'negative')}
                                disabled={submittingAIFeedbackId === msg.id || !!selectedAIFeedback}
                                style={[
                                  styles.aiFeedbackBtn,
                                  selectedAIFeedback === 'negative' && styles.aiFeedbackBtnNegative,
                                  selectedAIFeedback && styles.aiFeedbackBtnSelected,
                                ]}
                              >
                                <Icon
                                  name="thumb-down"
                                  size={14}
                                  color={selectedAIFeedback === 'negative' ? '#BE123C' : '#6B7280'}
                                />
                                <Text
                                  style={[
                                    styles.aiFeedbackText,
                                    selectedAIFeedback === 'negative' && styles.aiFeedbackTextNegative,
                                  ]}
                                >
                                  Not helpful
                                </Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>
              )}
            </View>

            <View style={styles.inputWrap}>
              {pendingAttachments.length > 0 && (
                <View style={styles.pendingWrap}>
                  <View style={styles.pendingHeader}>
                    <Text style={styles.pendingTitle}>Attachments ({pendingAttachments.length})</Text>
                    <TouchableOpacity onPress={() => setPendingAttachments([])}>
                      <Text style={styles.pendingClear}>Clear all</Text>
                    </TouchableOpacity>
                  </View>
                  {pendingAttachments.map((att) => (
                    <View key={att.id} style={styles.pendingRow}>
                      <Text numberOfLines={1} style={styles.pendingName}>
                        {att.file.name}
                      </Text>
                      <TouchableOpacity onPress={() => handleRemovePendingAttachment(att.id)}>
                        <Text style={styles.pendingRemove}>Remove</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              <View style={styles.inputRow}>
                {showAttachments && (
                  <AttachmentButton
                    onFileSelect={handleFileSelect}
                    disabled={uploadingAttachments || sending || inputBlocked}
                  />
                )}
                <View style={styles.inputWrapInner}>
                  <TextInput
                    style={[styles.input, styles.inputWithMic]}
                    value={message}
                    onChangeText={setMessage}
                    placeholder="Type your message..."
                    placeholderTextColor="#9CA3AF"
                    editable={!sending && !uploadingAttachments && !inputBlocked}
                    returnKeyType="send"
                    blurOnSubmit={false}
                    onSubmitEditing={() => handleSendMessage()}
                  />
                 <TouchableOpacity
  style={[styles.micIconBtn, recording && styles.micIconBtnActive]}
  onPress={recording ? stopRecording : startRecording}
  disabled={sending || uploadingAttachments}
>
     <Icon name="mic" size={20} color={recording ? '#166534' : '#111'} />
    </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={[styles.sendBtn, (sending || uploadingAttachments) && styles.sendBtnDisabled]}
                  onPress={() => handleSendMessage()}
                  disabled={inputBlocked || (!message.trim() && pendingAttachments.length === 0) || sending || uploadingAttachments}
                >
                  <Text style={styles.sendBtnText}>
                    {uploadingAttachments ? 'Uploading...' : sending ? 'Sending...' : 'Send'}
                  </Text>
                </TouchableOpacity>
              </View>
              {recording && (
                <View style={styles.recordingRow}>
                  <View style={styles.recordingDot} />
                  <Text style={styles.recordingText}>Recording…</Text>
                </View>
              )}
              {!wsConnected && selectedConversation && (
                <Text style={styles.wsStatus}>Reconnecting…</Text>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', bottom: 90, right: 16 },
  overlayRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
  },

  fab: {
    position: 'absolute',
    backgroundColor: '#16A34A',
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
    zIndex: 10000,
  },
  createFab: {
    position: "absolute",
    right: 16,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#319241",
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheetWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  sheet: {
    height: '80%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  header: {
    backgroundColor: '#16A34A',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  headerSubtitle: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },
  headerLeft: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  headerIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  headerBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.15)' },
  headerBtnDisabled: { opacity: 0.6 },
  headerBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  messagesPanel: { flex: 1, backgroundColor: '#F5F5F5' },
  emptyWrap: { paddingVertical: 16, paddingHorizontal: 12, alignItems: 'stretch', justifyContent: 'center' },
  emptyLoaderWrap: { paddingVertical: 32, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#111', marginBottom: 6,textAlign:"center" },
  emptyText: { fontSize: 13, color: '#666', textAlign: 'center' },
  conversationCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#111',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    width: '80%',
    alignSelf: 'center',
  },
  conversationRow: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  conversationIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  conversationBody: { flex: 1 },
  conversationHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  conversationTitle: { fontSize: 17, fontWeight: '700', color: '#111', flex: 1 },
  conversationMeta: { fontSize: 13, color: '#667085', fontWeight: '600', marginTop: 6 },
  conversationBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  conversationBadgeAi: { backgroundColor: '#EDE9FE' },
  conversationBadgeSupport: { backgroundColor: '#DCFCE7' },
  conversationBadgeText: { fontSize: 10, fontWeight: '700', color: '#111' },
  startBtn: {
    backgroundColor: '#16A34A',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    width: '80%',
    alignSelf: 'center',
  },
  startBtnIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  startBtnText: { color: '#fff', fontWeight: '700' },

  messageRow: { flexDirection: 'row', paddingHorizontal: 12, marginBottom: 10 },
  messageRowRight: { justifyContent: 'flex-end' },
  messageBubble: { maxWidth: '85%', borderRadius: 12, padding: 10, backgroundColor: '#fff' },
  clientBubble: { backgroundColor: '#16A34A' },
  otherBubble: { backgroundColor: '#fff' },
  aiBubble: { borderWidth: 1, borderColor: '#E9D5FF', backgroundColor: '#F5F3FF' },
  clientText: { color: '#fff', fontSize: 13 },
  otherText: { color: '#111', fontSize: 13 },
  aiNumberBold: { fontWeight: '700' },
  thinkingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  thinkingText: { color: '#6D28D9', fontSize: 13 },
  timeText: { marginTop: 6, fontSize: 10, color: '#666' },
  timeTextClient: { marginTop: 6, fontSize: 10, color: 'rgba(255,255,255,0.7)' },
  aiFeedbackRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  aiFeedbackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#fff',
  },
  aiFeedbackBtnSelected: { opacity: 0.9 },
  aiFeedbackBtnPositive: { borderColor: '#86EFAC', backgroundColor: '#ECFDF5' },
  aiFeedbackBtnNegative: { borderColor: '#FDA4AF', backgroundColor: '#FFF1F2' },
  aiFeedbackText: { fontSize: 11, color: '#6B7280', fontWeight: '600' },
  aiFeedbackTextPositive: { color: '#166534' },
  aiFeedbackTextNegative: { color: '#9F1239' },

  feedbackWrap: { paddingHorizontal: 12, marginBottom: 10, alignItems: 'center' },
  feedbackCard: {
    width: '100%',
    backgroundColor: '#ECFDF5',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    padding: 12,
  },
  feedbackTitle: { fontSize: 14, fontWeight: '700', color: '#166534', textAlign: 'center' },
  feedbackText: { fontSize: 12, color: '#15803D', textAlign: 'center', marginTop: 4 },
  feedbackStars: { flexDirection: 'row', justifyContent: 'center', marginTop: 10 },
  feedbackStarBtn: { paddingHorizontal: 4 },
  feedbackStar: { fontSize: 26, color: '#D1D5DB' },
  feedbackStarActive: { color: '#F59E0B' },
  feedbackInput: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#fff',
    fontSize: 12,
    color: '#111',
    minHeight: 60,
  },
  feedbackSubmit: {
    marginTop: 10,
    backgroundColor: '#16A34A',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  feedbackSubmitDisabled: { opacity: 0.6 },
  feedbackSubmitText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  feedbackTime: { marginTop: 8, fontSize: 10, color: '#6B7280', textAlign: 'center' },
  feedbackThanks: {
    backgroundColor: '#ECFDF3',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  feedbackThanksText: { fontSize: 12, color: '#166534', fontWeight: '700' },
  feedbackResolveText: { marginTop: 6, fontSize: 11, color: '#15803D' },
  feedbackStartBtn: {
    marginTop: 10,
    backgroundColor: '#16A34A',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  feedbackStartBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  exportCard: {
    marginTop: 8,
    padding: 8,
    backgroundColor: '#EDE9FE',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  exportText: { fontSize: 11, color: '#4C1D95', marginBottom: 6 },
  exportBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#16A34A',
    borderWidth: 1,
    borderColor: '#15803D',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    shadowColor: '#166534',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  exportBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  exportBtnDisabled: { opacity: 0.6 },

  inputWrap: { borderTopWidth: 1, borderTopColor: '#E5E7EB', padding: 10, backgroundColor: '#fff' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inputWrapInner: { flex: 1, position: 'relative' },
  input: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, color: '#111' },
  inputWithMic: { paddingRight: 38 },
  sendBtn: { backgroundColor: '#16A34A', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8 },
  sendBtnDisabled: { opacity: 0.6 },
  sendBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  micIconBtn: {
    position: 'absolute',
    right: 8,
    top: 6,
    bottom: 6,
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  micIconBtnActive: { backgroundColor: '#DCFCE7' },
  recordingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  recordingDot: { width: 8, height: 8, borderRadius: 999, backgroundColor: '#DC2626' },
  recordingText: { fontSize: 11, color: '#DC2626', fontWeight: '600' },
  wsStatus: { marginTop: 6, fontSize: 11, color: '#9CA3AF' },

  typeSelector: {
    padding: 16,
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    margin: 12,
  },
  typeTitle: { textAlign: 'center', fontSize: 16, fontWeight: '700', color: '#111' },
  typeSubtitle: { textAlign: 'center', fontSize: 12, color: '#6B7280' },
  typeCard: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D1FAE5',
    padding: 12,
    backgroundColor: '#ECFDF5',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  typeCardIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeCardBody: { flex: 1 },
  typeCardTitle: { fontSize: 14, fontWeight: '700', color: '#111' },
  typeCardText: { marginTop: 2, fontSize: 12, color: '#4B5563' },
  typeCardAction: {
    backgroundColor: '#16A34A',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  typeCardActionText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  typeBtn: { paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  typeAi: { backgroundColor: '#ECFDF5' },
  typeSupport: { backgroundColor: '#16A34A' },
  typeCancel: { backgroundColor: '#F3F4F6' },
  typeBtnText: { color: '#fff', fontWeight: '700' },
  typeCancelText: { color: '#111', fontWeight: '600' },

  pendingWrap: { marginBottom: 10, backgroundColor: '#F9FAFB', borderRadius: 10, padding: 10, gap: 6 },
  pendingHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pendingTitle: { fontSize: 12, fontWeight: '700', color: '#111' },
  pendingClear: { fontSize: 11, color: '#DC2626' },
  pendingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pendingName: { flex: 1, fontSize: 12, color: '#111', marginRight: 8 },
  pendingRemove: { fontSize: 11, color: '#DC2626' },
});
