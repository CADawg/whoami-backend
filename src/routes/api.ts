import { Router } from 'express';
import loginRouter from "@routes/auth";
import vaultRouter from "@routes/vault";
import recoveryRouter from "@routes/recovery";

// Export the base-router
const baseRouter = Router();

baseRouter.use("/auth", loginRouter);
baseRouter.use("/vault", vaultRouter);
baseRouter.use("/recovery", recoveryRouter);

// Export default.
export default baseRouter;
