import { WebSocket, Server as WebSocketServer } from "ws";

export class WebSocketService {
  private wss: WebSocketServer;
  private subscribers: Map<string, Set<WebSocket>> = new Map();

  constructor(port: number) {
    this.wss = new WebSocketServer({ port });
    this.initialize();
  }

  private initialize() {
    this.wss.on("connection", (ws: WebSocket) => {
      console.log("Client connected to WebSocket");

      ws.on("message", (message: string) => {
        try {
          const data = JSON.parse(message.toString());
          if (data.type === "subscribe" && data.stockSymbol) {
            this.subscribe(data.stockSymbol, ws);
          }
        } catch (error) {
          console.error("Error processing WebSocket message:", error);
        }
      });

      ws.on("close", () => {
        this.removeSubscriber(ws);
      });

      ws.on("error", (error) => {
        console.error("WebSocket error:", error);
        this.removeSubscriber(ws);
      });
    });
  }

  private subscribe(symbol: string, ws: WebSocket) {
    if (!this.subscribers.has(symbol)) {
      this.subscribers.set(symbol, new Set());
    }
    this.subscribers.get(symbol)?.add(ws);
    console.log(`Subscribed to ${symbol}`);
  }

  private removeSubscriber(ws: WebSocket) {
    this.subscribers.forEach((subscribers, symbol) => {
      if (subscribers.has(ws)) {
        subscribers.delete(ws);
        if (subscribers.size === 0) {
          this.subscribers.delete(symbol);
        }
      }
    });
  }

  public broadcast(symbol: string, message: any) {
    const subscribers = this.subscribers.get(symbol);
    if (subscribers) {
      const messageString = JSON.stringify(message);
      subscribers.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(messageString);
        }
      });
    }
  }

  public close() {
    this.wss.close();
  }
}

export const wsService = new WebSocketService(8085);
