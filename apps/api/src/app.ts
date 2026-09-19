import "express-async-errors";
import { faceRouter } from "./routes/face.routes.js";
import { autopointRouter } from "./routes/autopoint.routes.js";

import { logsRouter } from "./routes/logs.routes.js";
import { teamRouter,auditRouter } from "./routes/team.routes.js";
import { writeSystemLog } from "./services/system-log.service.js";
import { writeAudit } from "./utils/audit.js";
import { notificationsRouter } from "./routes/notifications.routes.js";
import { automationRouter } from "./routes/automation.routes.js";
import { remotePunchRouter } from "./routes/remote-punch.routes.js";
import { groupsRouter } from "./routes/groups.routes.js";
import { adjustmentsRouter } from "./routes/adjustments.routes.js";
import express from "express";
import cors from "cors";
import { env } from "./config/env.js";
import { healthRouter } from "./routes/health.routes.js";
import { authRouter } from "./routes/auth.routes.js";
import { employeesRouter } from "./routes/employees.routes.js";
import { timeEntriesRouter } from "./routes/time-entries.routes.js";
import { reportsRouter } from "./routes/reports.routes.js";
import { companiesRouter } from "./routes/companies.routes.js";
import { schedulesRouter } from "./routes/schedules.routes.js";
import { dashboardRouter } from "./routes/dashboard.routes.js";
import { holidaysRouter } from "./routes/holidays.routes.js";
import { absencesRouter } from "./routes/absences.routes.js";
import { calculationsRouter } from "./routes/calculations.routes.js";
import { settingsRouter } from "./routes/settings.routes.js";
import { saasRouter } from "./routes/saas.routes.js";
import { locationsRouter } from "./routes/locations.routes.js";
import { devicesRouter } from "./routes/devices.routes.js";
import { mailTrackingRouter } from "./routes/mail-tracking.routes.js";
import { billingRouter } from "./routes/billing.routes.js";
import { paymentWebhookRouter } from "./routes/payment-webhook.routes.js";

export const app = express();
app.use("/mail",mailTrackingRouter);
app.use(cors({origin(origin,callback){const allowed=env.CORS_ORIGINS.split(",").map(x=>x.trim());if(!origin||allowed.includes(origin))return callback(null,true);callback(new Error("Origin não permitida pelo CORS."));},credentials:true}));
app.use(express.json({limit:"3mb"}));
app.use("/webhooks",paymentWebhookRouter);
app.use("/team",teamRouter);app.use("/audit",auditRouter);
app.use("/automation",automationRouter);
app.use("/logs",logsRouter);
app.use("/remote-punch",remotePunchRouter);
app.use("/autopoint",autopointRouter);
app.get("/",(_req,res)=>res.json({name:"Ponto Certo SaaS API",version:"0.4.6",multiTenant:true,security:"SELFIE+DEVICE_BIOMETRIC+GEOFENCE+SCHEDULE"}));
app.use("/adjustments",adjustmentsRouter);app.use("/health",healthRouter);app.use("/auth",authRouter);app.use("/billing",billingRouter);app.use("/dashboard",dashboardRouter);app.use("/companies",companiesRouter);app.use("/employees",employeesRouter);app.use("/face",faceRouter);app.use("/groups",groupsRouter);app.use("/notifications",notificationsRouter);app.use("/schedules",schedulesRouter);app.use("/time-entries",timeEntriesRouter);app.use("/holidays",holidaysRouter);app.use("/absences",absencesRouter);app.use("/calculations",calculationsRouter);app.use("/reports",reportsRouter);app.use("/settings",settingsRouter);app.use("/saas",saasRouter);app.use("/locations",locationsRouter);app.use("/devices",devicesRouter);
app.use((err:any,req:express.Request,res:express.Response,_next:express.NextFunction)=>{
  if(req.auth && !["GET","HEAD","OPTIONS"].includes(req.method)) void writeAudit(req,"REQUEST_ERROR","request",null,undefined,undefined,"ERROR",{path:req.originalUrl,status:err?.status||500,errorName:err?.name||"Error",errorCode:err?.code||null,message:err?.message||"Falha na solicitação"}).catch(()=>{});
  if(err?.name==="ZodError")return res.status(400).json({message:"Confira os campos informados.",issues:err.flatten()});
  if(err?.status)return res.status(err.status).json({message:err.message,code:err.code});
  if(err?.code==="ER_DUP_ENTRY")return res.status(409).json({message:"Este registro já existe. Confira CNPJ, e-mail e identificadores."});
  console.error(err);
  if(req.auth?.companyId){
    void writeSystemLog({
      tenantId:req.auth.tenantId,
      companyId:Number(req.auth.companyId),
      level:"ERROR",
      module:"API",
      eventType:"API_INTERNAL_ERROR",
      message:"Erro interno ao processar uma solicitação da empresa.",
      details:{method:req.method,path:req.path,errorName:err?.name||"Error",errorCode:err?.code||null,errorMessage:err?.message||null}
    });
  }
  res.status(500).json({message:"Erro interno do servidor.",detail:env.NODE_ENV==="development"?err?.message:undefined});
});
