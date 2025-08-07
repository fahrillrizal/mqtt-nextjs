import { useState, useEffect, useRef } from 'react';
import { mqttClient, FileMessage, MediaControlMessage } from '@/lib/mqtt';

export default function Remote() {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [connectionStatus, setConnectionStatus] = useState<string>('Connecting to MQTT...');
  const [selectedButton, setSelectedButton] = useState<'A' | 'B'>('A');
  const [uploadedMedia, setUploadedMedia] = useState<{
    [key: string]: {
      name: string[];
      type: string;
      isPlaying?: boolean;
    };
  }>({});
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        if (uploadedMedia[button]?.type === 'video' && !uploadedMedia[button].isPlaying) {
          await mqttClient.publishMediaControl(button, 'play');
          setUploadedMedia((prev) => ({
            ...prev,
            [button]: {
              ...prev[button],
              isPlaying: true,
            },
          }));
        }
      } catch (error) {
        console.error('Error sending button control:', error);
      }
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    if (!isConnected) {
      alert(`MQTT not connected. Status: ${connectionStatus}`);
      return;
    }

    setIsUploading(true);

    try {
      let mediaType: 'image' | 'video' | 'text' | 'pdf' = 'text';
      let fileNames: string[] = [];
      let fileContents: string[] = [];

      for (const file of Array.from(files)) {
        if (file.type.startsWith('image/')) {
          mediaType = 'image';
          const localUrl = URL.createObjectURL(file);
          fileNames.push(file.name);
          fileContents.push(localUrl);
        } else if (file.type.startsWith('video/')) {
          mediaType = 'video';
          const localUrl = URL.createObjectURL(file);
          fileNames.push(file.name);
          fileContents.push(localUrl);
        } else if (file.type === 'application/pdf') {
          mediaType = 'pdf';
          const localUrl = URL.createObjectURL(file);
          fileNames.push(file.name);
          fileContents.push(localUrl);
        } else {
          mediaType = 'text';
          const text = await file.text();
          fileNames.push(file.name);
          fileContents.push(text);
        }
      }

      const message: FileMessage = {
        button: selectedButton,
        fileName: fileNames,
        fileContent: fileContents,
        fileType: files[0].type,
        mediaType,
        timestamp: Date.now(),
        isLocalFile: true,
        filePath: fileNames.join(','),
      };

      const topic = `home/button${selectedButton}`;
      await mqttClient.publish(topic, JSON.stringify(message));

      setUploadedMedia((prev) => ({
        ...prev,
        [selectedButton]: {
          name: fileNames,
          type: mediaType,
          isPlaying: mediaType === 'video' ? true : false,
        },
      }));

      if (mediaType === 'video') {
        await mqttClient.publishMediaControl(selectedButton, 'play');
      }

      alert(`${mediaType} loaded successfully to Button ${selectedButton}`);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Error loading file:', error);
      alert('Error loading file');
    } finally {
      setIsUploading(false);
    }
  };

  const handleMediaControl = async (action: MediaControlMessage['action'], value?: number) => {
    if (!isConnected) {
      alert('MQTT not connected');
      return;
    }

    try {
      await mqttClient.publishMediaControl(selectedButton, action, value);

      if (action === 'play' || action === 'pause') {
        setUploadedMedia((prev) => ({
          ...prev,
          [selectedButton]: {
            ...prev[selectedButton],
            isPlaying: action === 'play',
          },
        }));
      }
    } catch (error) {
      console.error('Error sending media control:', error);
      alert('Error sending media control');
    }
  };

  return (
    <div className="bg-black text-white min-h-screen p-5">
      <h1 className="text-center mb-5 text-2xl">Media Remote Control</h1>

      <div className="text-center mb-8">
        <div
          className={`inline-block px-4 py-2 rounded-md text-sm ${
            isConnected ? 'bg-green-800' : 'bg-red-800'
          }`}
        >
          Status: {connectionStatus}
        </div>
      </div>

      <div className="mb-8">
        <h2 className="mb-4">Button Control</h2>
        <div className="flex gap-4 justify-center mb-5">
          <div
            className={`border-2 rounded-md p-4 cursor-pointer ${
              selectedButton === 'A'
                ? 'border-cyan-400 bg-teal-900'
                : 'border-gray-600 bg-gray-800'
            }`}
            onClick={() => handleButtonChange('A')}
          >
            <div className="font-bold text-base">Button A</div>
          </div>
          <div
            className="border-2 rounded-md p-4 cursor-pointer ${
              selectedButton === 'B'
                ? 'border-cyan-400 bg-teal-900'
                : 'border-gray-600 bg-gray-800'
            }"
            onClick={() => handleButtonChange('B')}
          >
            <div className="font-bold text-base">Button B</div>
          </div>
        </div>
      </div>

      {uploadedMedia[selectedButton] && (
        <div className="p-5 mb-8">
          {uploadedMedia[selectedButton].type === 'video' && (
            <div className="mb-5">
              <h4 className="mb-2">Video Controls</h4>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => handleMediaControl('play')}
                  disabled={uploadedMedia[selectedButton].isPlaying}
                  className={`px-4 py-2 rounded-sm text-white ${
                    uploadedMedia[selectedButton].isPlaying
                      ? 'cursor-not-allowed'
                      : 'bg-green-800'
                  }`}
                >
                  Play
                </button>
                <button
                  onClick={() => handleMediaControl('pause')}
                  disabled={!uploadedMedia[selectedButton].isPlaying}
                  className={`px-4 py-2 rounded-sm text-white ${
                    !uploadedMedia[selectedButton].isPlaying
                      ? 'cursor-not-allowed'
                      : 'bg-red-800'
                  }`}
                >
                  Pause
                </button>
                <button
                  onClick={() => handleMediaControl('seek_backward', 10)}
                  className="px-4 py-2 bg-blue-800 text-white rounded-sm"
                >
                  -10s
                </button>
                <button
                  onClick={() => handleMediaControl('seek_forward', 10)}
                  className="px-4 py-2 bg-blue-800 text-white rounded-sm"
                >
                  +10s
                </button>
              </div>
            </div>
          )}

          {uploadedMedia[selectedButton].type === 'image' && (
            <div className="mb-5">
              <h4 className="mb-2">Scroll Controls</h4>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => handleMediaControl('scroll_stop')}
                  className="px-4 py-2 bg-red-800 text-white rounded-sm"
                >
                  Stop Scroll
                </button>
                <button
                  onClick={() => handleMediaControl('scroll_speed_up')}
                  className="px-4 py-2 bg-blue-800 text-white rounded-sm"
                >
                  Speed Up
                </button>
                <button
                  onClick={() => handleMediaControl('scroll_speed_down')}
                  className="px-4 py-2 bg-blue-800 text-white rounded-sm"
                >
                  Slow Down
                </button>
              </div>
            </div>
          )}

          <div className="mb-5">
            <h4 className="mb-2">Zoom Controls</h4>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => handleMediaControl('zoom_in')}
                className="px-4 py-2 bg-blue-800 text-white rounded-sm"
              >
                Zoom In
              </button>
              <button
                onClick={() => handleMediaControl('zoom_out')}
                className="px-4 py-2 bg-blue-800 text-white rounded-sm"
              >
                Zoom Out
              </button>
              <button
                onClick={() => handleMediaControl('zoom_reset')}
                className="px-4 py-2 bg-red-700 text-white rounded-sm"
              >
                Reset Zoom
              </button>
            </div>
          </div>

          <div className="mb-5">
            <h4 className="mb-2">Navigation</h4>
            <div className="grid grid-cols-3 gap-2 max-w-[150px] mx-auto">
              <div></div>
              <button
                onClick={() => handleMediaControl('move_up')}
                className="p-2 bg-blue-900 text-white rounded-sm"
              >
                ↑
              </button>
              <div></div>
              <button
                onClick={() => handleMediaControl('move_left')}
                className="p-2 bg-blue-900 text-white rounded-sm"
              >
                ←
              </button>
              <button
                onClick={() => handleMediaControl('move_reset')}
                className="p-2 bg-gray-600 text-white rounded-sm text-xs"
              >
                Reset
              </button>
              <button
                onClick={() => handleMediaControl('move_right')}
                className="p-2 bg-blue-900 text-white rounded-sm"
              >
                →
              </button>
              <div></div>
              <button
                onClick={() => handleMediaControl('move_down')}
                className="p-2 bg-blue-900 text-white rounded-sm"
              >
                ↓
              </button>
              <div></div>
            </div>
          </div>
        </div>
      )}

      <div className="border-t border-gray-600 pt-5">
        <h2 className="mb-4">Load File to Button {selectedButton}</h2>
        <div className="text-center">
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileUpload}
            accept="image/*,video/*,text/*,.txt,.md,.json,.csv,.html,.css,.js,.py,.pdf"
            multiple
            disabled={isUploading}
            className="p-2 rounded-sm border border-gray-600 bg-gray-700 text-white w-full max-w-md"
          />
        </div>
      </div>
    </div>
  );
}