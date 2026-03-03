import type { PeerInfo, PresenceData } from '$lib/types/collab';

export interface RemoteCursor {
  cursor: { x: number; y: number };
  color: string;
  displayName: string;
}

class CollabStore {
  connected = $state(false);
  reconnecting = $state(false);
  myPeerId = $state('');
  peers = $state<PeerInfo[]>([]);
  remoteCursors = $state<Map<string, RemoteCursor>>(new Map());
  remoteSelections = $state<Map<string, string[]>>(new Map());

  setConnected(connected: boolean) {
    this.connected = connected;
    if (!connected) {
      this.reconnecting = true;
    }
  }

  setJoined(peerId: string, peers: PeerInfo[]) {
    this.myPeerId = peerId;
    this.peers = peers;
    this.connected = true;
    this.reconnecting = false;
  }

  addPeer(peer: PeerInfo) {
    this.peers = [...this.peers, peer];
  }

  removePeer(peerId: string) {
    this.peers = this.peers.filter((p) => p.peerId !== peerId);
    const cursors = new Map(this.remoteCursors);
    cursors.delete(peerId);
    this.remoteCursors = cursors;
    const selections = new Map(this.remoteSelections);
    selections.delete(peerId);
    this.remoteSelections = selections;
  }

  updatePresence(peerId: string, data: PresenceData) {
    const peer = this.peers.find((p) => p.peerId === peerId);
    if (!peer) return;

    if (data.cursor) {
      const cursors = new Map(this.remoteCursors);
      cursors.set(peerId, {
        cursor: data.cursor,
        color: peer.color,
        displayName: peer.displayName,
      });
      this.remoteCursors = cursors;
    }

    if (data.selectedTableIds) {
      const selections = new Map(this.remoteSelections);
      selections.set(peerId, data.selectedTableIds);
      this.remoteSelections = selections;
    }
  }

  reset() {
    this.connected = false;
    this.reconnecting = false;
    this.myPeerId = '';
    this.peers = [];
    this.remoteCursors = new Map();
    this.remoteSelections = new Map();
  }
}

export const collabStore = new CollabStore();
