import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import Decimal from "decimal.js";
import { redisService } from "../services/redis.service";
import {
  UserBalance,
  StockBalances,
  Orderbook,
  StockType,
  Order,
  TradeEvent,
} from "../types/trading.types";

const ensureDecimal = (value: number | string | Decimal): Decimal => {
  return value instanceof Decimal ? value : new Decimal(value);
};

const scalePrice = (price: Decimal | number): number => {
  return Number(price) / 100;
};

const unscalePrice = (price: number): number => {
  return Math.floor(Number(price) * 100);
};

const isValidPrice = (price: Decimal): boolean => {
  return price.gte(1) && price.lte(10);
};

// ================ API Endpoints ================


const resetData = async (req: Request, res: Response): Promise<void> => {
  try {
    await redisService.hdel("users", "all");
    await redisService.hdel("orderbook", "all");
    await redisService.hdel("stockBalances", "all");
    await initializeDummyData();
    res.status(200).json({ msg: "Data reset successfully" });
    await redisService.publish("updates", {
      event: "dataReset",
      stockSymbol: "someStockSymbol",
      message: "someMessage",
    });
  } catch (error) {
    console.error("Reset data error:", error);
    res.status(500).json({ msg: "Failed to reset data" });
  }
  return Promise.resolve();
};

const createUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.params.userId || uuidv4();
    const userBalance: UserBalance = {
      balance: 0,
      locked: 0,
    };

    await redisService.hset("users", userId, userBalance);
    res.status(201).json({ msg: `User ${userId} created`, userId });
    await redisService.publish("updates", {
      event: "userCreated",
      stockSymbol: "",
      message: {},
      userId,
    });
  } catch (error) {
    console.error("Create user error:", error);
    res.status(500).json({ msg: "Failed to create user" });
  }
};

const createSymbol = async (req: Request, res: Response): Promise<void> => {
  const { symbolName } = req.params;
  try {
    if (!symbolName) {
      res.status(400).json({ msg: "Symbol name is required" });
      return;
    }

    const orderbook = await redisService.getOrderbook(symbolName);
    if (orderbook) {
      res.status(409).json({ msg: "Symbol already exists" });
      return;
    }

    const newOrderbook: Orderbook = { yes: {}, no: {} };
    await redisService.hset("orderbook", symbolName, newOrderbook);
    res.status(201).json({ msg: newOrderbook });
    await redisService.publish("updates", {
      event: "symbolCreated",
      stockSymbol: symbolName,
      message: "Symbol created successfully",
    });
  } catch (error) {
    console.error("Create symbol error:", error);
    res.status(500).json({ msg: "Failed to create symbol" });
  }
};

const getINRBalance = async (req: Request, res: Response): Promise<void> => {
  const { userId } = req.params;
  try {
    if (userId) {
      const userBalance = await redisService.getUserBalance(userId);
      if (userBalance) {
        res.json({ msg: userBalance });
      } else {
        res.status(404).json({ msg: "User not found" });
      }
    } else {
      const users = await redisService.hgetall("users");
      res.json({ msg: users || {} });
    }
  } catch (error) {
    console.error("Get INR balance error:", error);
    res.status(500).json({ msg: "Failed to retrieve INR balance" });
  }
};

const getStockBalance = async (req: Request, res: Response): Promise<void> => {
  const { userId } = req.params;
  try {
    const stockBalances = await redisService.hgetall("stockBalances");
    if (userId) {
      res.json({ msg: stockBalances[userId] || {} });
    } else {
      res.json({ msg: stockBalances || {} });
    }
  } catch (error) {
    console.error("Get stock balance error:", error);
    res.status(500).json({ msg: "Failed to retrieve stock balance" });
  }
};

