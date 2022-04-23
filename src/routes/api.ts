import { Router } from 'express';
import loginRouter from "@routes/auth";
import vaultRouter from "@routes/vault";

// Export the base-router
const baseRouter = Router();

baseRouter.use("/auth", loginRouter);
baseRouter.use("/vault", vaultRouter);

// Export default.
export default baseRouter;
