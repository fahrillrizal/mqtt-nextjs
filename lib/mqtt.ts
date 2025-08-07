import mqtt from 'mqtt';

export interface FileMessage {
  button: 'A' | 'B';
  fileName: string[];
  fileContent: string[];
  fileType: string;
  mediaType: 'image' | 'video' | 'text' | 'pdf';
  timestamp: number;
  isLocalFile?: boolean;
  filePath?: string;
}

export interface ButtonControlMessage {
  activeButton: 'A' | 'B';
  timestamp: number;
}

export interface MediaControlMessage {
  button: 'A' | 'B';
  action:
    | 'play'
    | 'pause'
    | 'seek_forward'
    | 'seek_backward'
    | 'zoom_in'
    | 'zoom_out'
    | 'zoom_reset'
    | 'move_up'
    | 'move_down'
    | 'move_left'
    | 'move_right'
    | 'move_reset'
    | 'scroll_stop'
    | 'scroll_speed_up'
    | 'scroll_speed_down';
  value?: number;
  timestamp: number;
}

type MessageCallback = (message: string, topic: string) => void;

class MQTTClient {
  private client: mqtt.MqttClient | null = null;
  private isConnected: boolean = false;
  private currentBroker: string = '';
  private subscribers: Map<string, MessageCallback[]> = new Map();
  private connectPromise: Promise<void> | null = null;

  async connect(): Promise<void> {
    if (this.connectPromise) {
      return this.connectPromise;
    }

    if (this.client && this.isConnected) {
      return Promise.resolve();
    }

    this.connectPromise = this.doConnect();

    try {
      await this.connectPromise;
    } finally {
      this.connectPromise = null;
    }
  }

  private async doConnect(): Promise<void> {
    const configs = [
      {
        name: process.env.NEXT_PUBLIC_MQTT_BROKER_NAME,
        url: process.env.NEXT_PUBLIC_MQTT_BROKER_URL,
        options: {
          clientId: `media_remote_${Date.now()}_${Math.random()
            .toString(16)
            .substr(2, 4)}`,
          clean: true,
          reconnectPeriod: 0,
          connectTimeout: 10000,
          keepalive: 60,
          username: process.env.NEXT_PUBLIC_MQTT_USERNAME,
          password: process.env.NEXT_PUBLIC_MQTT_PASSWORD,
        },
      },
    ];

    for (const config of configs) {
      try {
        await this.connectToBroker(config);
        this.setupMessageHandler();
        return;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.log(`Failed to connect to ${config.name}:`, errorMessage);
        continue;
      }
    }

    throw new Error('All connection attempts failed');
  }

  private connectToBroker(config: any): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client = mqtt.connect(config.url, config.options);
      this.currentBroker = config.name;

      const timeout = setTimeout(() => {
        this.client?.end(true);
        reject(new Error(`Timeout: ${config.name}`));
      }, config.options.connectTimeout);

      this.client.on('connect', () => {
        clearTimeout(timeout);
        this.isConnected = true;
        resolve();
      });

      this.client.on('error', (error) => {
        clearTimeout(timeout);
        this.client?.end(true);
        reject(error);
      });

      this.client.on('close', () => {
        this.isConnected = false;
      });

      this.client.on('offline', () => {
        this.isConnected = false;
      });
    });
  }

  private setupMessageHandler(): void {
    if (!this.client) return;

    this.client.on('message', (topic, message) => {
      const callbacks = this.subscribers.get(topic);
      if (callbacks) {
        const messageStr = message.toString();
        callbacks.forEach((callback) => callback(messageStr, topic));
      }
    });
  }

  async subscribe(topic: string, callback: MessageCallback): Promise<void> {
    await this.connect();

    if (!this.client || !this.isConnected) {
      throw new Error('MQTT client not connected');
    }

    if (!this.subscribers.has(topic)) {
      this.subscribers.set(topic, []);
      await new Promise((resolve, reject) => {
        this.client!.subscribe(topic, { qos: 0 }, (error) => {
          if (error) reject(error);
          else resolve(null);
        });
      });
    }

    this.subscribers.get(topic)!.push(callback);
  }

  async publish(topic: string, message: string): Promise<void> {
    await this.connect();

    if (!this.client || !this.isConnected) {
      throw new Error('MQTT client not connected');
    }

    await new Promise((resolve, reject) => {
      this.client!.publish(topic, message, { qos: 0 }, (error) => {
        if (error) reject(error);
        else resolve(null);
      });
    });
  }

  unsubscribe(topic: string, callback?: MessageCallback): void {
    const callbacks = this.subscribers.get(topic);
    if (!callbacks) return;

    if (callback) {
      const index = callbacks.indexOf(callback);
      if (index > -1) callbacks.splice(index, 1);
    } else {
      callbacks.length = 0;
    }

    if (callbacks.length === 0) {
      this.subscribers.delete(topic);
      if (this.client && this.isConnected) {
        this.client.unsubscribe(topic);
      }
    }
  }

  disconnect(): void {
    if (this.client) {
      this.client.end(true);
      this.isConnected = false;
      this.subscribers.clear();
    }
  }

  isClientConnected(): boolean {
    return this.isConnected && this.client?.connected === true;
  }

  getCurrentBroker(): string {
    return this.currentBroker;
  }

  async publishButtonControl(activeButton: 'A' | 'B'): Promise<void> {
    const message: ButtonControlMessage = {
      activeButton,
      timestamp: Date.now(),
    };
    await this.publish('home/buttonControl', JSON.stringify(message));
  }

  async publishMediaControl(
    button: 'A' | 'B',
    action: MediaControlMessage['action'],
    value?: number
  ): Promise<void> {
    const message: MediaControlMessage = {
      button,
      action,
      value,
      timestamp: Date.now(),
    };
    await this.publish('home/mediaControl', JSON.stringify(message));
  }
}

export const mqttClient = new MQTTClient();