const onrampINR = async (req: Request, res: Response): Promise<void> => {
  const { userId, amount } = req.body;
  try {
    if (!userId || !amount || isNaN(amount) || parseInt(amount) <= 0) {
      res.status(400).json({ msg: "Invalid input" });
      return;
    }

    const userBalance = await redisService.getUserBalance(userId);
    if (!userBalance) {
      res.status(404).json({ msg: "User not found" });
      return;
    }

    userBalance.balance =
      parseInt(userBalance.balance.toString()) + parseInt(amount);
    await redisService.hset("users", userId, userBalance);

    res.json({ msg: `Onramped ${userId} with amount ${amount}` });
    await redisService.publish("updates", {
      event: "balanceUpdated",
      stockSymbol: "",
      message: `Onramped ${userId} with amount ${amount}`,
      userId,
      price: userBalance.balance,
    });
  } catch (error) {
    console.error("Onramp INR error:", error);
    res.status(500).json({ msg: "Failed to onramp INR" });
  }
};

const buyStock = async (req: Request, res: Response): Promise<void> => {
  const { userId, stockSymbol, quantity, price, stockType } = req.body;
  try {
    await validateTradeInput(userId, stockSymbol, quantity, price, stockType);
    const decimalPrice = ensureDecimal(price);
    const scaledPrice = scalePrice(decimalPrice);
    const totalCost = ensureDecimal(quantity).times(decimalPrice);

    await checkSufficientBalance(userId, Number(totalCost));

    const orderbook = await redisService.getOrderbook(stockSymbol);
    if (!orderbook) {
      throw new Error("Orderbook not found");
    }

    const oppositeType: StockType = stockType === "yes" ? "no" : "yes";
    await processOrder(
      orderbook,
      stockSymbol,
      stockType,
      oppositeType,
      quantity,
      scaledPrice,
      userId
    );

    await matchOrders(stockSymbol);

    res.json({ msg: "Buy order placed and matching attempted" });
    await publishOrderUpdate(stockSymbol, stockType, userId, quantity, price);
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error("Buy stock error:", error);
      res.status(400).json({ msg: error.message });
    } else {
      console.error("Unknown error:", error);
      res.status(500).json({ msg: "Internal Server Error" });
    }
  }
};

const placeSellOrder = async (req: Request, res: Response): Promise<void> => {
  const { userId, stockSymbol, quantity, price, stockType } = req.body;
  try {
    await validateTradeInput(userId, stockSymbol, quantity, price, stockType);
    const decimalPrice = ensureDecimal(price);
    const scaledPrice = scalePrice(decimalPrice);

    await checkSufficientStockBalance(userId, stockSymbol, stockType, quantity);
    await placePendingOrder(
      stockSymbol,
      stockType,
      scaledPrice,
      quantity,
      userId,
      "sell"
    );
    await matchOrders(stockSymbol);

    res.json({ msg: "Sell order placed and matching attempted" });
    await publishOrderUpdate(stockSymbol, stockType, userId, quantity, price);
  } catch (error) {
    if (error instanceof Error) {
      console.error("Place sell order error:", error);
      res.status(400).json({ msg: error.message });
    } else {
      console.error("Unknown error:", error);
      res.status(500).json({ msg: "Internal Server Error" });
    }
  }
};

const mintTokens = async (req: Request, res: Response): Promise<void> => {
  const { userId, stockSymbol, quantity } = req.body;
  const price = 100;
  try {
    await validateMintTokensInput(userId, stockSymbol, quantity);
    const totalCost = quantity * price;
    await checkSufficientBalance(userId, totalCost);
    await updateBalancesAfterMinting(userId, stockSymbol, quantity, totalCost);

    res.json({
      msg: `Minted ${quantity} 'yes' and 'no' tokens for user ${userId}`,
    });
    await publishMintUpdate(userId, stockSymbol, quantity, price);
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error("Mint tokens error:", error);
      res.status(400).json({ msg: error.message });
    } else {
      console.error("Unknown error:", error);
      res.status(500).json({ msg: "Internal Server Error" });
    }
  }
};

const viewOrderbook = async (req: Request, res: Response): Promise<void> => {
  try {
    const orderbook = await redisService.hgetall("orderbook");
    res.json({ msg: orderbook || {} });
  } catch (error) {
    console.error("View orderbook error:", error);
    res.status(500).json({ msg: "Failed to retrieve orderbook" });
  }
};

