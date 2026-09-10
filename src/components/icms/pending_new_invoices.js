import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  Image,
  ScrollView,
  Dimensions,
  Animated,
  PanResponder,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/MaterialIcons';
import AppHeader from '../AppHeader';
import API_ENDPOINTS, { initICMSBase } from '../../../icms_config/api';
import InvoiceGenerating from '../../assets/images/Invoice_Generating.gif';
import ReviewCarefully from '../../assets/images/Review_Carefully.gif';
import ApproveRegenerate from '../../assets/images/Approve_or_regenerate.gif';
const HEADER_FALLBACK = '#ffffff';
const STAGE_COUNT = 4;
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const REEL_WIDTH = Math.round(SCREEN_WIDTH * 0.7);
const REEL_HEIGHT = Math.round(REEL_WIDTH * (16 / 9));
const IMAGES_MODAL_HEIGHT = Math.round(SCREEN_HEIGHT * 0.7);
const IMAGES_MODAL_WIDTH = Math.min(Math.round(SCREEN_WIDTH * 0.92), 480);
const IMAGES_SLIDE_WIDTH = IMAGES_MODAL_WIDTH - 36;
const PREVIEW_LOADING_SLIDES = [InvoiceGenerating, ReviewCarefully, ApproveRegenerate];

const formatDateOnly = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-CA');
};

const getStatusTone = (status) => {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'PROCESSING') {
    return {
      bg: '#FEF3C7',
      text: '#92400E',
    };
  }
  if (normalized === 'REQUESTED') {
    return {
      bg: '#DBEAFE',
      text: '#1D4ED8',
    };
  }
  if (normalized === 'COMPLETED') {
    return {
      bg: '#DCFCE7',
      text: '#166534',
    };
  }
  return {
    bg: '#E5E7EB',
    text: '#374151',
  };
};

function distanceBetweenTouches(touches) {
  const [a, b] = touches;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

function ZoomableImage({ uri, width, height, onZoomChange }) {
  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  const currentScale = useRef(1);
  const currentTranslate = useRef({ x: 0, y: 0 });
  const initialPinchDistance = useRef(null);
  const initialPinchScale = useRef(1);
  const lastTouchCount = useRef(0);
  const panStart = useRef({ x: 0, y: 0 });
  const lastTapTime = useRef(0);

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  const applyTransform = (nextScale, nextX, nextY) => {
    const boundedScale = clamp(nextScale, 1, 4);
    const maxOffsetX = ((boundedScale - 1) * width) / 2;
    const maxOffsetY = ((boundedScale - 1) * height) / 2;
    const boundedX = boundedScale <= 1 ? 0 : clamp(nextX, -maxOffsetX, maxOffsetX);
    const boundedY = boundedScale <= 1 ? 0 : clamp(nextY, -maxOffsetY, maxOffsetY);

    currentScale.current = boundedScale;
    currentTranslate.current = { x: boundedX, y: boundedY };

    scale.setValue(boundedScale);
    translateX.setValue(boundedX);
    translateY.setValue(boundedY);
  };

  const resetTransform = () => {
    applyTransform(1, 0, 0);
    if (onZoomChange) onZoomChange(false);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (evt) => evt.nativeEvent.touches.length === 2,
      onStartShouldSetPanResponderCapture: (evt) => evt.nativeEvent.touches.length === 2,
      onMoveShouldSetPanResponder: (evt) =>
        evt.nativeEvent.touches.length === 2 || currentScale.current > 1.02,
      onMoveShouldSetPanResponderCapture: (evt) =>
        evt.nativeEvent.touches.length === 2 || currentScale.current > 1.02,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (evt) => {
        const touches = evt.nativeEvent.touches;
        lastTouchCount.current = touches.length;
        if (touches.length === 2) {
          initialPinchDistance.current = distanceBetweenTouches(touches);
          initialPinchScale.current = currentScale.current;
        } else {
          panStart.current = {
            x: touches[0].pageX - currentTranslate.current.x,
            y: touches[0].pageY - currentTranslate.current.y,
          };
        }
      },
      onPanResponderMove: (evt) => {
        const touches = evt.nativeEvent.touches;

        if (touches.length === 2) {
          if (lastTouchCount.current !== 2 || initialPinchDistance.current == null) {
            initialPinchDistance.current = distanceBetweenTouches(touches);
            initialPinchScale.current = currentScale.current;
          }
          const distance = distanceBetweenTouches(touches);
          const ratio = distance / initialPinchDistance.current;
          const nextScale = initialPinchScale.current * ratio;
          applyTransform(nextScale, currentTranslate.current.x, currentTranslate.current.y);
          if (onZoomChange) onZoomChange(nextScale > 1.05);
        } else if (touches.length === 1 && currentScale.current > 1) {
          const nextX = touches[0].pageX - panStart.current.x;
          const nextY = touches[0].pageY - panStart.current.y;
          applyTransform(currentScale.current, nextX, nextY);
        }

        lastTouchCount.current = touches.length;
      },
      onPanResponderRelease: () => {
        if (lastTouchCount.current <= 1 && currentScale.current <= 1.05) {
          const now = Date.now();
          if (now - lastTapTime.current < 280) {
            resetTransform();
          }
          lastTapTime.current = now;
        }
        initialPinchDistance.current = null;
        lastTouchCount.current = 0;
        if (currentScale.current <= 1) {
          resetTransform();
        }
      },
      onPanResponderTerminate: () => {
        initialPinchDistance.current = null;
        lastTouchCount.current = 0;
      },
    })
  ).current;

  return (
    <View style={[styles.zoomableImageWrap, { width, height }]} {...panResponder.panHandlers}>
      <Animated.Image
        source={{ uri }}
        resizeMode="contain"
        style={[
          { width, height },
          { transform: [{ translateX }, { translateY }, { scale }] },
        ]}
      />
    </View>
  );
}

