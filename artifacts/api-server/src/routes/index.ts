import { Router, type IRouter } from "express";
import healthRouter from "./health";
import studentHousingRouter from "./student-housing";

const router: IRouter = Router();

router.use(healthRouter);
router.use(studentHousingRouter);

export default router;