const viewIndividualOrderbook = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { stockSymbol } = req.params;
  try {
    const orderbook = await redisService.getOrderbook(stockSymbol);
    if (!orderbook) {
      res.status(404).json({ msg: "Orderbook not found" });
      return;
    }
    res.json({ msg: orderbook });
  } catch (error) {
    console.error("View individual orderbook error:", error);
    res.status(500).json({ msg: "Failed to retrieve individual orderbook" });
  }
};

const cancelOrder = async (req: Request, res: Response): Promise<void> => {
  const { userId, stockSymbol, quantity, price, stockType } = req.body;
  try {
    await validateTradeInput(userId, stockSymbol, quantity, price, stockType);
    const scaledPrice = scalePrice(price);
    await cancelExistingOrder(
      stockSymbol,
      stockType,
      scaledPrice,
      quantity,
      userId
    );

    res.json({ msg: "Order canceled successfully" });
    await publishCancelUpdate(userId, stockSymbol, quantity, price, stockType);
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error("Cancel order error:", error);
      res.status(400).json({ msg: error.message });
    } else {
      console.error("Unknown error:", error);
      res.status(500).json({ msg: "Internal Server Error" });
    }
  }
};

// ================ Helper Functions ================

async function validateTradeInput(
  userId: string,
  stockSymbol: string,
  quantity: number,
  price: number | string,
  stockType: StockType
): Promise<void> {
  if (!userId || !stockSymbol || !quantity || !price || !stockType) {
    throw new Error("Missing required parameters");
  }

  const decimalPrice = ensureDecimal(price);

  if (quantity <= 0 || !Number.isInteger(quantity)) {
    throw new Error("Quantity must be a positive integer");
  }

  if (!isValidPrice(decimalPrice)) {
    throw new Error("Price must be between 1 and 10");
  }

  if (stockType !== "yes" && stockType !== "no") {
    throw new Error("Invalid stock type");
  }
}

async function checkSufficientBalance(
  userId: string,
  amount: number
): Promise<void> {
  const userBalance = await redisService.getUserBalance(userId);
  if (!userBalance) {
    throw new Error("User not found");
  }
  if (userBalance.balance < amount) {
    throw new Error("Insufficient balance");
  }
}

async function checkSufficientStockBalance(
  userId: string,
  stockSymbol: string,
  stockType: StockType,
  quantity: number
): Promise<void> {
  const stockBalances = await redisService.getStockBalances(userId);
  if (
    !stockBalances ||
    !stockBalances[stockSymbol] ||
    !stockBalances[stockSymbol][stockType] ||
    stockBalances[stockSymbol][stockType].quantity < quantity
  ) {
    throw new Error("Insufficient stock balance");
  }
}

async function processOrder(
  orderbook: Orderbook,
  stockSymbol: string,
  stockType: StockType,
  oppositeType: StockType,
  quantity: number,
  scaledPrice: number,
  userId: string
): Promise<void> {
  const oppositeOrders = orderbook[oppositeType];
  const prices = Object.keys(oppositeOrders)
    .map(Number)
    .sort((a, b) => a - b);

  let remainingQuantity = quantity;
  let totalSpent = 0;

  for (const price of prices) {
    if (price > scaledPrice) break;

    const availableQuantity = oppositeOrders[price].total;
    const matchedQuantity = Math.min(remainingQuantity, availableQuantity);

    const order: Order = { quantity: matchedQuantity, type: "reverted" };
    await executeTrade(
      stockSymbol,
      price,
      matchedQuantity,
      { [userId]: order },
      oppositeOrders[price].orders
    );

    remainingQuantity -= matchedQuantity;
    totalSpent += matchedQuantity * unscalePrice(price);

    if (remainingQuantity === 0) break;
  }

  if (remainingQuantity > 0) {
    await placePendingOrder(
      stockSymbol,
      stockType,
      scaledPrice,
      remainingQuantity,
      userId,
      "reverted"
    );
  }
}

