import { Router } from "express";
import {
  buyStock,
  createSymbol,
  createUser,
  getINRBalance,
  getStockBalance,
  getINRBalance as getAllINRBalance,
  getStockBalance as getAllStockBalance,
  mintTokens,
  onrampINR,
  resetData,
  placeSellOrder,
  viewIndividualOrderbook,
  viewOrderbook,
} from "../contollers/index.controller";

const router: Router = Router();

router.post("/user/create/:userId", createUser);
router.post("/symbol/create/:stockSymbol", createSymbol);
router.get("/orderbook", viewOrderbook);
router.get("/balances/inr", getAllINRBalance);
router.get("/balances/stock", getAllStockBalance);
router.post("/reset", resetData);
router.get("/balance/inr/:userId", getINRBalance);
router.post("/onramp/inr", onrampINR);
router.get("/balance/stock/:userId", getStockBalance);
router.post("/order/buy", buyStock);
router.post("/order/sell", placeSellOrder);
router.get("/orderbook/:stockSymbol", viewIndividualOrderbook);
router.post("/trade/mint", mintTokens);

export default router;
