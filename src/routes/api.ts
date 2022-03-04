import { Router } from 'express';
import loginRouter from "@routes/auth";

// Export the base-router
const baseRouter = Router();

baseRouter.use("/auth", loginRouter);

// Export default.
export default baseRouter;