async function executeTrade(
  stockSymbol: string,
  price: number,
  quantity: number,
  yesOrders: { [userId: string]: Order },
  noOrders: { [userId: string]: Order }
): Promise<void> {
  const unscaledPrice = unscalePrice(price);

  for (const [yesUserId, yesQuantity] of Object.entries(yesOrders)) {
    for (const [noUserId, noOrder] of Object.entries(noOrders)) {
      const tradeQuantity = Math.min(
        yesQuantity.quantity,
        noOrder.quantity,
        quantity
      );
      await updateBalancesAfterTrade(
        yesUserId,
        noUserId,
        stockSymbol,
        unscaledPrice,
        tradeQuantity
      );

      quantity -= tradeQuantity;
      if (quantity === 0) return;
    }
  }
}

async function placePendingOrder(
  stockSymbol: string,
  stockType: StockType,
  price: number,
  quantity: number,
  userId: string,
  orderType: "reverted" | "sell"
): Promise<void> {
  const orderbook = await redisService.getOrderbook(stockSymbol);
  if (!orderbook) throw new Error("Orderbook not found");

  if (!orderbook[stockType][price]) {
    orderbook[stockType][price] = { total: 0, orders: {} };
  }

  orderbook[stockType][price].total += quantity;
  orderbook[stockType][price].orders[userId] = {
    type: orderType,
    quantity: quantity,
  };

  await redisService.hset("orderbook", stockSymbol, orderbook);

  if (orderType === "reverted") {
    const userBalance = await redisService.getUserBalance(userId);
    if (!userBalance) throw new Error("User not found");

    const totalCost = quantity * unscalePrice(price);
    userBalance.balance -= totalCost;
    userBalance.locked += totalCost;
    await redisService.hset("users", userId, userBalance);
  } else {
    const stockBalances = await redisService.getStockBalances(userId);
    if (!stockBalances) throw new Error("Stock balances not found");

    stockBalances[stockSymbol][stockType].quantity -= quantity;
    stockBalances[stockSymbol][stockType].locked += quantity;
    await redisService.hset("stockBalances", userId, stockBalances);
  }
}

async function updateBalancesAfterTrade(
  yesUserId: string,
  noUserId: string,
  stockSymbol: string,
  price: number,
  quantity: number
): Promise<void> {
  const [yesUser, noUser] = await Promise.all([
    redisService.getUserBalance(yesUserId),
    redisService.getUserBalance(noUserId),
  ]);

  if (!yesUser || !noUser) throw new Error("User not found");

  const [yesStocks, noStocks] = await Promise.all([
    redisService.getStockBalances(yesUserId),
    redisService.getStockBalances(noUserId),
  ]);

  if (!yesStocks || !noStocks) throw new Error("Stock balances not found");

  // Update user balances
  const tradeCost = price * quantity;
  yesUser.locked -= tradeCost;
  noUser.balance += tradeCost;

  // Update stock positions
  yesStocks[stockSymbol].yes.quantity += quantity;
  yesStocks[stockSymbol].yes.locked -= quantity;
  noStocks[stockSymbol].no.quantity -= quantity;
  noStocks[stockSymbol].no.locked -= quantity;

  await Promise.all([
    redisService.hset("users", yesUserId, yesUser),
    redisService.hset("users", noUserId, noUser),
    redisService.hset("stockBalances", yesUserId, yesStocks),
    redisService.hset("stockBalances", noUserId, noStocks),
  ]);
}

