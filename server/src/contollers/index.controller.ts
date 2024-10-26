import { Request, Response } from "express";
import { redisClient } from "../index";

type StockType = "yes" | "no";

interface UserBalance {
  balance: number;
  locked: number;
}

interface StockBalance {
  quantity: number;
  locked: number;
}

interface Order {
  type: "buy" | "sell" | "reverted";
  quantity: number;
}

interface PriceLevel {
  total: number;
  orders: {
    [userId: string]: Order;
  };
}

interface OrderbookSide {
  [price: string]: PriceLevel;
}

interface Orderbook {
  yes: OrderbookSide;
  no: OrderbookSide;
}

interface StockBalances {
  [symbol: string]: {
    yes: StockBalance;
    no: StockBalance;
  };
}

export const initializeDummyData = async () => {
  try {
    // Initialize users with balances
    const users: Record<string, UserBalance> = {
      user1: { balance: 10000, locked: 0 },
      user2: { balance: 20000, locked: 0 },
      user3: { balance: 15000, locked: 0 },
    };

    for (const [userId, balance] of Object.entries(users)) {
      await redisClient.hSet("users", userId, JSON.stringify(balance));
    }

    // Initialize orderbook
    const orderbook: Record<string, Orderbook> = {
      BTC_USDT_10_Oct_2024_9_30: {
        yes: {
          "8.5": {
            total: 100,
            orders: {
              user1: { type: "reverted", quantity: 100 },
            },
          },
        },
        no: {
          "2": {
            total: 50,
            orders: {
              user2: { type: "sell", quantity: 50 },
            },
          },
        },
      },
    };

    await redisClient.hSet(
      "orderbook",
      "BTC_USDT_10_Oct_2024_9_30",
      JSON.stringify(orderbook["BTC_USDT_10_Oct_2024_9_30"])
    );

    // Initialize stock balances
    const stockBalances: Record<string, StockBalances> = {
      user1: {
        BTC_USDT_10_Oct_2024_9_30: {
          yes: { quantity: 100, locked: 0 },
          no: { quantity: 100, locked: 0 },
        },
      },
      user2: {
        BTC_USDT_10_Oct_2024_9_30: {
          yes: { quantity: 50, locked: 0 },
          no: { quantity: 50, locked: 0 },
        },
      },
    };

    for (const [userId, balances] of Object.entries(stockBalances)) {
      await redisClient.hSet("stockBalances", userId, JSON.stringify(balances));
    }
  } catch (error) {
    console.error("Error initializing dummy data:", error);
    throw error;
  }
};

export const createUser = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const userBalance: UserBalance = { balance: 0, locked: 0 };
    await redisClient.hSet("users", userId, JSON.stringify(userBalance));
    const stockBalances: StockBalances = {};
    await redisClient.hSet(
      "stockBalances",
      userId,
      JSON.stringify(stockBalances)
    );
    res.status(200).json({ msg: "User created successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to create user" });
  }
};

export const createSymbol = async (req: Request, res: Response) => {
  try {
    const { stockSymbol } = req.params;
    const orderbook: Orderbook = { yes: {}, no: {} };
    await redisClient.hSet("orderbook", stockSymbol, JSON.stringify(orderbook));
    res.status(200).json({ msg: "Symbol created successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to create symbol" });
  }
};

export const onrampINR = async (req: Request, res: Response) => {
  try {
    const { userId, amount } = req.body;
    const userBalanceStr = await redisClient.hGet("users", userId);
    if (!userBalanceStr) {
      return res.status(404).json({ error: "User not found" });
    }

    const userBalance: UserBalance = JSON.parse(userBalanceStr);
    userBalance.balance += amount;
    await redisClient.hSet("users", userId, JSON.stringify(userBalance));
    res.status(200).json({ msg: "INR onramped successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to onramp INR" });
  }
};

export const getINRBalance = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const userBalanceStr = await redisClient.hGet("users", userId);
    if (!userBalanceStr) {
      return res.status(404).json({ error: "User not found" });
    }
    res.status(200).json({ msg: JSON.parse(userBalanceStr) });
  } catch (error) {
    res.status(500).json({ error: "Failed to get balance" });
  }
};

export const getAllINRBalance = async (req: Request, res: Response) => {
  try {
    const balances = await redisClient.hGetAll("users");
    const parsedBalances = Object.fromEntries(
      Object.entries(balances).map(([key, value]) => [key, JSON.parse(value)])
    );
    res.status(200).json({ msg: parsedBalances });
  } catch (error) {
    res.status(500).json({ error: "Failed to get all INR balances" });
  }
};

export const getStockBalance = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const stockBalancesStr = await redisClient.hGet("stockBalances", userId);
    if (!stockBalancesStr) {
      return res.status(404).json({ error: "User not found" });
    }
    res.status(200).json({ msg: JSON.parse(stockBalancesStr) });
  } catch (error) {
    res.status(500).json({ error: "Failed to get stock balance" });
  }
};

export const getAllStockBalance = async (req: Request, res: Response) => {
  try {
    const balances = await redisClient.hGetAll("stockBalances");
    const parsedBalances = Object.fromEntries(
      Object.entries(balances).map(([key, value]) => [key, JSON.parse(value)])
    );
    res.status(200).json({ msg: parsedBalances });
  } catch (error) {
    res.status(500).json({ error: "Failed to get all stock balances" });
  }
};

export const viewOrderbook = async (req: Request, res: Response) => {
  try {
    const orderbooks = await redisClient.hGetAll("orderbook");
    const parsedOrderbooks = Object.fromEntries(
      Object.entries(orderbooks).map(([key, value]) => [key, JSON.parse(value)])
    );
    res.status(200).json({ msg: parsedOrderbooks });
  } catch (error) {
    res.status(500).json({ error: "Failed to get orderbook" });
  }
};

