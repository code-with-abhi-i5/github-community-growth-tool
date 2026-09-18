import { WebSocketServer, WebSocket } from 'ws';
import { Server as HttpServer } from 'http';
import logger from '../config/logger';
import type { ItemStatusUpdate, JobProgress } from '../types';

interface ConnectedClient {
  ws: WebSocket;
  userId: string;
  subscribedJobs: Set<string>;
}

class WebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, ConnectedClient> = new Map();
  private clientIdCounter = 0;

  initialize(server: HttpServer): void {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws: WebSocket, req) => {
      const clientId = `client_${++this.clientIdCounter}`;

      // Extract userId from session cookie (simplified — in production, parse the session)
      const client: ConnectedClient = {
        ws,
        userId: '', // Will be set via auth message
        subscribedJobs: new Set(),
      };

      this.clients.set(clientId, client);
      logger.debug(`WebSocket client connected: ${clientId}`);

      ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(clientId, message);
        } catch (error) {
          logger.error('Invalid WebSocket message', { clientId, error });
        }
      });

      ws.on('close', () => {
        this.clients.delete(clientId);
        logger.debug(`WebSocket client disconnected: ${clientId}`);
      });

      ws.on('error', (error) => {
        logger.error('WebSocket error', { clientId, error: error.message });
        this.clients.delete(clientId);
      });

      // Send welcome
      this.send(ws, { type: 'connected', clientId });
    });

    // Heartbeat every 30 seconds
    setInterval(() => {
      this.clients.forEach((client, id) => {
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.ping();
        } else {
          this.clients.delete(id);
        }
      });
    }, 30000);

    logger.info('WebSocket server initialized');
  }

  private handleMessage(clientId: string, message: { type: string; [key: string]: unknown }): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    switch (message.type) {
      case 'auth':
        client.userId = message.userId as string;
        logger.debug(`WebSocket client authenticated: ${clientId} as ${client.userId}`);
        break;

      case 'subscribe':
        client.subscribedJobs.add(message.jobId as string);
        logger.debug(`Client ${clientId} subscribed to job ${message.jobId}`);
        break;

      case 'unsubscribe':
        client.subscribedJobs.delete(message.jobId as string);
        break;
    }
  }

  private send(ws: WebSocket, data: unknown): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  /**
   * Broadcast an item status update to all clients subscribed to a job.
   */
  broadcastItemUpdate(jobId: string, userId: string, update: ItemStatusUpdate): void {
    this.clients.forEach((client) => {
      if (client.userId === userId && client.subscribedJobs.has(jobId)) {
        this.send(client.ws, { type: 'item:status', ...update });
      }
    });
  }

  /**
   * Broadcast job progress update.
   */
  broadcastJobProgress(jobId: string, userId: string, progress: JobProgress): void {
    this.clients.forEach((client) => {
      if (client.userId === userId && client.subscribedJobs.has(jobId)) {
        this.send(client.ws, { type: 'job:progress', ...progress });
      }
    });
  }

  /**
   * Broadcast job status change.
   */
  broadcastJobStatus(jobId: string, userId: string, status: string): void {
    this.clients.forEach((client) => {
      if (client.userId === userId && client.subscribedJobs.has(jobId)) {
        this.send(client.ws, { type: 'job:status', jobId, status });
      }
    });
  }

  /**
   * Broadcast rate limit warning.
   */
  broadcastRateLimitWarning(jobId: string, userId: string, waitMs: number): void {
    this.clients.forEach((client) => {
      if (client.userId === userId && client.subscribedJobs.has(jobId)) {
        this.send(client.ws, {
          type: 'rate-limit:warning',
          jobId,
          waitMs,
          message: 'GitHub API rate limit detected. Processing paused automatically.',
        });
      }
    });
  }
}

export const wsService = new WebSocketService();
