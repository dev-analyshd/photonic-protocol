import { Router, type IRouter } from "express";
import healthRouter from "./health";
import photonicRouter from "./photonic";

const router: IRouter = Router();

router.use(healthRouter);
router.use(photonicRouter);

export default router;
