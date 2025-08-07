import { useState, useEffect, useCallback, useRef } from 'react';
import { mqttClient, FileMessage, ButtonControlMessage, MediaControlMessage } from '@/lib/mqtt';

interface MediaState {
  zoomLevel: number;
  isPlaying: boolean;
  position: { x: number; y: number };
  scrollSpeed: number;
  isScrolling: boolean;
  scrollDirection: 'down' | 'up';
}

export default function Display() {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [buttonMedia, setButtonMedia] = useState<{ [key: string]: FileMessage }>({});
  const [currentDisplay, setCurrentDisplay] = useState<FileMessage | null>(null);
  const [selectedButton, setSelectedButton] = useState<'A' | 'B'>('A');
  const [status, setStatus] = useState<string>('Connecting to MQTT...');
  const [mediaState, setMediaState] = useState<{ [key: string]: MediaState }>({
    'A': { zoomLevel: 1, isPlaying: false, position: { x: 0, y: 0 }, scrollSpeed: 50, isScrolling: false, scrollDirection: 'down' },
    'B': { zoomLevel: 1, isPlaying: false, position: { x: 0, y: 0 }, scrollSpeed: 50, isScrolling: false, scrollDirection: 'down' },
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaContainerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<number>(0); // Tracks current scroll position
  const lastFrameTime = useRef<number>(0);
  const rafRef = useRef<number | null>(null); // RequestAnimationFrame ID

  const handleMQTTMessage = useCallback(
    (message: string, topic: string) => {
      try {
        const data = JSON.parse(message);

        if (topic === 'home/buttonControl') {
          const controlData: ButtonControlMessage = data;
          setSelectedButton(controlData.activeButton);
        } else if (topic === 'home/mediaControl') {
          const mediaControlData: MediaControlMessage = data;
          handleMediaControlMessage(mediaControlData);
        } else {
          const mediaData: FileMessage = data;
          if (mediaData.button && mediaData.fileContent && mediaData.fileType) {
            setButtonMedia((prev) => ({
              ...prev,
              [mediaData.button]: mediaData,
            }));
            setStatus('Connected - Media loaded');
            // Auto-play if the media is a video and matches the current button
            if (mediaData.mediaType === 'video' && mediaData.button === selectedButton) {
              setMediaState((prev) => ({
                ...prev,
                [mediaData.button]: { ...prev[mediaData.button], isPlaying: true },
              }));
            }
            // Start scrolling automatically for images
            if (mediaData.mediaType === 'image' && mediaData.button === selectedButton) {
              setMediaState((prev) => ({
                ...prev,
                [mediaData.button]: { 
                  ...prev[mediaData.button], 
                  isScrolling: true, 
                  scrollDirection: 'down' 
                },
              }));
              scrollRef.current = 0; // Reset scroll position
            }
          }
        }
      } catch (error) {
        console.error('Error parsing message:', error, 'Raw message:', message.substring(0, 100));
      }
    },
    [selectedButton]
  );

  const handleMediaControlMessage = (controlData: MediaControlMessage) => {
    const { button, action, value } = controlData;

    setMediaState((prev) => {
      const newState = { ...prev };

      switch (action) {
        case 'play':
          newState[button] = { ...newState[button], isPlaying: true };
          if (button === selectedButton && videoRef.current) {
            videoRef.current.play().catch((error) => console.error('Auto-play error:', error));
          }
          break;
        case 'pause':
          newState[button] = { ...newState[button], isPlaying: false };
          if (button === selectedButton && videoRef.current) {
            videoRef.current.pause();
          }
          break;
        case 'seek_forward':
          if (button === selectedButton && videoRef.current) {
            videoRef.current.currentTime += value || 10;
          }
          break;
        case 'seek_backward':
          if (button === selectedButton && videoRef.current) {
            videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - (value || 10));
          }
          break;
        case 'zoom_in':
          newState[button] = {
            ...newState[button],
            zoomLevel: Math.min(newState[button].zoomLevel * 1.25, 5),
          };
          break;
        case 'zoom_out':
          newState[button] = {
            ...newState[button],
            zoomLevel: Math.max(newState[button].zoomLevel / 1.25, 0.1),
          };
          break;
        case 'zoom_reset':
          newState[button] = { ...newState[button], zoomLevel: 1 };
          break;
        case 'move_up':
          newState[button] = {
            ...newState[button],
            position: {
              ...newState[button].position,
              y: newState[button].position.y - 50,
            },
          };
          break;
        case 'move_down':
          newState[button] = {
            ...newState[button],
            position: {
              ...newState[button].position,
              y: newState[button].position.y + 50,
            },
          };
          break;
        case 'move_left':
          newState[button] = {
            ...newState[button],
            position: {
              ...newState[button].position,
              x: newState[button].position.x - 50,
            },
          };
          break;
        case 'move_right':
          newState[button] = {
            ...newState[button],
            position: {
              ...newState[button].position,
              x: newState[button].position.x + 50,
            },
          };
          break;
        case 'move_reset':
          newState[button] = {
            ...newState[button],
            position: { x: 0, y: 0 },
          };
          break;
        case 'scroll_stop':
          newState[button] = { ...newState[button], isScrolling: false };
          if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
          }
          break;
        case 'scroll_speed_up':
          newState[button] = {
            ...newState[button],
            scrollSpeed: Math.min(newState[button].scrollSpeed + 10, 200),
          };
          break;
        case 'scroll_speed_down':
          newState[button] = {
            ...newState[button],
            scrollSpeed: Math.max(newState[button].scrollSpeed - 10, 10),
          };
          break;
      }

      return newState;
    });
  };

  // Auto-scroll animation with bidirectional scrolling
  useEffect(() => {
    if (
      currentDisplay &&
      currentDisplay.mediaType === 'image' &&
      mediaState[selectedButton].isScrolling &&
      mediaContainerRef.current
    ) {
      const scroll = (timestamp: number) => {
        if (!lastFrameTime.current) {
          lastFrameTime.current = timestamp;
        }
        const deltaTime = (timestamp - lastFrameTime.current) / 1000; // Time in seconds
        lastFrameTime.current = timestamp;

        const scrollSpeed = mediaState[selectedButton].scrollSpeed; // Pixels per second
        const direction = mediaState[selectedButton].scrollDirection === 'down' ? 1 : -1;
        scrollRef.current += scrollSpeed * deltaTime * direction;

        // Check boundaries and reverse direction
        if (mediaContainerRef.current) {
          const maxScroll =
            mediaContainerRef.current.scrollHeight - mediaContainerRef.current.clientHeight;

          if (scrollRef.current >= maxScroll && direction === 1) {
            setMediaState((prev) => ({
              ...prev,
              [selectedButton]: { ...prev[selectedButton], scrollDirection: 'up' },
            }));
            scrollRef.current = maxScroll;
          } else if (scrollRef.current <= 0 && direction === -1) {
            setMediaState((prev) => ({
              ...prev,
              [selectedButton]: { ...prev[selectedButton], scrollDirection: 'down' },
            }));
            scrollRef.current = 0;
          }

          mediaContainerRef.current.scrollTop = scrollRef.current;
        }

        if (mediaState[selectedButton].isScrolling) {
          rafRef.current = requestAnimationFrame(scroll);
        }
      };

      rafRef.current = requestAnimationFrame(scroll);

      return () => {
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
      };
    }
  }, [currentDisplay, mediaState, selectedButton]);

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
        await mqttClient.subscribe('home/mediaControl', handleMQTTMessage);
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
      mqttClient.unsubscribe('home/mediaControl', handleMQTTMessage);
    };
  }, [handleMQTTMessage]);

  useEffect(() => {
    if (buttonMedia[selectedButton]) {
      setCurrentDisplay(buttonMedia[selectedButton]);
      if (
        buttonMedia[selectedButton].mediaType === 'video' &&
        mediaState[selectedButton].isPlaying &&
        videoRef.current
      ) {
        videoRef.current.play().catch((error) => console.error('Auto-play error:', error));
      }
      if (buttonMedia[selectedButton].mediaType === 'image') {
        scrollRef.current = 0;
        if (mediaContainerRef.current) {
          mediaContainerRef.current.scrollTop = 0;
        }
        setMediaState((prev) => ({
          ...prev,
          [selectedButton]: { ...prev[selectedButton], isScrolling: true, scrollDirection: 'down' },
        }));
      }
    } else {
      setCurrentDisplay(null);
    }
  }, [selectedButton, buttonMedia]);

  useEffect(() => {
    if (currentDisplay && videoRef.current && currentDisplay.mediaType === 'video') {
      const video = videoRef.current;

      const handlePlay = () => {
        setMediaState((prev) => ({
          ...prev,
          [selectedButton]: { ...prev[selectedButton], isPlaying: true },
        }));
      };

      const handlePause = () => {
        setMediaState((prev) => ({
          ...prev,
          [selectedButton]: { ...prev[selectedButton], isPlaying: false },
        }));
      };

      video.addEventListener('play', handlePlay);
      video.addEventListener('pause', handlePause);

      if (mediaState[selectedButton].isPlaying) {
        video.play().catch((error) => console.error('Auto-play error:', error));
      }

      return () => {
        video.removeEventListener('play', handlePlay);
        video.removeEventListener('pause', handlePause);
      };
    }
  }, [currentDisplay, selectedButton]);

  const renderContent = () => {
    if (!currentDisplay) {
      return (
        <div className="text-center p-12 bg-gray-800 rounded-lg m-5">
          {!isConnected ? (
            <div>
              <div className="text-2xl mb-2">MQTT Connection Issue</div>
              <div className="text-sm text-gray-400">Check if MQTT broker supports WebSocket</div>
            </div>
          ) : (
            <div>
              <div className="text-2xl mb-4">Waiting for input...</div>
              <div className="text-lg mb-2">
                Current Button: <span className="text-cyan-400">{selectedButton}</span>
              </div>
            </div>
          )}
        </div>
      );
    }

    const mediaUrls = currentDisplay.fileContent;
    const fileNames = currentDisplay.fileName;
    const isVideo = currentDisplay.mediaType === 'video';
    const isText = currentDisplay.mediaType === 'text';
    const isPdf = currentDisplay.mediaType === 'pdf';
    const isYouTube = currentDisplay.fileType === 'video/youtube';
    const currentMediaState = mediaState[selectedButton];

    return (
      <div className="w-full max-w-2xl">
        <div
          className="flex justify-center items-start bg-gray-900 p-5 rounded-md min-h-[400px] overflow-y-auto max-h-[60vh]"
          ref={mediaContainerRef}
        >
          <div
            className="transition-transform duration-300 flex flex-col gap-4"
            style={{
              transform: `translate(${currentMediaState.position.x}px, ${currentMediaState.position.y}px) scale(${currentMediaState.zoomLevel})`,
            }}
          >
            {isText ? (
              <div className="text-white text-base leading-relaxed max-w-xl p-5 bg-gray-800 rounded-lg whitespace-pre-wrap break-words max-h-[60vh] overflow-auto">
                {mediaUrls[0]}
              </div>
            ) : isPdf ? (
              <iframe
                src={mediaUrls[0]}
                width="700"
                height="500"
                className="rounded-md border border-gray-700"
                title={fileNames[0]}
                onLoad={() => console.log('PDF loaded successfully')}
                onError={(e) => console.error('PDF load error:', e)}
              >
                Your browser does not support PDF display.
              </iframe>
            ) : isVideo ? (
              isYouTube ? (
                <iframe
                  src={mediaUrls[0]}
                  width="640"
                  height="360"
                  className="rounded-md"
                  allow="autoplay; encrypted-media"
                  allowFullScreen
                  onLoad={() => console.log('YouTube video loaded successfully')}
                  onError={(e) => console.error('YouTube video load error:', e)}
                ></iframe>
              ) : (
                <video
                  ref={videoRef}
                  src={mediaUrls[0]}
                  controls
                  loop
                  className="max-w-full max-h-[60vh] rounded-md"
                  onLoadStart={() => console.log('Video loading started')}
                  onLoadedData={() => console.log('Video loaded successfully')}
                  onError={(e) => console.error('Video load error:', e)}
                >
                  Your browser does not support the video tag.
                </video>
              )
            ) : (
              mediaUrls.map((url, index) => (
                <img
                  key={index}
                  src={url}
                  alt={fileNames[index]}
                  className="max-w-full max-h-[60vh] rounded-md"
                  onLoad={() => console.log(`Image ${fileNames[index]} loaded successfully`)}
                  onError={(e) => console.error(`Image ${fileNames[index]} load error:`, e)}
                  draggable={false}
                />
              ))
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-black text-white min-h-screen p-5">
      <div className="flex justify-between items-center mb-5">
        <h1 className="text-2xl">Media Display</h1>
        <div
          className={`px-4 py-2 rounded-md text-sm ${
            isConnected ? 'bg-green-800' : 'bg-red-800'
          }`}
        >
          {status}
        </div>
      </div>

      <div className="flex gap-4 mb-5 justify-center">
        <div
          className={`border-2 rounded-md px-4 py-2 ${
            selectedButton === 'A'
              ? 'border-cyan-400 bg-teal-900'
              : 'border-gray-600 bg-gray-800'
          }`}
        >
          <div className="font-bold">Button A</div>
        </div>
        <div
          className={`border-2 rounded-md px-4 py-2 ${
            selectedButton === 'B'
              ? 'border-cyan-400 bg-teal-900'
              : 'border-gray-600 bg-gray-800'
          }`}
        >
          <div className="font-bold">Button B</div>
        </div>
      </div>

      <div className="flex justify-center">{renderContent()}</div>
    </div>
  );
}