export default function PendingNewInvoices() {
  const [headerBg, setHeaderBg] = useState({ type: 'color', value: HEADER_FALLBACK });
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [jobs, setJobs] = useState([]);
  const [expandedJobId, setExpandedJobId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [teamReviewModalVisible, setTeamReviewModalVisible] = useState(false);
  const [teamReviewJobId, setTeamReviewJobId] = useState('');
  const [teamReviewReasons, setTeamReviewReasons] = useState([]);
  const [teamReviewReasonsLoading, setTeamReviewReasonsLoading] = useState(false);
  const [teamReviewReasonsError, setTeamReviewReasonsError] = useState('');
  const [selectedTeamReviewReason, setSelectedTeamReviewReason] = useState('');
  const [customTeamReviewReason, setCustomTeamReviewReason] = useState('');
  const [teamReviewSubmitLoading, setTeamReviewSubmitLoading] = useState(false);
  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewLoadingSliderIndex, setPreviewLoadingSliderIndex] = useState(0);
  const [previewError, setPreviewError] = useState('');
  const [previewData, setPreviewData] = useState(null);
  const [previewJobId, setPreviewJobId] = useState('');
  const [previewActionLoading, setPreviewActionLoading] = useState(false);
  const [regenerateModalVisible, setRegenerateModalVisible] = useState(false);
  const [regeneratePrompt, setRegeneratePrompt] = useState('');
  const [imagesModalVisible, setImagesModalVisible] = useState(false);
  const [imagesSliderIndex, setImagesSliderIndex] = useState(0);
  const [imagesZoomed, setImagesZoomed] = useState(false);
  const [activeTab, setActiveTab] = useState('PROCESSING');
  const [recreateModalVisible, setRecreateModalVisible] = useState(false);
  const [recreateJobId, setRecreateJobId] = useState('');
  const [recreateLoading, setRecreateLoading] = useState(false);

  useEffect(() => {
    const loadHeader = async () => {
      try {
        const topBanner = await AsyncStorage.getItem('topabanner');
        if (topBanner) {
          setHeaderBg({ type: 'image', value: topBanner });
          return;
        }
      } catch (_error) {
        // fall back to color
      }
      setHeaderBg({ type: 'color', value: HEADER_FALLBACK });
    };

    loadHeader();
  }, []);

  const fetchPendingJobs = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');

    try {
      await initICMSBase();
      const token = await AsyncStorage.getItem('access_token');
      const icmsStore = await AsyncStorage.getItem('icms_store');
      const storeurl = await AsyncStorage.getItem('storeurl');
      console.log('Fetching pending invoices with:', { API_ENDPOINTS, icmsStore, storeurl,token });
      const response = await fetch(API_ENDPOINTS.PENDINGINVOICES, {
        method: 'GET',
        headers: {
          access_token: token ?? '',
          mode: 'MOBILE',
          store: icmsStore ?? '',
          app_url: storeurl ?? '',
        },
      });

      const data = await response.json().catch(() => ({}));
      console.log('PENDINGINVOICES response:', data);
      if (!response.ok || data?.success === false) {
        throw new Error(data?.message || `Request failed (${response.status})`);
      }

      const nextJobs = Array.isArray(data?.jobs) ? data.jobs : [];
      setJobs(nextJobs);
      if (!expandedJobId && nextJobs.length) {
        setExpandedJobId(String(nextJobs[0]?.jobId || nextJobs[0]?.invoiceNo || ''));
      }
    } catch (error) {
      console.log('Pending new invoices error:', error?.message || error);
      setJobs([]);
      setErrorMessage(error?.message || 'Unable to load pending new invoices.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchPendingJobs();
    }, [fetchPendingJobs]),
  );

  const getIcmsHeaders = useCallback(async () => {
    await initICMSBase();
    const token = await AsyncStorage.getItem('access_token');
    const icmsStore = await AsyncStorage.getItem('icms_store');
    const storeurl = await AsyncStorage.getItem('storeurl');
    return {
      'Content-Type': 'application/json',
      access_token: token ?? '',
      mode: 'MOBILE',
      store: icmsStore ?? '',
      app_url: storeurl ?? '',
    };
  }, []);

  const loadTeamReviewReasons = useCallback(async () => {
    setTeamReviewReasonsLoading(true);
    setTeamReviewReasonsError('');
    try {
      const headers = await getIcmsHeaders();
      const response = await fetch(API_ENDPOINTS.TEAM_REVIEW_REASONS, {
        method: 'GET',
        headers,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.message || `Request failed (${response.status})`);
      }
      setTeamReviewReasons(Array.isArray(data?.reasons) ? data.reasons : []);
    } catch (error) {
      console.log('Team review reasons error:', error?.message || error);
      setTeamReviewReasonsError(error?.message || 'Unable to load reasons.');
    } finally {
      setTeamReviewReasonsLoading(false);
    }
  }, [getIcmsHeaders]);

  const openTeamReviewModal = useCallback((jobId) => {
    if (!jobId) return;
    setTeamReviewJobId(String(jobId));
    setSelectedTeamReviewReason('');
    setCustomTeamReviewReason('');
    setTeamReviewModalVisible(true);
    loadTeamReviewReasons();
  }, [loadTeamReviewReasons]);

  const closeTeamReviewModal = useCallback(() => {
    setTeamReviewModalVisible(false);
    setTeamReviewJobId('');
    setTeamReviewReasons([]);
    setTeamReviewReasonsError('');
    setSelectedTeamReviewReason('');
    setCustomTeamReviewReason('');
  }, []);

  const handleRequestTeamReview = useCallback(async () => {
    const normalizedJobId = String(teamReviewJobId || '').trim();
    if (!normalizedJobId) return;

    const isOther = selectedTeamReviewReason === 'Other';
    const reason = (isOther ? customTeamReviewReason : selectedTeamReviewReason).trim();
    if (!reason) return;

    setTeamReviewSubmitLoading(true);
    try {
      const headers = await getIcmsHeaders();
      const requestedBy = (await AsyncStorage.getItem('userEmail')) || '';

      const response = await fetch(API_ENDPOINTS.REQUEST_TEAM_REVIEW, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jobId: normalizedJobId,
          reason,
          requestedBy,
        }),
      });

      const data = await response.json().catch(() => ({}));
      console.log('REQUEST_TEAM_REVIEW response:', data);

      if (response.ok && data?.status === 'REVIEW_BY_TEAM') {
        Alert.alert('Request submitted successfully');
        closeTeamReviewModal();
        fetchPendingJobs();
      } else {
        Alert.alert(data?.message || 'Failed to send');
      }
    } catch (error) {
      console.log('Request team review error:', error?.message || error);
      Alert.alert(error?.message || 'Failed to send');
    } finally {
      setTeamReviewSubmitLoading(false);
    }
  }, [
    teamReviewJobId,
    selectedTeamReviewReason,
    customTeamReviewReason,
    getIcmsHeaders,
    closeTeamReviewModal,
    fetchPendingJobs,
  ]);

  const loadPreview = useCallback(async (jobId) => {

    const normalizedJobId = String(jobId || '').trim();
    if (!normalizedJobId) return;

    setPreviewLoading(true);
    setPreviewError('');

    try {
      const headers = await getIcmsHeaders();
      const response = await fetch(API_ENDPOINTS.AUTO_REGEX_PREVIEW, {
        method: 'POST',
        headers,
        body: JSON.stringify({ jobId: normalizedJobId }),
      });
      const data = await response.json().catch(() => ({}));
      console.log('AUTO_REGEX_PREVIEW response:', data);
      if (!response.ok || data?.success === false) {
        throw new Error(data?.message || `Request failed (${response.status})`);
      }
      setPreviewData(data);
    } catch (error) {
      console.log('Auto regex preview error:', error?.message || error);
      setPreviewError(error?.message || 'Unable to load preview.');
    } finally {
      setPreviewLoading(false);
    }
  }, [getIcmsHeaders]);

  const handlePreview = useCallback(async (jobId) => {
    const normalizedJobId = String(jobId || '').trim();
    if (!normalizedJobId) return;

    setPreviewJobId(normalizedJobId);
    setPreviewData(null);
    setPreviewLoading(true);
    setPreviewLoadingSliderIndex(0);
    setPreviewModalVisible(true);
    await loadPreview(normalizedJobId);
  }, [loadPreview]);

  const closePreviewModal = useCallback(() => {
    setPreviewModalVisible(false);
    setPreviewData(null);
    setPreviewError('');
    setPreviewJobId('');
  }, []);

  const openImagesModal = useCallback(() => {
    setImagesSliderIndex(0);
    setImagesZoomed(false);
    setPreviewModalVisible(false);
    setImagesModalVisible(true);
  }, []);

  const closeImagesModal = useCallback(() => {
    setImagesModalVisible(false);
    setImagesZoomed(false);
    setPreviewModalVisible(true);
  }, []);

  const handleApprove = useCallback(async () => {
    const normalizedJobId = String(previewJobId || '').trim();
    if (!normalizedJobId) return;

    setPreviewActionLoading(true);
    try {
      const headers = await getIcmsHeaders();
      const response = await fetch(API_ENDPOINTS.AUTO_REGEX_APPROVE, {
        method: 'POST',
        headers,
        body: JSON.stringify({ jobId: normalizedJobId }),
      });

      const data = await response.json().catch(() => ({}));
      console.log('AUTO_REGEX_APPROVE response:', data);
      if (response.status === 200) {
        Alert.alert('Approved successfully');
        closePreviewModal();
        fetchPendingJobs();
      } else {
        Alert.alert(data?.status || data?.message || `Request failed (${response.status})`);
      }
    } catch (error) {
      console.log('Auto regex approve error:', error?.message || error);
      Alert.alert(error?.message || 'Unable to approve.');
    } finally {
      setPreviewActionLoading(false);
    }
  }, [previewJobId, getIcmsHeaders, closePreviewModal, fetchPendingJobs]);

  const openRegenerateModal = useCallback(() => {
    setRegeneratePrompt('');
    setRegenerateModalVisible(true);
  }, []);

  const closeRegenerateModal = useCallback(() => {
    setRegenerateModalVisible(false);
    setRegeneratePrompt('');
  }, []);

  const handleRegenerateSubmit = useCallback(async () => {
    const normalizedJobId = String(previewJobId || '').trim();
    if (!normalizedJobId) return;

    const trimmedPrompt = regeneratePrompt.trim();
    setRegenerateModalVisible(false);
    setPreviewActionLoading(true);
    try {
      const headers = await getIcmsHeaders();
      const response = await fetch(API_ENDPOINTS.AUTO_REGEX, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jobId: normalizedJobId,
          userPrompt: trimmedPrompt,
        }),
      });

      const data = await response.json().catch(() => ({}));
      console.log('AUTO_REGEX response:', data);
      if (!response.ok) {
        throw new Error(data?.message || `Request failed (${response.status})`);
      }

      if (data?.status === 'waiting_for_review') {
        await loadPreview(normalizedJobId);
      } else {
        Alert.alert(data?.status || 'Regenerate status unknown');
      }
    } catch (error) {
      console.log('Auto regex regenerate error:', error?.message || error);
      Alert.alert(error?.message || 'Unable to regenerate.');
    } finally {
      setPreviewActionLoading(false);
      setRegeneratePrompt('');
    }
  }, [previewJobId, regeneratePrompt, getIcmsHeaders, loadPreview]);

  const openRecreateModal = useCallback((jobId) => {
    if (!jobId) return;
    setRecreateJobId(String(jobId));
    setRecreateModalVisible(true);
  }, []);

  const closeRecreateModal = useCallback(() => {
    if (recreateLoading) return;
    setRecreateModalVisible(false);
    setRecreateJobId('');
  }, [recreateLoading]);

  const handleRecreateSubmit = useCallback(async (resumeFromStage) => {
    const normalizedJobId = String(recreateJobId || '').trim();
    if (!normalizedJobId) return;

    setRecreateLoading(true);
    try {
      const headers = await getIcmsHeaders();
      const response = await fetch(API_ENDPOINTS.RECREATE_REGEX, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jobId: normalizedJobId,
          resumeFromStage,
        }),
      });

      const data = await response.json().catch(() => ({}));
      console.log('RECREATE_REGEX response:', data);
      if (!response.ok) {
        throw new Error(data?.message || `Request failed (${response.status})`);
      }

      Alert.alert('Re-create started successfully');
      setRecreateModalVisible(false);
      setRecreateJobId('');
      fetchPendingJobs();
    } catch (error) {
      console.log('Recreate regex error:', error?.message || error);
      Alert.alert(error?.message || 'Unable to re-create.');
    } finally {
      setRecreateLoading(false);
    }
  }, [recreateJobId, getIcmsHeaders, fetchPendingJobs]);

  const sortedJobs = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const filteredJobs = normalizedQuery
      ? jobs.filter((item) => {
          const vendor = String(item?.vendor || '').toLowerCase();
          const invoiceNo = String(item?.invoiceNo || '').toLowerCase();
          return vendor.includes(normalizedQuery) || invoiceNo.includes(normalizedQuery);
        })
      : jobs;

    return [...filteredJobs].sort((a, b) => {
      const aTime = new Date(a?.createdAt || 0).getTime();
      const bTime = new Date(b?.createdAt || 0).getTime();
      return bTime - aTime;
    });
  }, [jobs, searchQuery]);

  const failedJobs = useMemo(
    () => sortedJobs.filter((item) => String(item?.status || '').toUpperCase() === 'FAILED'),
    [sortedJobs],
  );

  const processingJobs = useMemo(
    () => sortedJobs.filter((item) => String(item?.status || '').toUpperCase() !== 'FAILED'),
    [sortedJobs],
  );

  const displayedJobs = activeTab === 'FAILED' ? failedJobs : processingJobs;

  const renderStepper = (stageValue) => {
    const currentStage = Math.max(0, Math.min(STAGE_COUNT, Number(stageValue || 0)));

    return (
      <View style={styles.stepperRow}>
        {Array.from({ length: STAGE_COUNT }, (_, index) => {
          const stageNumber = index + 1;
          const isDone = currentStage >= stageNumber;
          const isCurrent = currentStage === stageNumber;

          return (
            <View key={stageNumber} style={styles.stepItem}>
              <View
                style={[
                  styles.stepDot,
                  isDone && styles.stepDotActive,
                  isCurrent && styles.stepDotCurrent,
                ]}
              >
                <Text style={[styles.stepDotText, isDone && styles.stepDotTextActive]}>
                  {stageNumber}
                </Text>
              </View>
              {stageNumber < STAGE_COUNT ? (
                <View
                  style={[
                    styles.stepConnector,
                    currentStage > stageNumber && styles.stepConnectorActive,
                  ]}
                />
              ) : null}
              <Text style={[styles.stepLabel, isDone && styles.stepLabelActive]}>
                {`Stage ${stageNumber}`}
              </Text>
            </View>
          );
        })}
      </View>
    );
  };

  const renderItem = ({ item }) => {
    const key = String(item?.jobId || item?.invoiceNo || item?.createdAt || Math.random());
    const isExpanded = expandedJobId === key;
    const statusTone = getStatusTone(item?.status);
    const stageNumber = Math.max(0, Math.min(STAGE_COUNT, Number(item?.stage || 0)));

    return (
      <TouchableOpacity
        activeOpacity={0.9}
        style={styles.card}
        onPress={() => setExpandedJobId((prev) => (prev === key ? '' : key))}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderText}>
            <Text style={styles.vendorName} numberOfLines={1}>
              {item?.vendor || '-'}
            </Text>
            <Text style={styles.jobMeta} numberOfLines={1}>
              {item?.jobId || 'No Job ID'}
            </Text>
          </View>
          <View style={styles.cardHeaderRight}>
            <View style={[styles.statusPill, { backgroundColor: statusTone.bg }]}>
              <Text style={[styles.statusText, { color: statusTone.text }]}>
                {item?.status || '-'}
              </Text>
            </View>
            {['waiting_for_review', 'failed'].includes(String(item?.status || '').toLowerCase()) ? (
              <TouchableOpacity
                style={styles.notifyIconBtn}
                onPress={() => openTeamReviewModal(item?.jobId)}
                disabled={!item?.jobId}
              >
                <Icon name="help-outline" size={16} color="#fff" />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {isExpanded ? (
          <View style={styles.expandedBlock}>
            <View style={styles.metaPanel}>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Invoice No</Text>
                <Text style={styles.metaValue}>{item?.invoiceNo || '-'}</Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Created At</Text>
                <Text style={styles.metaValue}>{formatDateOnly(item?.createdAt)}</Text>
              </View>
            </View>
            {renderStepper(stageNumber)}

            {String(item?.status || '').toLowerCase() === 'waiting_for_review' ? (
              <View style={styles.progressCard}>
                <TouchableOpacity
                  style={styles.previewBtn}
                  onPress={() => handlePreview(item?.jobId)}
                  disabled={!item?.jobId}
                  activeOpacity={0.85}
                >
                  <Icon name="visibility" size={18} color="#fff" />
                  <Text style={styles.previewBtnText}>Preview Extracted Data</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {String(item?.status || '').toLowerCase() === 'failed' ? (
              <View style={styles.progressCard}>
                <TouchableOpacity
                  style={styles.previewBtn}
                  onPress={() => openRecreateModal(item?.jobId)}
                  disabled={!item?.jobId}
                  activeOpacity={0.85}
                >
                  <Icon name="refresh" size={18} color="#fff" />
                  <Text style={styles.previewBtnText}>Re-Create</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        ) : null}

      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.screen}>
      <AppHeader
        Title="Pending Invoices"
        backgroundType={headerBg.type}
        backgroundValue={headerBg.value}
      />

      <View style={styles.content}>
        <View style={styles.searchWrap}>
          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search vendor or invoice no"
              placeholderTextColor="#7B8A81"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            <TouchableOpacity style={styles.refreshBtn} onPress={fetchPendingJobs}>
              <Icon name="refresh" size={22} color="#fff" />
            </TouchableOpacity>
            {failedJobs.length > 0 ? (
              <TouchableOpacity
                style={[styles.failedIconBtn, activeTab === 'FAILED' && styles.failedIconBtnActive]}
                onPress={() => setActiveTab(activeTab === 'FAILED' ? 'PROCESSING' : 'FAILED')}
              >
                <Icon
                  name="error-outline"
                  size={22}
                  color={activeTab === 'FAILED' ? '#fff' : '#B91C1C'}
                />
                <View style={styles.failedBadge}>
                  <Text style={styles.failedBadgeText}>
                    {failedJobs.length > 99 ? '99+' : failedJobs.length}
                  </Text>
                </View>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color="#319241" />
            <Text style={styles.stateText}>Loading pending invoice jobs...</Text>
          </View>
        ) : errorMessage ? (
          <View style={styles.centerState}>
            <Text style={styles.errorTitle}>Unable to load jobs</Text>
            <Text style={styles.errorText}>{errorMessage}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={fetchPendingJobs}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={activeTab === 'FAILED' ? styles.failedListWrap : styles.processingListWrap}>
            <FlatList
              data={displayedJobs}
              keyExtractor={(item, index) =>
                String(item?.jobId || `${item?.invoiceNo || 'job'}-${index}`)
              }
              renderItem={renderItem}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <View style={styles.centerState}>
                  <Text style={styles.stateText}>
                    {activeTab === 'FAILED'
                      ? 'No failed invoice jobs found.'
                      : 'No pending invoice jobs found.'}
                  </Text>
                </View>
              }
            />
          </View>
        )}
      </View>

      <Modal visible={teamReviewModalVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <TouchableOpacity
            style={styles.modalBackdropTouch}
            onPress={closeTeamReviewModal}
          />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Not satisfied? Hand off to the team</Text>

            {teamReviewReasonsLoading ? (
              <View style={styles.previewCenterState}>
                <ActivityIndicator size="small" color="#319241" />
                <Text style={styles.stateText}>Loading reasons...</Text>
              </View>
            ) : teamReviewReasonsError ? (
              <Text style={styles.errorText}>{teamReviewReasonsError}</Text>
            ) : (
              <View style={styles.reasonList}>
                {teamReviewReasons.map((reason) => {
                  const isSelected = selectedTeamReviewReason === reason;
                  return (
                    <TouchableOpacity
                      key={reason}
                      style={[styles.reasonOption, isSelected && styles.reasonOptionSelected]}
                      onPress={() => setSelectedTeamReviewReason(reason)}
                    >
                      <View style={[styles.reasonRadio, isSelected && styles.reasonRadioSelected]}>
                        {isSelected ? <View style={styles.reasonRadioDot} /> : null}
                      </View>
                      <Text style={styles.reasonOptionText}>{reason}</Text>
                    </TouchableOpacity>
                  );
                })}

                {selectedTeamReviewReason === 'Other' ? (
                  <TextInput
                    style={styles.reasonOtherInput}
                    placeholder="Type your reason"
                    placeholderTextColor="#7B8A81"
                    value={customTeamReviewReason}
                    onChangeText={setCustomTeamReviewReason}
                    multiline
                  />
                ) : null}
              </View>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[
                  styles.modalBtn,
                  styles.modalBtnPrimary,
                  (!selectedTeamReviewReason ||
                    (selectedTeamReviewReason === 'Other' && !customTeamReviewReason.trim()) ||
                    teamReviewSubmitLoading) &&
                    styles.modalBtnDisabled,
                ]}
                onPress={handleRequestTeamReview}
                disabled={
                  !selectedTeamReviewReason ||
                  (selectedTeamReviewReason === 'Other' && !customTeamReviewReason.trim()) ||
                  teamReviewSubmitLoading
                }
              >
                {teamReviewSubmitLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalBtnText}>Request Review</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnGhost]}
                onPress={closeTeamReviewModal}
                disabled={teamReviewSubmitLoading}
              >
                <Text style={styles.modalBtnGhostText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={recreateModalVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <TouchableOpacity
            style={styles.modalBackdropTouch}
            onPress={closeRecreateModal}
          />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Re-Create Invoice</Text>
            <Text style={styles.modalText}>
              Choose how you would like to re-create this failed job.
            </Text>

            {recreateLoading ? (
              <View style={styles.previewCenterState}>
                <ActivityIndicator size="small" color="#319241" />
                <Text style={styles.stateText}>Processing...</Text>
              </View>
            ) : (
              <View style={styles.recreateOptionsList}>
                <TouchableOpacity
                  style={styles.recreateOption}
                  onPress={() => handleRecreateSubmit(1)}
                  activeOpacity={0.85}
                >
                  <Icon name="fast-forward" size={20} color="#319241" />
                  <View style={styles.recreateOptionTextWrap}>
                    <Text style={styles.recreateOptionTitle}>Resume from where it failed</Text>
                    <Text style={styles.recreateOptionSubtitle}>
                      Continue processing from the last completed stage.
                    </Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.recreateOption}
                  onPress={() => handleRecreateSubmit(0)}
                  activeOpacity={0.85}
                >
                  <Icon name="replay" size={20} color="#D97706" />
                  <View style={styles.recreateOptionTextWrap}>
                    <Text style={styles.recreateOptionTitle}>Restart from the beginning</Text>
                    <Text style={styles.recreateOptionSubtitle}>
                      Re-process this invoice from scratch.
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnGhost]}
                onPress={closeRecreateModal}
                disabled={recreateLoading}
              >
                <Text style={styles.modalBtnGhostText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={previewModalVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <TouchableOpacity style={styles.modalBackdropTouch} onPress={closePreviewModal} />
          {previewLoading ? (
            <View style={styles.reelBox}>
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                decelerationRate="fast"
                snapToInterval={REEL_WIDTH}
                snapToAlignment="center"
                style={styles.reelSlider}
                onMomentumScrollEnd={(e) => {
                  const idx = Math.round(e.nativeEvent.contentOffset.x / REEL_WIDTH);
                  setPreviewLoadingSliderIndex(idx);
                }}
              >
                {PREVIEW_LOADING_SLIDES.map((src, idx) => (
                  <Image key={idx} source={src} style={styles.reelSlide} resizeMode="contain" />
                ))}
              </ScrollView>
              <View style={styles.reelDotsRow}>
                {PREVIEW_LOADING_SLIDES.map((_, idx) => (
                  <View
                    key={idx}
                    style={[styles.reelDot, previewLoadingSliderIndex === idx && styles.reelDotActive]}
                  />
                ))}
              </View>
            </View>
          ) : (
          <View style={styles.previewModalCard}>
            {regenerateModalVisible ? (
              <>
                <Text style={styles.modalTitle}>Regenerate Regex</Text>
                <Text style={styles.modalText}>
                  Describe how the parsing should be adjusted.
                </Text>
                <TextInput
                  style={styles.regeneratePromptInput}
                  placeholder="e.g. The first numeric column is a serial number, ignore it."
                  placeholderTextColor="#7B8A81"
                  value={regeneratePrompt}
                  onChangeText={setRegeneratePrompt}
                  multiline
                  numberOfLines={4}
                />
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalBtnPrimary]}
                    onPress={handleRegenerateSubmit}
                  >
                    <Text style={styles.modalBtnText}>Submit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalBtnGhost]}
                    onPress={closeRegenerateModal}
                  >
                    <Text style={styles.modalBtnGhostText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>

            {previewError ? (
              <View style={styles.previewCenterState}>

                <Text style={styles.errorText}>{previewError}</Text>
              </View>
            ) : previewData ? (
              <>
               <View style={styles.previewTitleRow}>
                 <Text style={styles.modalTitle}>Invoice Preview</Text>
                 {Array.isArray(previewData?.invoiceImgUrls) && previewData.invoiceImgUrls.length > 0 ? (
                   <TouchableOpacity
                     style={styles.previewEyeButton}
                     onPress={openImagesModal}
                     hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                   >
                     <Icon name="visibility" size={22} color="#10261A" />
                   </TouchableOpacity>
                 ) : null}
               </View>
               <Text style={styles.previewSummary}>
                {`Total Rows: ${previewData?.totalRowCount ?? 0}`}
                </Text>
                <FlatList
                  style={styles.previewTableScroll}
                  data={
                    Array.isArray(previewData?.invoiceData) ? previewData.invoiceData : []
                  }
                  keyExtractor={(row, index) => String(row?.SerialNoInInv ?? index)}
                  ListHeaderComponent={
                    <View style={[styles.previewRow, styles.previewHeaderRow]}>
                      <Text style={[styles.previewCell, styles.previewHeaderCell, styles.previewCellNo]}>#</Text>
                      <Text style={[styles.previewCell, styles.previewHeaderCell]}>Item No</Text>
                      <Text style={[styles.previewCell, styles.previewHeaderCell, styles.previewCellWide]}>Description</Text>
                      <Text style={[styles.previewCell, styles.previewHeaderCell]}>Qty</Text>
                      <Text style={[styles.previewCell, styles.previewHeaderCell]}>Unit Price</Text>
                      <Text style={[styles.previewCell, styles.previewHeaderCell]}>Ext Price</Text>
                    </View>
                  }
                  renderItem={({ item: row, index }) => (
                    <View
                      style={[
                        styles.previewRow,
                        index % 2 === 1 && styles.previewRowAlt,
                      ]}
                    >
                      <Text style={[styles.previewCell, styles.previewCellNo]}>
                        {row?.SerialNoInInv ?? index + 1}
                      </Text>
                      <Text style={styles.previewCell}>{row?.itemNo || '-'}</Text>
                      <Text style={[styles.previewCell, styles.previewCellWide]}>{row?.description || '-'}</Text>
                      <Text style={styles.previewCell}>{row?.qty || '-'}</Text>
                      <Text style={styles.previewCell}>{row?.unitPrice || '-'}</Text>
                      <Text style={styles.previewCell}>{row?.extendedPrice || '-'}</Text>
                    </View>
                  )}
                  ListEmptyComponent={
                    <Text style={styles.stateText}>No rows found in preview.</Text>
                  }
                />
              </>
            ) : null}

            <View style={styles.previewModalActions}>
              {previewData ? (
                <>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalBtnApprove]}
                    onPress={handleApprove}
                    disabled={previewActionLoading || previewLoading}
                  >
                    <Text style={styles.modalBtnText}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalBtnRegenerate]}
                    onPress={openRegenerateModal}
                    disabled={previewActionLoading || previewLoading}
                  >
                    <Text style={styles.modalBtnText}>Regenerate</Text>
                  </TouchableOpacity>
                </>
              ) : null}
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnGhost]}
                onPress={closePreviewModal}
                disabled={previewActionLoading}
              >
                <Text style={styles.modalBtnGhostText}>Close</Text>
              </TouchableOpacity>
            </View>
            {previewActionLoading ? (
              <ActivityIndicator style={styles.previewActionLoader} size="small" color="#319241" />
            ) : null}
              </>
            )}
          </View>
          )}
        </View>
      </Modal>

      <Modal visible={imagesModalVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <TouchableOpacity style={styles.modalBackdropTouch} onPress={closeImagesModal} />
          <View style={styles.imagesModalCard}>
            <View style={styles.imagesModalHeader}>
              <Text style={styles.imagesModalHeaderTitle}>
                {`Invoice Images${
                  Array.isArray(previewData?.invoiceImgUrls) && previewData.invoiceImgUrls.length > 1
                    ? ` (${imagesSliderIndex + 1}/${previewData.invoiceImgUrls.length})`
                    : ''
                }`}
              </Text>
              <TouchableOpacity
                style={styles.imagesModalCloseBtn}
                onPress={closeImagesModal}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Icon name="close" size={22} color="#10261A" />
              </TouchableOpacity>
            </View>

            <View style={styles.imagesModalBody}>
              <ScrollView
                horizontal
                pagingEnabled
                scrollEnabled={!imagesZoomed}
                showsHorizontalScrollIndicator={false}
                decelerationRate="fast"
                snapToInterval={IMAGES_SLIDE_WIDTH}
                snapToAlignment="center"
                style={styles.imagesSlider}
                onMomentumScrollEnd={(e) => {
                  const idx = Math.round(e.nativeEvent.contentOffset.x / IMAGES_SLIDE_WIDTH);
                  setImagesSliderIndex(idx);
                  setImagesZoomed(false);
                }}
              >
                {(Array.isArray(previewData?.invoiceImgUrls) ? previewData.invoiceImgUrls : []).map((uri, idx) => (
                  <View key={idx} style={styles.imagesSlideWrap}>
                    <ZoomableImage
                      uri={uri}
                      width={IMAGES_SLIDE_WIDTH}
                      height={styles.imagesSlideWrap.height}
                      onZoomChange={setImagesZoomed}
                    />
                  </View>
                ))}
              </ScrollView>
            </View>

            <View style={styles.imagesModalFooter}>
              <View style={styles.reelDotsRow}>
                {(Array.isArray(previewData?.invoiceImgUrls) ? previewData.invoiceImgUrls : []).map((_, idx) => (
                  <View
                    key={idx}
                    style={[styles.reelDot, imagesSliderIndex === idx && styles.reelDotActive]}
                  />
                ))}
              </View>
              <Text style={styles.imagesZoomHint}>Pinch to zoom · Double-tap to reset</Text>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnGhost, styles.imagesCloseBtn]}
                onPress={closeImagesModal}
              >
                <Text style={styles.modalBtnGhostText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#D4E7DC',
  },
  content: {
    flex: 1,
    backgroundColor: '#D4E7DC',
  },
  searchWrap: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#F6FBF7',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#CFE3D5',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#10261A',
    fontSize: 14,
  },
  refreshBtn: {
    backgroundColor: '#319241',
    borderRadius: 12,
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  failedIconBtn: {
    width: 46,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#B91C1C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  failedIconBtnActive: {
    backgroundColor: '#B91C1C',
    borderColor: '#B91C1C',
  },
  failedBadge: {
    position: 'absolute',
    top: -8,
    right: -12,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: '#B91C1C',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  failedBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
  },
  processingListWrap: {
    flex: 1,
  },
  failedListWrap: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 28,
  },
  card: {
    backgroundColor: '#F6FBF7',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#CFE3D5',
    padding: 14,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  cardHeaderText: {
    flex: 1,
  },
  vendorName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#10261A',
  },
  jobMeta: {
    marginTop: 4,
    fontSize: 12,
    color: '#5F6F66',
  },
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  notifyIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#0F8B65',
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandedBlock: {
    marginTop: 14,
  },
  metaPanel: {
    backgroundColor: '#EAF5ED',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#D7ECDD',
    gap: 8,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  metaLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#466052',
  },
  metaValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '600',
    color: '#10261A',
  },
  stepperRow: {
    marginTop: 16,
    marginBottom: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stepItem: {
    flex: 1,
    alignItems: 'center',
    position: 'relative',
  },
  stepDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  stepDotActive: {
    backgroundColor: '#319241',
  },
  stepDotCurrent: {
    borderWidth: 2,
    borderColor: '#10351B',
  },
  stepDotText: {
    color: '#475569',
    fontWeight: '700',
  },
  stepDotTextActive: {
    color: '#fff',
  },
  stepConnector: {
    position: 'absolute',
    top: 14,
    right: '-50%',
    width: '100%',
    height: 3,
    backgroundColor: '#D1D5DB',
    zIndex: 1,
  },
  stepConnectorActive: {
    backgroundColor: '#319241',
  },
  stepLabel: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'center',
  },
  stepLabelActive: {
    color: '#166534',
  },
  progressCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DCE7DE',
    padding: 12,
    gap: 6,
  },
  progressTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  previewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#319241',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#10351B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  previewBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  progressText: {
    fontSize: 13,
    color: '#334155',
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  stateText: {
    marginTop: 12,
    fontSize: 14,
    color: '#475569',
    textAlign: 'center',
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#991B1B',
    marginBottom: 8,
  },
  errorText: {
    fontSize: 13,
    color: '#7F1D1D',
    lineHeight: 18,
  },
  retryBtn: {
    marginTop: 16,
    backgroundColor: '#319241',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryBtnText: {
    color: '#fff',
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
    paddingHorizontal: 20,
    
  },
  modalBackdropTouch: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#10261A',
  },
  previewTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  previewEyeButton: {
    padding: 4,
  },
  modalText: {
    marginTop: 8,
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  modalBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  modalBtnPrimary: {
    backgroundColor: '#319241',
  },
  modalBtnGhost: {
    backgroundColor: '#E2E8F0',
  },
  modalBtnText: {
    color: '#fff',
    fontWeight: '700',
  },
  modalBtnGhostText: {
    color: '#334155',
    fontWeight: '700',
  },
  modalBtnDisabled: {
    opacity: 0.5,
  },
  recreateOptionsList: {
    marginTop: 14,
    gap: 10,
  },
  recreateOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F6FBF7',
    borderWidth: 1,
    borderColor: '#CFE3D5',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  recreateOptionTextWrap: {
    flex: 1,
  },
  recreateOptionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#10261A',
  },
  recreateOptionSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: '#5F6F66',
  },
  reasonList: {
    marginTop: 12,
    gap: 8,
  },
  reasonOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  reasonOptionSelected: {},
  reasonRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reasonRadioSelected: {
    borderColor: '#319241',
  },
  reasonRadioDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#319241',
  },
  reasonOptionText: {
    flex: 1,
    fontSize: 14,
    color: '#10261A',
  },
  reasonOtherInput: {
    marginTop: 4,
    backgroundColor: '#F6FBF7',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CFE3D5',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#10261A',
    fontSize: 14,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  regeneratePromptInput: {
    marginTop: 12,
    backgroundColor: '#F6FBF7',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CFE3D5',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#10261A',
    fontSize: 14,
    minHeight: 90,
    textAlignVertical: 'top',
  },
  previewModalCard: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '80%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
  },
  imagesModalCard: {
    width: IMAGES_MODAL_WIDTH,
    height: IMAGES_MODAL_HEIGHT,
    backgroundColor: '#fff',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  imagesModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F0',
    backgroundColor: '#fff',
  },
  imagesModalHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#10261A',
    flexShrink: 1,
    paddingRight: 12,
  },
  imagesModalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagesModalBody: {
    flex: 1,
    backgroundColor: '#0B1F14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagesSlider: {
    flexGrow: 0,
  },
  imagesSlideWrap: {
    width: IMAGES_SLIDE_WIDTH,
    height: IMAGES_MODAL_HEIGHT - 170,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagesModalFooter: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: '#EEF2F0',
    backgroundColor: '#fff',
  },
  imagesCloseBtn: {
    marginTop: 10,
    width: '100%',
  },
  imagesZoomHint: {
    marginTop: 8,
    fontSize: 11,
    color: '#7B8A79',
    textAlign: 'center',
  },
  zoomableImageWrap: {
    overflow: 'hidden',
  },
  previewCenterState: {
    paddingVertical: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reelBox: {
    width: REEL_WIDTH,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  reelSlider: {
    width: REEL_WIDTH,
    height: REEL_HEIGHT,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
  },
  reelSlide: {
    width: REEL_WIDTH,
    height: REEL_HEIGHT,
  },
  reelDotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 14,
  },
  reelDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginHorizontal: 4,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  reelDotActive: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#319241',
  },
  previewSummary: {
    marginTop: 10,
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '700',
    color: '#10261A',
  },
  previewTableScroll: {
    maxHeight: 320,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
  },
  previewRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  previewHeaderRow: {
    backgroundColor: '#EAF5ED',
  },
  previewRowAlt: {
    backgroundColor: '#F8FAFB',
  },
  previewCell: {
    flex: 1,
    fontSize: 11,
    color: '#334155',
    paddingHorizontal: 2,
  },
  previewHeaderCell: {
    fontWeight: '700',
    color: '#10261A',
  },
  previewCellNo: {
    flex: 0.4,
  },
  previewCellWide: {
    flex: 1.6,
  },
  previewModalActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
    
  },
  modalBtnApprove: {
    backgroundColor: '#0F8B65',
  },
  modalBtnRegenerate: {
    backgroundColor: '#D97706',
  },
  previewActionLoader: {
    marginTop: 10,
  },
});