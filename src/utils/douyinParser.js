import axios from 'axios';

/**
 * Extracts a URL from a text string.
 * @param {string} text - The input text containing the Douyin share link.
 * @returns {string|null} - The extracted URL or null.
 */
export const extractUrl = (text) => {
  if (!text) return null;
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const match = text.match(urlRegex);
  return match ? match[0] : null;
};

/**
 * Parses a Douyin share URL and fetches the watermark-free video URL.
 * @param {string} shareUrl - The short Douyin URL (e.g., https://v.douyin.com/xxxx/)
 * @returns {Promise<{videoUrl: string, cover: string, title: string}>} - The parsed video data
 */
export const fetchNoWatermarkVideo = async (shareUrl) => {
  try {
    // 基于 GitHub 最成熟的开源方案 (Evil0ctal/Douyin_TikTok_Download_API)
    // 使用其官方提供的开放接口解析链接
    const apiUrl = `https://douyin.wtf/api/hybrid/video_data?url=${encodeURIComponent(shareUrl)}`;
    
    const apiRes = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
      }
    });

    const json = await apiRes.json();
    if (json.code !== 200 || !json.data) {
      throw new Error(json.message || "解析失败，接口可能受限。");
    }

    const item = json.data;
    
    // Extract title and cover
    const title = item.desc || 'douyin_video';
    const cover = item.video?.origin_cover?.url_list?.[0] || item.video?.cover?.url_list?.[0];
    
    // Extract video play url (with watermark)
    const playAddrWithWatermark = item.video?.play_addr?.url_list?.[0];
    
    if (!playAddrWithWatermark) {
      throw new Error("Could not find video play address in API response.");
    }

    // Replace playwm with play to get the watermark-free video
    const playAddrNoWatermark = playAddrWithWatermark.replace('playwm', 'play');

    // Upgrade to HTTPS if possible
    const finalPlayAddr = playAddrNoWatermark.replace('http://', 'https://');

    return {
      videoUrl: finalPlayAddr,
      cover,
      title,
    };
  } catch (error) {
    console.error("Error parsing Douyin video:", error);
    throw error;
  }
};
