/**
 * Browsers cannot send UDP, so OSC goes through `npx strandlight-bridge`, which listens
 * on a localhost WebSocket and forwards JSON messages as real OSC over UDP.
 * Only localhost is ever contacted.
 */
export class OscClient {
  private ws: WebSocket | null = null;
  connected = false;
  onStatus: (connected: boolean) => void = () => {};

  connect(port = 8765): void {
    this.disconnect();
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    this.ws = ws;
    ws.onopen = () => {
      this.connected = true;
      this.onStatus(true);
    };
    ws.onclose = () => {
      this.connected = false;
      this.onStatus(false);
    };
    ws.onerror = () => ws.close();
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
    this.connected = false;
  }

  send(address: string, args: number[]): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ address, args }));
  }
}
