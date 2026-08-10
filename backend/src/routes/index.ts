import { Router } from "express";

import { dashboard } from "../controllers/analytics-controller.js";
import { login } from "../controllers/auth-controller.js";
import { changeOwnership, createCustomer, listCustomers } from "../controllers/customer-controller.js";
import { createTask, listTasks, updateTask } from "../controllers/task-controller.js";
import { authenticate } from "../middleware/auth.js";

export const apiRouter = Router();

apiRouter.post("/auth/login", login);
apiRouter.use(authenticate);
apiRouter.get("/customers", listCustomers);
apiRouter.post("/customers", createCustomer);
apiRouter.patch("/customers/:id/ownership", changeOwnership);
apiRouter.get("/tasks", listTasks);
apiRouter.post("/tasks", createTask);
apiRouter.patch("/tasks/:id", updateTask);
apiRouter.get("/analytics/dashboard", dashboard);
