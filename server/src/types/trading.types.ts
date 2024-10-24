export interface UserBalance {
  balance: number;
  locked: number;
}

export interface StockPosition {
  quantity: number;
  locked: number;
}

export interface StockBalance {
  yes: StockPosition;
  no: StockPosition;
}

export interface StockBalances {
  [symbol: string]: StockBalance;
}

export interface Order {
  type: "reverted" | "sell";
  quantity: number;
}

export interface OrderLevel {
  total: number;
  orders: {
    [userId: string]: Order;
  };
}

export interface OrderSide {
  [price: string]: OrderLevel;
}

export interface Orderbook {
  yes: OrderSide;
  no: OrderSide;
}

export type StockType = "yes" | "no";

export interface WSSubscribeMessage {
  type: "subscribe";
  stockSymbol: string;
}

export interface WSOrderbookUpdate {
  event: "event_orderbook_update";
  message: string;
}

export interface TradeEvent {
  event: string;
  stockSymbol: string;
  message: any;
  userId?: string;
  quantity?: number;
  price?: number;
}

export interface OrderbookUpdateMessage {
  [stockType: string]: {
    [price: string]: {
      total: number;
      orders: {
        [userId: string]: {
          type: "reverted" | "sell";
          quantity: number;
        };
      };
    };
  };
}
