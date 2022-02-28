import { Router } from 'express';
import loginRouter from "@routes/login";

// Export the base-router
const baseRouter = Router();

baseRouter.use("/login", loginRouter);

// Export default.
export default baseRouter;
