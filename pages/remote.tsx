import { useState, useEffect } from 'react';
import { mqttClient, FileMessage } from '@/lib/mqtt';

export default function Remote() {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('Connecting to MQTT...');
  const [mediaUrl, setMediaUrl] = useState('');
  const [selectedButton, setSelectedButton] = useState<'A' | 'B'>('A');
  const [uploadedMedia, setUploadedMedia] = useState<{ [key: string]: { name: string, type: string } }>({});
  const [isUploading, setIsUploading] = useState(false);
  const [mediaTypeSelection, setMediaTypeSelection] = useState<'auto' | 'image' | 'video'>('auto');

  useEffect(() => {
    const connectMQTT = async () => {
      try {
        setConnectionStatus('Connecting to MQTT...');
        await mqttClient.connect();
        setIsConnected(true);
        setConnectionStatus('MQTT Connected');
        await mqttClient.publishButtonControl(selectedButton);
      } catch (error) {
        console.error('MQTT Connection failed:', error);
        setIsConnected(false);
        setConnectionStatus('MQTT Connection Failed - Check broker settings');
      }
    };

    connectMQTT();

    return () => {
      mqttClient.disconnect();
    };
  }, []);

  const handleButtonChange = async (button: 'A' | 'B') => {
    setSelectedButton(button);
    if (isConnected) {
      try {
        await mqttClient.publishButtonControl(button);
      } catch (error) {
        console.error('Error sending button control:', error);
      }
    }
  };

  const processMediaUrl = (url: string, selectedType: 'auto' | 'image' | 'video'): { processedUrl: string, fileType: string, mediaType: 'image' | 'video' } => {
    let processedUrl = url;
    let fileType = 'image/jpeg';
    let mediaType: 'image' | 'video' = 'image';
    
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      const videoId = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]+)/)?.[1];
      if (videoId) {
        processedUrl = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1`;
        fileType = 'video/youtube';
        mediaType = 'video';
      }
    }
    else if (url.includes('drive.google.com')) {
      const fileId = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/)?.[1];
      if (fileId) {
        if (selectedType === 'image' || (selectedType === 'auto' && url.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i))) {
          processedUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;
          fileType = url.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i)?.[0] || 'image/jpeg';
          mediaType = 'image';
        } else {
          processedUrl = `https://drive.google.com/file/d/${fileId}/preview?autoplay=1`;
          fileType = 'video/mp4';
          mediaType = 'video';
        }
      }
    }
    else if (selectedType === 'video' || (selectedType === 'auto' && url.match(/\.(mp4|webm|mov|avi|mkv|ogv)$/i))) {
      fileType = 'video/mp4';
      mediaType = 'video';
    }
    else if (selectedType === 'image' || (selectedType === 'auto' && url.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i))) {
      fileType = url.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i)?.[0] || 'image/jpeg';
      mediaType = 'image';
    }

    return { processedUrl, fileType, mediaType };
  };

  const handleMediaUpload = async () => {
    if (!mediaUrl) {
      alert('Please enter a media URL');
      return;
    }

    if (!isConnected) {
      alert(`MQTT not connected. Status: ${connectionStatus}`);
      return;
    }

    setIsUploading(true);

    try {
      const { processedUrl, fileType, mediaType } = processMediaUrl(mediaUrl, mediaTypeSelection);
      const message: FileMessage = {
        button: selectedButton,
        fileName: mediaUrl.split('/').pop() || 'media',
        fileContent: processedUrl,
        fileType,
        mediaType,
        timestamp: Date.now(),
      };

      const topic = `home/button${selectedButton}`;
      await mqttClient.publish(topic, JSON.stringify(message));

      setUploadedMedia(prev => ({
        ...prev,
        [selectedButton]: {
          name: message.fileName,
          type: mediaType,
        },
      }));

      setMediaUrl('');
      setConnectionStatus('MQTT Connected');
      alert(`${mediaType === 'video' ? 'Video' : 'Image'} URL uploaded successfully to Button ${selectedButton}`);
    } catch (error) {
      console.error('Error sending media:', error);
      alert('Error sending media URL');
      setConnectionStatus('Upload failed - MQTT Connected');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="bg-black text-white min-h-screen p-6">
      <h1 className="text-white text-2xl mb-4">Media Remote Control</h1>
      
      <div className="mb-6">
        <div className={`text-sm px-3 py-1 rounded ${isConnected ? 'bg-green-800 text-green-200' : 'bg-red-800 text-red-200'}`}>
          Status: {connectionStatus}
        </div>
      </div>
      
      <div className="mb-8">
        <h2 className="text-xl mb-4">Button Control</h2>
        <div className="flex gap-4 mb-4">
          <div
            className={`border-2 rounded px-6 py-3 cursor-pointer transition-all ${selectedButton === 'A' ? 'border-cyan-400 bg-cyan-400 text-black shadow-lg' : 'border-white text-white hover:border-cyan-400'}`}
            onClick={() => handleButtonChange('A')}
          >
            <div className="font-bold">Button A</div>
            {uploadedMedia['A'] && (
              <div className="text-xs mt-1 opacity-75">
                {uploadedMedia['A'].type === 'video'}
              </div>
            )}
          </div>
          <div
            className={`border-2 rounded px-6 py-3 cursor-pointer transition-all ${selectedButton === 'B' ? 'border-cyan-400 bg-cyan-400 text-black shadow-lg' : 'border-white text-white hover:border-cyan-400'}`}
            onClick={() => handleButtonChange('B')}
          >
            <div className="font-bold">Button B</div>
            {uploadedMedia['B'] && (
              <div className="text-xs mt-1 opacity-75">
                {uploadedMedia['B'].type === 'video'} {uploadedMedia['B'].name}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-gray-700 pt-6">
        <h2 className="text-xl mb-4">Upload Media URL to Button {selectedButton}</h2>
        
        <div className="mb-4">
          <input
            type="text"
            value={mediaUrl}
            onChange={(e) => setMediaUrl(e.target.value)}
            placeholder="Enter media URL"
            className="bg-gray-800 text-white px-4 py-2 rounded w-full max-w-md mb-2"
            disabled={isUploading}
          />
          <select
            value={mediaTypeSelection}
            onChange={(e) => setMediaTypeSelection(e.target.value as 'auto' | 'image' | 'video')}
            className="bg-gray-800 text-white px-4 py-2 rounded w-full max-w-md"
            disabled={isUploading}
          >
            <option value="auto">Auto Detect</option>
            <option value="image">Image</option>
            <option value="video">Video</option>
          </select>
        </div>
        
        <button
          onClick={handleMediaUpload}
          disabled={!mediaUrl || !isConnected || isUploading}
          className={`px-6 py-3 text-white font-semibold rounded transition-all ${mediaUrl && isConnected && !isUploading ? 'bg-blue-600 hover:bg-blue-700 cursor-pointer shadow-lg' : 'bg-gray-600 cursor-not-allowed opacity-50'}`}
        >
          {isUploading ? 'Uploading...' : `Upload URL to Button ${selectedButton}`}
        </button>              
      </div>
    </div>
  );
}