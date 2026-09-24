import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.js";
import { lookupPostalCode } from "../services/postal-code.service.js";

export const postalCodeRouter = Router();
postalCodeRouter.use(authMiddleware);

postalCodeRouter.get("/:cep", async (req, res) => {
  res.json(await lookupPostalCode(req.params.cep));
});
