import { useState, useEffect, useCallback } from 'react';
import { mqttClient, FileMessage, ButtonControlMessage } from '@/lib/mqtt';

export default function Display() {
  const [isConnected, setIsConnected] = useState(false);
  const [buttonMedia, setButtonMedia] = useState<{ [key: string]: FileMessage }>({});
  const [currentDisplay, setCurrentDisplay] = useState<FileMessage | null>(null);
  const [selectedButton, setSelectedButton] = useState<'A' | 'B'>('A');
  const [status, setStatus] = useState('Connecting to MQTT...');

  const handleMQTTMessage = useCallback((message: string, topic: string) => {
    try {
      const data = JSON.parse(message);
      if (topic === 'home/buttonControl') {
        const controlData: ButtonControlMessage = data;
        setSelectedButton(controlData.activeButton);
      } else {
        const mediaData: FileMessage = data;
        if (mediaData.button && mediaData.fileContent && mediaData.fileType) {
          setButtonMedia(prev => ({
            ...prev,
            [mediaData.button]: mediaData
          }));
          setStatus('Connected - Media loaded');
        }
      }
    } catch (error) {
      console.error('Error parsing message:', error, 'Raw message:', message.substring(0, 100));
    }
  }, []);

  useEffect(() => {
    const connectAndSubscribe = async () => {
      try {
        setStatus('Connecting to MQTT...');
        await mqttClient.connect();
        setIsConnected(true);
        setStatus('Connected - Waiting for input...');

        await mqttClient.subscribe('home/buttonA', handleMQTTMessage);
        await mqttClient.subscribe('home/buttonB', handleMQTTMessage);
        await mqttClient.subscribe('home/buttonControl', handleMQTTMessage);
      } catch (error) {
        setStatus('MQTT Connection Failed - Check broker settings');
        setIsConnected(false);
        console.error('MQTT Error:', error);
      }
    };

    connectAndSubscribe();

    return () => {
      mqttClient.unsubscribe('home/buttonA', handleMQTTMessage);
      mqttClient.unsubscribe('home/buttonB', handleMQTTMessage);
      mqttClient.unsubscribe('home/buttonControl', handleMQTTMessage);
    };
  }, [handleMQTTMessage]);

  useEffect(() => {
    if (buttonMedia[selectedButton]) {
      setCurrentDisplay(buttonMedia[selectedButton]);
    } else {
      setCurrentDisplay(null);
    }
  }, [selectedButton, buttonMedia]);

  const renderContent = () => {
    if (!currentDisplay) {
      return (
        <div className="text-white text-xl text-center">
          {!isConnected ? (
            <div>
              <div className="mb-2">MQTT Connection Issue</div>
              <div className="text-sm text-gray-400">
                Check if MQTT broker supports WebSocket
              </div>
            </div>
          ) : (
            <div>
              <div className="mb-4">Waiting for input...</div>
              <div className="text-lg">Current Button: <span className="text-cyan-400">{selectedButton}</span></div>
              <div className="text-sm text-gray-400 mt-2">
                Available media: {Object.keys(buttonMedia).join(', ') || 'None'}
              </div>
            </div>
          )}
        </div>
      );
    }

    const mediaUrl = currentDisplay.fileContent;
    const isVideo = currentDisplay.mediaType === 'video' || currentDisplay.fileType.startsWith('video/');
    const isYouTube = currentDisplay.fileType === 'video/youtube';

    return (
      <div className="w-full max-w-6xl">        
        <div className="flex justify-center">
          {isVideo ? (
            isYouTube ? (
              <iframe
                src={mediaUrl}
                width="100%"
                height="100%"
                className="max-w-full max-h-[80vh] h-auto rounded-lg shadow-lg"
                allow="autoplay; encrypted-media"
                allowFullScreen
                onLoad={() => console.log('YouTube video loaded successfully')}
                onError={(e) => console.error('YouTube video load error:', e)}
              ></iframe>
            ) : (
              <video
                src={mediaUrl}
                controls
                autoPlay
                muted
                loop
                className="max-w-full max-h-[80vh] h-auto rounded-lg shadow-lg"
                onLoadStart={() => console.log('Video loading started')}
                onLoadedData={() => console.log('Video loaded successfully')}
                onError={(e) => console.error('Video load error:', e)}
              >
                Your browser does not support the video tag.
              </video>
            )
          ) : (
            <img
              src={mediaUrl}
              alt={currentDisplay.fileName}
              className="max-w-full max-h-[80vh] h-auto rounded-lg shadow-lg"
              onLoad={() => console.log('Image loaded successfully')}
              onError={(e) => console.error('Image load error:', e)}
            />
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-black text-white min-h-screen p-6">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-white text-2xl">Media Display</h1>
        <div className={`text-sm px-3 py-1 rounded ${isConnected ? 'bg-green-800 text-green-200' : 'bg-red-800 text-red-200'}`}>
          {status}
        </div>
      </div>

      <div className="flex gap-4 mb-8 justify-center">
        <div
          className={`border-2 rounded px-4 py-2 ${selectedButton === 'A' ? 'border-cyan-400 bg-cyan-400 text-black' : 'border-gray-600 text-gray-400'}`}
        >
          Button A {buttonMedia['A'] ? (buttonMedia['A'].mediaType === 'video' || buttonMedia['A'].fileType.startsWith('video/')) : '○'}
        </div>
        <div
          className={`border-2 rounded px-4 py-2 ${selectedButton === 'B' ? 'border-cyan-400 bg-cyan-400 text-black' : 'border-gray-600 text-gray-400'}`}
        >
          Button B {buttonMedia['B'] ? (buttonMedia['B'].mediaType === 'video' || buttonMedia['B'].fileType.startsWith('video/')) : '○'}
        </div>
      </div>
      
      <div className="flex items-center justify-center min-h-96">
        {renderContent()}
      </div>
    </div>
  );
}