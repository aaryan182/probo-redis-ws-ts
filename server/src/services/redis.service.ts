import { createClient } from "redis";
import {
  UserBalance,
  StockBalances,
  Orderbook,
  TradeEvent,
} from "../types/trading.types";

class RedisService {
  private client: ReturnType<typeof createClient>;
  private publisher: ReturnType<typeof createClient>;

  constructor() {
    this.client = createClient();
    this.publisher = createClient();
    this.initialize();
  }

  private async initialize() {
    try {
      await this.client.connect();
      await this.publisher.connect();
    } catch (error) {
      console.error("Redis connection error:", error);
      process.exit(1);
    }
  }

  async hget(key: string, field: string): Promise<any> {
    const value = await this.client.hGet(key, field);
    return value ? JSON.parse(value) : null;
  }

  async hset(key: string, field: string, value: any): Promise<void> {
    await this.client.hSet(key, field, JSON.stringify(value));
  }

  async hgetall(key: string): Promise<any> {
    const data = await this.client.hGetAll(key);
    return Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, JSON.parse(v)])
    );
  }

  async hdel(key: string, field: string): Promise<void> {
    if (field === "all") {
      const fields = await this.client.hKeys(key);
      if (fields.length > 0) {
        await this.client.hDel(key, fields);
      }
    } else {
      await this.client.hDel(key, field);
    }
  }

  async publish(channel: string, message: TradeEvent): Promise<void> {
    await this.publisher.publish(channel, JSON.stringify(message));
  }

  async getUserBalance(userId: string): Promise<UserBalance | null> {
    return this.hget("users", userId);
  }

  async getStockBalances(userId: string): Promise<StockBalances | null> {
    return this.hget("stockBalances", userId);
  }

  async getOrderbook(symbol: string): Promise<Orderbook | null> {
    return this.hget("orderbook", symbol);
  }

  async quit(): Promise<void> {
    await this.client.quit();
    await this.publisher.quit();
  }
}

export const redisService = new RedisService();