async function matchOrders(stockSymbol: string): Promise<void> {
  const orderbook = await redisService.getOrderbook(stockSymbol);
  if (!orderbook) return;

  const yesOrders = orderbook.yes;
  const noOrders = orderbook.no;

  const yesPrices = Object.keys(yesOrders)
    .map(Number)
    .sort((a, b) => b - a);
  const noPrices = Object.keys(noOrders)
    .map(Number)
    .sort((a, b) => a - b);

  while (yesPrices.length > 0 && noPrices.length > 0) {
    const yesPrice = yesPrices[0];
    const noPrice = noPrices[0];

    if (yesPrice + noPrice === 10.5) {
      const yesOrder = yesOrders[yesPrice];
      const noOrder = noOrders[noPrice];

      const matchQuantity = Math.min(
        parseInt(yesOrder.total.toString()),
        parseInt(noOrder.total.toString())
      );

      await executeTrade(
        stockSymbol,
        yesPrice,
        matchQuantity,
        yesOrder.orders,
        noOrder.orders
      );

      yesOrder.total -= matchQuantity;
      noOrder.total -= matchQuantity;

      if (yesOrder.total === 0) {
        delete yesOrders[yesPrice];
        yesPrices.shift();
      }
      if (noOrder.total === 0) {
        delete noOrders[noPrice];
        noPrices.shift();
      }
    } else if (yesPrice + noPrice > 10.5) {
      noPrices.shift();
    } else {
      yesPrices.shift();
    }
  }

  await redisService.hset("orderbook", stockSymbol, orderbook);
}

async function cancelExistingOrder(
  stockSymbol: string,
  stockType: StockType,
  price: number,
  quantity: number,
  userId: string
): Promise<void> {
  const orderbook = await redisService.getOrderbook(stockSymbol);
  if (!orderbook || !orderbook[stockType][price]?.orders[userId]) {
    throw new Error("Order not found");
  }

  const existingOrder = orderbook[stockType][price].orders[userId];
  const cancelQuantity = Math.min(quantity, existingOrder.quantity);

  orderbook[stockType][price].total -= cancelQuantity;
  existingOrder.quantity -= cancelQuantity;

  if (existingOrder.quantity === 0) {
    delete orderbook[stockType][price].orders[userId];
  }
  if (orderbook[stockType][price].total === 0) {
    delete orderbook[stockType][price];
  }

  await redisService.hset("orderbook", stockSymbol, orderbook);
  await updateBalancesAfterCancel(
    userId,
    stockSymbol,
    stockType,
    price,
    cancelQuantity
  );
}

async function updateBalancesAfterCancel(
  userId: string,
  stockSymbol: string,
  stockType: StockType,
  price: number,
  quantity: number
): Promise<void> {
  if (stockType === "yes") {
    const userBalance = await redisService.getUserBalance(userId);
    if (!userBalance) throw new Error("User not found");

    const unscaledPrice = unscalePrice(price);
    userBalance.locked -= quantity * unscaledPrice;
    userBalance.balance += quantity * unscaledPrice;
    await redisService.hset("users", userId, userBalance);
  } else {
    const stockBalances = await redisService.getStockBalances(userId);
    if (!stockBalances) throw new Error("Stock balances not found");

    stockBalances[stockSymbol][stockType].locked -= quantity;
    stockBalances[stockSymbol][stockType].quantity += quantity;
    await redisService.hset("stockBalances", userId, stockBalances);
  }
}

async function validateMintTokensInput(
  userId: string,
  stockSymbol: string,
  quantity: number
): Promise<void> {
  if (!userId || !stockSymbol || !quantity) {
    throw new Error("Missing required parameters for minting tokens");
  }

  if (quantity <= 0 || !Number.isInteger(quantity)) {
    throw new Error("Quantity must be a positive integer");
  }
}

async function updateBalancesAfterMinting(
  userId: string,
  stockSymbol: string,
  quantity: number,
  totalCost: number
): Promise<void> {
  const userBalance = await redisService.getUserBalance(userId);
  if (!userBalance) throw new Error("User not found");

  userBalance.balance -= totalCost;
  await redisService.hset("users", userId, userBalance);

  let stockBalances = (await redisService.getStockBalances(userId)) || {};
  if (!stockBalances[stockSymbol]) {
    stockBalances[stockSymbol] = {
      yes: { quantity: 0, locked: 0 },
      no: { quantity: 0, locked: 0 },
    };
  }

  stockBalances[stockSymbol].yes.quantity += quantity;
  stockBalances[stockSymbol].no.quantity += quantity;
  await redisService.hset("stockBalances", userId, stockBalances);
}

// ================ Update Publication Functions ================

