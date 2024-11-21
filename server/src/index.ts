import express from "express";
import allRoutes from "./routes/index.route";
import { WebSocket, WebSocketServer } from "ws";
import { createClient } from "redis";
import cors from "cors";

const app = express();

export const redisClient = createClient({
  url: "redis://localhost:6379",
});

export const subscriber = createClient({
  url: "redis://localhost:6379",
});

export const requestQueue = "requestQueue";

app.use(cors());
app.use(express.json());
app.use("/", allRoutes);

const wss = new WebSocketServer({ port: 8085 });

const subscriptions = new Map<string, Set<WebSocket>>();

// WebSocket server connection handling
wss.on("connection", (ws) => {
  console.log("New client connected");

  ws.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString());
      if (message.type === "subscribe" && message.stockSymbol) {
        // Add to subscriptions
        if (!subscriptions.has(message.stockSymbol)) {
          subscriptions.set(message.stockSymbol, new Set());
        }
        subscriptions.get(message.stockSymbol)?.add(ws);
        console.log(`Client subscribed to ${message.stockSymbol}`);
      }
    } catch (error) {
      console.error("Error processing WebSocket message:", error);
    }
  });

  ws.on("close", () => {
    subscriptions.forEach((subscribers) => {
      subscribers.delete(ws);
    });
    console.log("Client disconnected");
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
  });
});

// Handle Redis subscriber messages
subscriber.subscribe("updates", (message) => {
  try {
    const data = JSON.parse(message);
    if (data.stockSymbol) {
      const subscribers = subscriptions.get(data.stockSymbol);
      if (subscribers) {
        const updateMessage = JSON.stringify({
          event: "event_orderbook_update",
          message: JSON.stringify(data),
        });

        subscribers.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(updateMessage);
          }
        });
      }
    }
  } catch (error) {
    console.error("Error broadcasting message:", error);
  }
});

// Redis error handling
redisClient.on("error", (error) => {
  console.error("Redis Client Error:", error);
});

subscriber.on("error", (error) => {
  console.error("Redis Subscriber Error:", error);
});

// Server startup
async function startServer() {
  try {
    await redisClient.connect();
    await subscriber.connect();
    console.log("Connected to Redis successfully");

    const port = 3005;
    app.listen(port, () => {
      console.log(`HTTP Server is running on port ${port}`);
      console.log(`WebSocket Server is running on port 8085`);
    });
  } catch (error) {
    console.error("Failed to connect to Redis:", error);
    process.exit(1);
  }
}

process.on("SIGTERM", async () => {
  console.log("Shutting down gracefully...");
  wss.close(() => {
    console.log("WebSocket server closed");
  });
  await redisClient.quit();
  await subscriber.quit();
  process.exit(0);
});

startServer().catch((error) => {
  console.error("Server startup failed:", error);
  process.exit(1);
});

export default app;