export const viewIndividualOrderbook = async (req: Request, res: Response) => {
  try {
    const { stockSymbol } = req.params;
    const orderbookStr = await redisClient.hGet("orderbook", stockSymbol);
    if (!orderbookStr) {
      return res.status(404).json({ error: "Symbol not found" });
    }
    res.status(200).json({ msg: JSON.parse(orderbookStr) });
  } catch (error) {
    res.status(500).json({ error: "Failed to get orderbook" });
  }
};

export const mintTokens = async (req: Request, res: Response) => {
  try {
    const { userId, stockSymbol, quantity } = req.body;

    const stockBalancesStr = await redisClient.hGet("stockBalances", userId);
    if (!stockBalancesStr) {
      return res.status(404).json({ error: "User not found" });
    }

    const stockBalances: StockBalances = JSON.parse(stockBalancesStr);
    if (!stockBalances[stockSymbol]) {
      stockBalances[stockSymbol] = {
        yes: { quantity: 0, locked: 0 },
        no: { quantity: 0, locked: 0 },
      };
    }

    stockBalances[stockSymbol].yes.quantity += quantity;
    stockBalances[stockSymbol].no.quantity += quantity;

    await redisClient.hSet(
      "stockBalances",
      userId,
      JSON.stringify(stockBalances)
    );
    res.status(200).json({ msg: "Tokens minted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to mint tokens" });
  }
};

export const buyStock = async (req: Request, res: Response) => {
  try {
    const { userId, stockSymbol, quantity, price, stockType } = req.body;

    // Type validation for stockType
    if (!isValidStockType(stockType)) {
      return res.status(400).json({ error: "Invalid stock type" });
    }

    const userBalanceStr = await redisClient.hGet("users", userId);
    if (!userBalanceStr) {
      return res.status(404).json({ error: "User not found" });
    }
    const userBalance: UserBalance = JSON.parse(userBalanceStr);

    const totalCost = price * quantity;
    if (userBalance.balance < totalCost) {
      return res.status(400).json({ error: "Insufficient balance" });
    }

    const orderbookStr = await redisClient.hGet("orderbook", stockSymbol);
    if (!orderbookStr) {
      return res.status(404).json({ error: "Symbol not found" });
    }

    const orderbook: Orderbook = JSON.parse(orderbookStr);
    const priceKey = (price / 100).toString();

    // Initialize the order sides if they don't exist
    if (!orderbook[stockType]) {
      orderbook[stockType] = {};
    }

    if (!orderbook[stockType][priceKey]) {
      orderbook[stockType][priceKey] = {
        total: 0,
        orders: {},
      };
    }

    orderbook[stockType][priceKey].total += quantity;
    orderbook[stockType][priceKey].orders[userId] = {
      type: "buy",
      quantity: Number(quantity),
    };

    userBalance.balance -= totalCost;
    userBalance.locked += totalCost;
    await redisClient.hSet("users", userId, JSON.stringify(userBalance));

    await redisClient.hSet("orderbook", stockSymbol, JSON.stringify(orderbook));

    await redisClient.publish(
      "updates",
      JSON.stringify({
        stockSymbol,
        ...orderbook,
      })
    );

    res.status(200).json({ msg: "Order placed successfully" });
  } catch (error) {
    console.error("Buy stock error:", error);
    res.status(500).json({ error: "Failed to place buy order" });
  }
};

export const placeSellOrder = async (req: Request, res: Response) => {
  try {
    const { userId, stockSymbol, quantity, price, stockType } = req.body;

    // Type validation for stockType
    if (!isValidStockType(stockType)) {
      return res.status(400).json({ error: "Invalid stock type" });
    }

    const stockBalancesStr = await redisClient.hGet("stockBalances", userId);
    if (!stockBalancesStr) {
      return res.status(404).json({ error: "User not found" });
    }

    const stockBalances: StockBalances = JSON.parse(stockBalancesStr);
    if (!stockBalances[stockSymbol]) {
      return res.status(400).json({ error: "Stock symbol not found" });
    }

    if (stockBalances[stockSymbol][stockType].quantity < quantity) {
      return res.status(400).json({ error: "Insufficient stock balance" });
    }

    const orderbookStr = await redisClient.hGet("orderbook", stockSymbol);
    if (!orderbookStr) {
      return res.status(404).json({ error: "Symbol not found" });
    }

    const orderbook: Orderbook = JSON.parse(orderbookStr);
    const priceKey = (price / 100).toString();

    if (!orderbook[stockType]) {
      orderbook[stockType] = {};
    }

    if (!orderbook[stockType][priceKey]) {
      orderbook[stockType][priceKey] = {
        total: 0,
        orders: {},
      };
    }

    orderbook[stockType][priceKey].total += quantity;
    orderbook[stockType][priceKey].orders[userId] = {
      type: "sell",
      quantity,
    };

    stockBalances[stockSymbol][stockType].quantity -= quantity;
    stockBalances[stockSymbol][stockType].locked += quantity;
    await redisClient.hSet(
      "stockBalances",
      userId,
      JSON.stringify(stockBalances)
    );

    await redisClient.hSet("orderbook", stockSymbol, JSON.stringify(orderbook));

    await redisClient.publish(
      "updates",
      JSON.stringify({
        stockSymbol,
        ...orderbook,
      })
    );

    res.status(200).json({ msg: "Sell order placed successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to place sell order" });
  }
};

// Type guard function to validate stockType
function isValidStockType(stockType: any): stockType is StockType {
  return stockType === "yes" || stockType === "no";
}

export const resetData = async (req: Request, res: Response) => {
  try {
    await redisClient.flushAll();
    await initializeDummyData();
    res.status(200).json({ msg: "Data reset successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to reset data" });
  }
};