async function publishOrderUpdate(
  stockSymbol: string,
  stockType: StockType,
  userId: string,
  quantity: number,
  price: number | string
): Promise<void> {
  const scaledPrice =
    typeof price === "number"
      ? scalePrice(price)
      : scalePrice(parseFloat(price));

  const event: TradeEvent = {
    event: "event_orderbook_update",
    stockSymbol,
    message: JSON.stringify({
      [stockType]: {
        [scaledPrice]: {
          total: quantity,
          orders: {
            [userId]: {
              type: stockType === "yes" ? "reverted" : "sell",
              quantity: quantity,
            },
          },
        },
      },
    }),
  };

  await redisService.publish("updates", event);
}

async function publishMintUpdate(
  userId: string,
  stockSymbol: string,
  quantity: number,
  price: number
): Promise<void> {
  const event: TradeEvent = {
    event: "event_orderbook_update",
    stockSymbol,
    message: JSON.stringify({
      tokensMinted: {
        userId,
        quantity,
        price: scalePrice(price),
      },
    }),
  };
  await redisService.publish("updates", event);
}

async function publishCancelUpdate(
  userId: string,
  stockSymbol: string,
  quantity: number,
  price: number | string,
  stockType: StockType
): Promise<void> {
  const event: TradeEvent = {
    event: "event_orderbook_update",
    stockSymbol,
    message: JSON.stringify({
      [stockType]: {
        [scalePrice(parseFloat(price as string))]: {
          total: 0,
          orders: {},
        },
      },
    }),
  };
  await redisService.publish("updates", event);
}

async function initializeDummyData(): Promise<void> {
  try {
    const users: Record<string, UserBalance> = {
      user1: { balance: 10000, locked: 0 },
      user2: { balance: 20000, locked: 5000 },
      user3: { balance: 15000, locked: 2000 },
    };

    for (const [userId, balance] of Object.entries(users)) {
      await redisService.hset("users", userId, balance);
    }

    const orderbook: Record<string, Orderbook> = {
      BTC_USDT_10_Oct_2024_9_30: {
        yes: {
          "9.5": {
            total: 1200,
            orders: {
              user1: { type: "reverted", quantity: 200 },
              user2: { type: "reverted", quantity: 1000 },
            },
          },
          "8.5": {
            total: 1200,
            orders: {
              user1: { type: "reverted", quantity: 300 },
              user2: { type: "reverted", quantity: 300 },
              user3: { type: "reverted", quantity: 600 },
            },
          },
        },
        no: {
          "10.5": {
            total: 800,
            orders: {
              user2: { type: "sell", quantity: 500 },
              user3: { type: "sell", quantity: 300 },
            },
          },
        },
      },
    };

    await redisService.hset(
      "orderbook",
      "BTC_USDT_10_Oct_2024_9_30",
      orderbook.BTC_USDT_10_Oct_2024_9_30
    );

    const stockBalances: Record<string, StockBalances> = {
      user1: {
        BTC_USDT_10_Oct_2024_9_30: {
          yes: { quantity: 100, locked: 0 },
          no: { quantity: 50, locked: 0 },
        },
      },
      user2: {
        BTC_USDT_10_Oct_2024_9_30: {
          yes: { quantity: 200, locked: 100 },
          no: { quantity: 150, locked: 50 },
        },
      },
      user3: {
        BTC_USDT_10_Oct_2024_9_30: {
          yes: { quantity: 150, locked: 50 },
          no: { quantity: 100, locked: 0 },
        },
      },
    };

    for (const [userId, balances] of Object.entries(stockBalances)) {
      await redisService.hset("stockBalances", userId, balances);
    }

    console.log("Dummy data initialized successfully");
  } catch (error) {
    console.error("Error initializing dummy data:", error);
    throw error;
  }
}

export {
  resetData,
  createUser,
  createSymbol,
  getINRBalance,
  getStockBalance,
  onrampINR,
  buyStock,
  placeSellOrder,
  viewOrderbook,
  cancelOrder,
  mintTokens,
  viewIndividualOrderbook,
  initializeDummyData,
};
