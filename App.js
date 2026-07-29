import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  TouchableWithoutFeedback,
  AppState,
  StatusBar,
  Animated,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Paths } from 'expo-file-system';
import { createDownloadResumable } from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { extractUrl, fetchNoWatermarkVideo } from './src/utils/douyinParser';

export default function App() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [videoInfo, setVideoInfo] = useState(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | parsing | downloading | done | error
  const progressAnim = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const handleAppStateChange = async (nextAppState) => {
      if (nextAppState === 'active') checkClipboard();
    };
    checkClipboard();
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: downloadProgress,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [downloadProgress]);

  const checkClipboard = async () => {
    try {
      const hasString = await Clipboard.hasStringAsync();
      if (hasString) {
        const text = await Clipboard.getStringAsync();
        const extracted = extractUrl(text);
        if (extracted && extracted.includes('douyin.com')) {
          if (extracted !== url) {
            setUrl(extracted);
            Alert.alert('偵測到抖音連結', '是否立即下載？', [
              { text: '取消', style: 'cancel' },
              { text: '立即下載', onPress: () => handleParseAndDownload(extracted) },
            ]);
          }
        }
      }
    } catch (e) {
      console.log('Clipboard read error:', e);
    }
  };

  const handleParseAndDownload = async (targetUrl = url) => {
    Keyboard.dismiss();
    const finalUrl = extractUrl(targetUrl);

    if (!finalUrl) {
      Alert.alert('格式錯誤', '請貼上有效的抖音分享連結');
      return;
    }

    setStatus('parsing');
    setLoading(true);
    setVideoInfo(null);
    setDownloadProgress(0);
    setIsDownloading(false);

    try {
      const info = await fetchNoWatermarkVideo(finalUrl);
      setVideoInfo(info);

      setStatus('downloading');
      setIsDownloading(true);
      const fileUri = `${Paths.document.uri}${Date.now()}_douyin.mp4`;

      const downloadResumable = createDownloadResumable(
        info.videoUrl,
        fileUri,
        {},
        (prog) => {
          const p = prog.totalBytesWritten / prog.totalBytesExpectedToWrite;
          setDownloadProgress(isNaN(p) ? 0 : p);
        }
      );

      const { uri } = await downloadResumable.downloadAsync();

      const { status: permStatus } = await MediaLibrary.requestPermissionsAsync(true);
      if (permStatus === 'granted') {
        await MediaLibrary.createAssetAsync(uri);
        setStatus('done');
        Alert.alert('✓ 儲存成功', '無浮水印影片已存入相冊！');
      } else {
        setStatus('done');
        Alert.alert('下載完成', '影片已下載，但未取得相冊權限，無法自動存入。');
      }
    } catch (error) {
      setStatus('error');
      Alert.alert('處理失敗', error.message || '解析或儲存影片時發生錯誤，請重試。');
      console.error(error);
    } finally {
      setLoading(false);
      setIsDownloading(false);
    }
  };

  const reset = () => {
    setUrl('');
    setVideoInfo(null);
    setStatus('idle');
    setDownloadProgress(0);
  };

  const isBusy = loading || isDownloading;

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoRow}>
            <View style={styles.logoIcon}>
              <Text style={styles.logoText}>↓</Text>
            </View>
            <View>
              <Text style={styles.appName}>影片下載</Text>
              <Text style={styles.appSub}>抖音無浮水印</Text>
            </View>
          </View>
        </View>

        {/* Input Card */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>貼上分享連結</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="https://v.douyin.com/..."
              placeholderTextColor="#444"
              value={url}
              onChangeText={setUrl}
              multiline={false}
              editable={!isBusy}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {url.length > 0 && !isBusy && (
              <TouchableOpacity onPress={reset} style={styles.clearBtn}>
                <Text style={styles.clearText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Main Button */}
          <TouchableOpacity
            style={[styles.dlBtn, isBusy && styles.dlBtnBusy]}
            onPress={() => handleParseAndDownload()}
            disabled={isBusy}
            activeOpacity={0.8}
          >
            {isBusy ? (
              <View style={styles.dlBtnInner}>
                <ActivityIndicator color="#fff" size="small" style={{ marginRight: 10 }} />
                <Text style={styles.dlBtnText}>
                  {status === 'parsing'
                    ? '解析中...'
                    : `下載中 ${(downloadProgress * 100).toFixed(0)}%`}
                </Text>
              </View>
            ) : (
              <Text style={styles.dlBtnText}>
                {status === 'done' ? '再次下載' : '一鍵下載'}
              </Text>
            )}
          </TouchableOpacity>

          {/* Progress Bar */}
          {isDownloading && (
            <View style={styles.progressBg}>
              <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
            </View>
          )}
        </View>

        {/* Result Card */}
        {videoInfo && !isBusy && (
          <View style={styles.resultCard}>
            {videoInfo.cover ? (
              <Image
                source={{ uri: videoInfo.cover }}
                style={styles.thumb}
                resizeMode="cover"
              />
            ) : null}
            <View style={styles.doneRow}>
              <Text style={styles.doneIcon}>✓</Text>
              <Text style={styles.doneText}>已存入相冊</Text>
            </View>
            {videoInfo.title ? (
              <Text style={styles.videoTitle} numberOfLines={2}>
                {videoInfo.title}
              </Text>
            ) : null}
          </View>
        )}

        {/* Tip */}
        {status === 'idle' && (
          <Text style={styles.tip}>複製抖音分享連結後開啟 App，自動偵測貼入</Text>
        )}
      </View>
    </TouchableWithoutFeedback>
  );
}

const C = {
  bg: '#0a0a0a',
  card: '#151515',
  border: '#1f1f1f',
  accent: '#ff2d55',
  accentDim: '#cc1f40',
  white: '#ffffff',
  grey1: '#aaaaaa',
  grey2: '#444444',
  grey3: '#2a2a2a',
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
    paddingHorizontal: 20,
    paddingTop: 60,
  },

  /* Header */
  header: {
    marginBottom: 32,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  logoIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: C.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    color: C.white,
    fontSize: 22,
    fontWeight: '900',
  },
  appName: {
    color: C.white,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  appSub: {
    color: C.grey1,
    fontSize: 12,
    marginTop: 1,
  },

  /* Card */
  card: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: C.border,
  },
  cardLabel: {
    color: C.grey1,
    fontSize: 12,
    letterSpacing: 1,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.grey3,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  input: {
    flex: 1,
    color: C.white,
    fontSize: 14,
    fontFamily: 'monospace',
  },
  clearBtn: {
    paddingLeft: 10,
  },
  clearText: {
    color: C.grey2,
    fontSize: 14,
  },

  /* Download Button */
  dlBtn: {
    backgroundColor: C.accent,
    borderRadius: 14,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dlBtnBusy: {
    backgroundColor: C.accentDim,
  },
  dlBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dlBtnText: {
    color: C.white,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  /* Progress */
  progressBg: {
    height: 3,
    backgroundColor: C.grey3,
    borderRadius: 2,
    marginTop: 14,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: C.accent,
    borderRadius: 2,
  },

  /* Result */
  resultCard: {
    marginTop: 16,
    backgroundColor: C.card,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
  },
  thumb: {
    width: '100%',
    height: 200,
    backgroundColor: C.grey3,
  },
  doneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
    gap: 6,
  },
  doneIcon: {
    color: '#30d158',
    fontSize: 15,
    fontWeight: '800',
  },
  doneText: {
    color: '#30d158',
    fontSize: 13,
    fontWeight: '600',
  },
  videoTitle: {
    color: C.grey1,
    fontSize: 13,
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 4,
    lineHeight: 19,
  },

  /* Tip */
  tip: {
    color: C.grey2,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 32,
    lineHeight: 18,
  },
});
