export type StockType = "yes" | "no";

export interface UserBalance {
  balance: number;
  locked: number;
}

export interface StockBalance {
  quantity: number;
  locked: number;
}

export interface Order {
  type: "buy" | "sell" | "reverted";
  quantity: number;
}

export interface PriceLevel {
  total: number;
  orders: {
    [userId: string]: Order;
  };
}

export interface OrderbookSide {
  [price: string]: PriceLevel;
}

export interface Orderbook {
  yes: OrderbookSide;
  no: OrderbookSide;
}

export interface StockBalances {
  [symbol: string]: {
    yes: StockBalance;
    no: StockBalance;
  };
}
