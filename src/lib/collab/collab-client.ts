import type { ClientMessage, ServerMessage } from '$lib/types/collab';

type MessageHandler = (msg: ServerMessage) => void;

export class CollabClient {
  private ws: WebSocket | null = null;
  private projectId: string | null = null;
  private handlers: MessageHandler[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private intentionalClose = false;
  private hasConnectedBefore = false;
  /** Tracks which projectId this connection was opened for */
  private connectingForProject: string | null = null;

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  get currentProjectId(): string | null {
    return this.projectId;
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  connect(projectId: string) {
    // Skip if already connected to the same project
    if (this.projectId === projectId && this.ws?.readyState === WebSocket.OPEN) return;

    this.intentionalClose = false;
    this.projectId = projectId;
    this.connectingForProject = projectId;
    this.reconnectDelay = 1000;
    this.hasConnectedBefore = false;
    this.createConnection();
  }

  disconnect() {
    this.intentionalClose = true;
    this.projectId = null;
    this.connectingForProject = null;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  send(msg: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private createConnection() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${window.location.host}/collab`;

    try {
      this.ws = new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      // Guard: if project changed during connection, abort
      if (this.projectId !== this.connectingForProject || !this.projectId) {
        this.ws?.close();
        return;
      }

      const isReconnect = this.hasConnectedBefore;
      this.reconnectDelay = 1000;
      this.hasConnectedBefore = true;

      // Join the project room
      this.send({ type: 'join', projectId: this.projectId });
      // On reconnect, request full schema sync
      if (isReconnect) {
        this.send({ type: 'request-sync' });
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const msg: ServerMessage = JSON.parse(event.data);

        // Guard: if we got a 'joined' for a project we've since left, ignore
        if (msg.type === 'joined' && this.projectId !== this.connectingForProject) {
          return;
        }

        for (const handler of this.handlers) {
          handler(msg);
        }
      } catch {
        // ignore malformed messages
      }
    };

    this.ws.onclose = () => {
      this.ws = null;
      // Notify handlers about disconnect
      for (const handler of this.handlers) {
        handler({ type: 'error', message: '__disconnected__' });
      }
      if (!this.intentionalClose && this.projectId) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      // onclose will fire after onerror
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.projectId && !this.intentionalClose) {
        this.connectingForProject = this.projectId;
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
        this.createConnection();
      }
    }, this.reconnectDelay);
  }
}

export const collabClient = new CollabClient();
