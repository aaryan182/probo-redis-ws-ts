import express from "express";
import { WebSocketServer, WebSocket, RawData } from "ws";
import { createClient } from "redis";

interface Client {
  ws: WebSocket;
  subscriptions: Set<string>;
}

const app = express();
const httpServer = app.listen(8080);
const clients: Map<string, Client> = new Map();

const redisClient = createClient({
  url: "redis://redis-service:6379",
});
const redisPublisher = createClient({
  url: "redis://redis-service:6379",
});

(async () => {
  try {
    await redisClient.connect();
    await redisPublisher.connect();
    console.log("Connected to Redis");
  } catch (error) {
    console.error("Error connecting to Redis:", error);
    process.exit(1);
  }
})();

const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (ws: WebSocket) => {
  const clientId = generateUniqueId();
  console.log("Client connected", clientId);

  clients.set(clientId, {
    ws,
    subscriptions: new Set(),
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
  });

  ws.on("message", async (message: RawData) => {
    try {
      const messageString = message.toString();
      const data = JSON.parse(messageString);

      if (data.type === "subscribe") {
        const { stockSymbol }: { stockSymbol: string } = data;

        const client = clients.get(clientId);
        if (client && !client.subscriptions.has(stockSymbol)) {
          const listener = (redisMessage: string) => {
            try {
              if (ws.readyState === WebSocket.OPEN) {
                const parsedMessage = JSON.parse(redisMessage);

                const wsResponse = {
                  event: "event_orderbook_update",
                  message: parsedMessage,
                };

                ws.send(JSON.stringify(wsResponse));
                console.log("Sent message:", JSON.stringify(wsResponse));
              }
            } catch (error) {
              console.error("Error processing Redis message:", error);
            }
          };

          await redisClient.subscribe(
            `sentToWebSocket.${stockSymbol}`,
            listener
          );
          client.subscriptions.add(stockSymbol);
        }
      }
    } catch (error) {
      console.error("Error processing client message:", error);
    }
  });

  ws.on("close", async () => {
    console.log("Client disconnected", clientId);
    const client = clients.get(clientId);

    if (client) {
      for (const stockSymbol of client.subscriptions) {
        await redisClient.unsubscribe(`sentToWebSocket.${stockSymbol}`);
      }
      clients.delete(clientId);
    }
  });
});

function generateUniqueId(): string {
  return Math.random().toString(36).slice(2, 11);
}
