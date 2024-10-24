import express from "express";
import allRoutes from "./routes/index.route";
import { createClient } from "redis";
import { wsService } from './services/websocket.service';
import cors from 'cors';

const app = express();
export const redisClient = createClient();
export const subscriber = createClient();
export const requestQueue = "requestQueue";
export const responseQueue = "responseQueue";

app.use(cors());
app.use(express.json());

app.use("/", allRoutes);

// Subscribe to Redis updates
subscriber.subscribe("updates", (message) => {
  try {
    const data = JSON.parse(message);
    if (data.stockSymbol) {
      wsService.broadcast(data.stockSymbol, {
        event: "event_orderbook_update",
        message: JSON.stringify(data)
      });
    }
  } catch (error) {
    console.error('Error processing Redis message:', error);
  }
});

async function startServer() {
  try {
    await redisClient.connect();
    await subscriber.connect();
    console.log("Connected to Redis");

    app.listen(3005, () => {
      console.log("Server is running on port 3005");
    });
  } catch (error) {
    console.error("Failed to connect to Redis", error);
    process.exit(1);
  }
}

process.on('SIGTERM', () => {
  wsService.close();
  redisClient.quit();
  subscriber.quit();
  process.exit(0);
});

startServer();