import { Router, Request, Response } from 'express';
import {
  createSymbol,
  createUser,
  getINRBalance,
  getStockBalance,
  getAllINRBalance,
  getAllStockBalance,
  onrampINR,
  viewIndividualOrderbook,
  viewOrderbook,
  buyStock,
  placeSellOrder,
  resetData,
  mintTokens
} from "../contollers/index.controller";

const router: Router = Router();

// Define route handler type
type RouteHandler = (req: Request, res: Response) => Promise<void>;

router.post("/user/create/:userId", createUser as RouteHandler);

router.post("/symbol/create/:stockSymbol", createSymbol as RouteHandler);

router.get("/orderbook", viewOrderbook as RouteHandler);
router.get("/orderbook/:stockSymbol", viewIndividualOrderbook as RouteHandler);

router.get("/balances/inr", getAllINRBalance as RouteHandler);
router.get("/balances/stock", getAllStockBalance as RouteHandler);
router.get("/balance/inr/:userId", getINRBalance as RouteHandler);
router.get("/balance/stock/:userId", getStockBalance as RouteHandler);

router.post("/order/buy", buyStock as RouteHandler);
router.post("/order/sell", placeSellOrder as RouteHandler);
router.post("/trade/mint", mintTokens as RouteHandler);

router.post("/onramp/inr", onrampINR as RouteHandler);
router.post("/reset", resetData as RouteHandler);

export default router;