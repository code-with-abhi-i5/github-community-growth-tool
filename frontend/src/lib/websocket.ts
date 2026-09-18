type WsEventHandler = (data: Record<string, unknown>) => void;

class WebSocketClient {
  private ws: WebSocket | null = null;
  private handlers: Map<string, Set<WsEventHandler>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private userId: string = '';
  private subscribedJobs: Set<string> = new Set();

  connect(userId: string): void {
    this.userId = userId;
    this.doConnect();
  }

  private doConnect(): void {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;

        // Authenticate
        this.send({ type: 'auth', userId: this.userId });

        // Re-subscribe to jobs
        this.subscribedJobs.forEach((jobId) => {
          this.send({ type: 'subscribe', jobId });
        });
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const eventType = data.type as string;
          const handlers = this.handlers.get(eventType);
          if (handlers) {
            handlers.forEach((handler) => handler(data));
          }

          // Also emit to wildcard listeners
          const wildcardHandlers = this.handlers.get('*');
          if (wildcardHandlers) {
            wildcardHandlers.forEach((handler) => handler(data));
          }
        } catch (e) {
          console.error('Failed to parse WebSocket message', e);
        }
      };

      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        this.attemptReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error', error);
      };
    } catch (e) {
      console.error('Failed to create WebSocket', e);
      this.attemptReconnect();
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max WebSocket reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    console.log(`Reconnecting WebSocket in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => this.doConnect(), delay);
  }

  private send(data: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  subscribeToJob(jobId: string): void {
    this.subscribedJobs.add(jobId);
    this.send({ type: 'subscribe', jobId });
  }

  unsubscribeFromJob(jobId: string): void {
    this.subscribedJobs.delete(jobId);
    this.send({ type: 'unsubscribe', jobId });
  }

  on(event: string, handler: WsEventHandler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.handlers.get(event)?.delete(handler);
    };
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.handlers.clear();
    this.subscribedJobs.clear();
  }
}

export const wsClient = new WebSocketClient();
