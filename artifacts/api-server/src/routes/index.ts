import { Router, type IRouter } from "express";
import healthRouter from "./health";
import meshyRouter from "./meshy";
import charactersRouter from "./characters";
import assetsRouter from "./assets";
import scenesRouter from "./scenes";
import animationsRouter from "./animations";
import batchRouter from "./batch";
import exportRouter from "./export";

const router: IRouter = Router();

router.use(healthRouter);
router.use(meshyRouter);
router.use(charactersRouter);
router.use(assetsRouter);
router.use(scenesRouter);
router.use(animationsRouter);
router.use(batchRouter);
router.use(exportRouter);

export default router;
