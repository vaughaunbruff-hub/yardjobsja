require("dotenv").config();
const express=require("express"), helmet=require("helmet"), cookieParser=require("cookie-parser");
const rateLimit=require("express-rate-limit"), bcrypt=require("bcryptjs"), jwt=require("jsonwebtoken");
const {PrismaClient}=require("@prisma/client"), {z}=require("zod"), crypto=require("node:crypto"), path=require("node:path");
const app = express();
app.set("trust proxy", 1);
const prisma = new PrismaClient();
const PORT = Number(process.env.PORT || 3000);
const SECRET = process.env.JWT_SECRET;
if(!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
if(!SECRET||SECRET.length<32) throw new Error("JWT_SECRET must be at least 32 characters");
app.disable("x-powered-by"); app.use(helmet({crossOriginEmbedderPolicy:false})); app.use(express.json({limit:"100kb"})); app.use(cookieParser());
app.use("/api",rateLimit({windowMs:15*60*1000,limit:300})); app.use(express.static(path.join(__dirname,"..","public")));
const id=p=>`${p}-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
function session(res,u){res.cookie("yj_session",jwt.sign({sub:u.id},SECRET,{expiresIn:"7d"}),{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",maxAge:604800000,path:"/"});}
async function auth(req,res,next){try{const t=req.cookies.yj_session;if(!t)return res.status(401).json({error:"Please sign in."});const d=jwt.verify(t,SECRET);const u=await prisma.user.findUnique({where:{id:d.sub}});if(!u||u.status!=="ACTIVE")return res.status(401).json({error:"Account is not active."});req.user=u;next();}catch{return res.status(401).json({error:"Session expired. Please sign in again."});}}
const roles=(...r)=>(req,res,next)=>req.user&&r.includes(req.user.role)?next():res.status(403).json({error:"Not authorized."});
app.get("/api/health",(_q,s)=>s.json({ok:true,service:"yardjobsja"}));
app.post("/api/register",wrap(async(req,res)=>{const d=z.object({fullName:z.string().trim().min(2).max(100),email:z.string().trim().email().max(254).transform(v=>v.toLowerCase()),password:z.string().min(12).max(128),role:z.enum(["CUSTOMER","TASKER"]),phone:z.string().trim().max(30).optional()}).parse(req.body);const u=await prisma.user.create({data:{accountId:id(d.role==="TASKER"?"TK":"CT"),fullName:d.fullName,email:d.email,passwordHash:await bcrypt.hash(d.password,12),role:d.role,status:"ACTIVE",phone:d.phone||null,...(d.role==="TASKER"?{taskerProfile:{create:{skills:[],serviceAreas:[]}}}:{})},select:{id:true,accountId:true,fullName:true,email:true,role:true,status:true}});session(res,u);res.status(201).json({user:u});}));
app.post("/api/login", wrap(async (req, res) => {
  const data = z.object({
    email: z.string().trim().email().max(254)
      .transform(value => value.toLowerCase()),
    password: z.string().min(1).max(128)
  }).parse(req.body);

  const approvedAdmins = new Set(
    (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map(email => email.trim().toLowerCase())
      .filter(Boolean)
  );

  let user = await prisma.user.findUnique({
    where: { email: data.email }
  });

  if (
    !user ||
    user.status !== "ACTIVE" ||
    !(await bcrypt.compare(data.password, user.passwordHash))
  ) {
    return res.status(401).json({
      error: "Email or password is incorrect."
    });
  }

  // Only an explicitly approved email can receive admin privileges.
  if (approvedAdmins.has(user.email) && user.role !== "ADMIN") {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { role: "ADMIN" }
    });
  }

  session(res, user);

  return res.json({
    user: {
      accountId: user.accountId,
      fullName: user.fullName,
      email: user.email,
      role: user.role
    }
  });
}));
app.post("/api/logout",(_q,s)=>{s.clearCookie("yj_session",{httpOnly:true,sameSite:"lax",path:"/"});s.json({ok:true});});
app.get("/api/me",auth,(q,s)=>{const {id,accountId,fullName,email,role,phone,createdAt}=q.user;s.json({user:{id,accountId,fullName,email,role,phone,createdAt}});});
app.get("/api/tasks",wrap(async(_q,s)=>{const tasks=await prisma.task.findMany({where:{status:"OPEN"},orderBy:{createdAt:"desc"},take:50,select:{bookingId:true,title:true,description:true,category:true,parish:true,area:true,budgetJmd:true,scheduledAt:true,createdAt:true,status:true}});s.json({tasks});}));
app.post("/api/tasks",auth,roles("CUSTOMER"),wrap(async(q,s)=>{const d=z.object({title:z.string().trim().min(4).max(120),description:z.string().trim().min(10).max(4000),category:z.string().trim().min(2).max(80),parish:z.string().trim().min(2).max(80),area:z.string().trim().max(120).optional(),budgetJmd:z.number().int().positive().max(100000000).optional(),scheduledAt:z.string().datetime().optional()}).parse(q.body);const task=await prisma.task.create({data:{bookingId:id("JOB"),customerId:q.user.id,...d,scheduledAt:d.scheduledAt?new Date(d.scheduledAt):null},select:{bookingId:true,title:true,description:true,category:true,parish:true,area:true,budgetJmd:true,scheduledAt:true,status:true,createdAt:true}});s.status(201).json({task});}));
app.post("/api/tasks/:bookingId/offers",auth,roles("TASKER"),wrap(async(q,s)=>{const d=z.object({requestedJmd:z.number().int().positive().max(100000000),message:z.string().trim().max(2000).optional(),proposedAt:z.string().datetime().optional()}).parse(q.body);const task=await prisma.task.findUnique({where:{bookingId:q.params.bookingId}});if(!task||task.status!=="OPEN")return s.status(404).json({error:"Job not available."});if(task.customerId===q.user.id)return s.status(400).json({error:"You cannot offer on your own job."});const fee=Math.round(d.requestedJmd*.10);const offer=await prisma.offer.create({data:{offerId:id("OFF"),taskId:task.id,taskerId:q.user.id,requestedJmd:d.requestedJmd,platformFeeJmd:fee,customerTotalJmd:d.requestedJmd+fee,message:d.message||null,proposedAt:d.proposedAt?new Date(d.proposedAt):null},select:{offerId:true,requestedJmd:true,platformFeeJmd:true,customerTotalJmd:true,message:true,proposedAt:true,status:true}});s.status(201).json({offer,feeNotice:"A 10% platform commission is added to your requested amount and shown to the customer."});}));
app.post("/api/payment-tickets",auth,roles("CUSTOMER"),wrap(async(q,s)=>{const d=z.object({bookingId:z.string().min(5).max(100),method:z.enum(["LYNK","BPAY","NCB_TRANSFER","CIBC_TRANSFER","OTHER"]),amountJmd:z.number().int().positive().max(100000000),transactionRef:z.string().trim().min(3).max(160),receiptUrl:z.string().url().max(1000).optional()}).parse(q.body);const task=await prisma.task.findUnique({where:{bookingId:d.bookingId}});if(!task||task.customerId!==q.user.id)return s.status(404).json({error:"Booking not found."});const ticket=await prisma.paymentTicket.create({data:{ticketId:id("PAY"),customerId:q.user.id,taskId:task.id,method:d.method,amountJmd:d.amountJmd,transactionRef:d.transactionRef,receiptUrl:d.receiptUrl||null,status:"AWAITING_REVIEW"},select:{ticketId:true,status:true,amountJmd:true,submittedAt:true}});s.status(201).json({ticket,notificationDelivery:"NOT_CONFIGURED",notificationEmail:process.env.TICKET_NOTIFICATION_EMAIL||"yardjobsja@gmail.com",message:"Awaiting authorized payment review. Receipt or reference alone does not confirm payment."});}));
app.get("/api/admin/payment-tickets",auth,roles("ADMIN"),wrap(async(_q,s)=>{const tickets=await prisma.paymentTicket.findMany({orderBy:{submittedAt:"asc"},take:200,include:{customer:{select:{accountId:true,fullName:true,email:true}},task:{select:{bookingId:true,title:true}}}});s.json({tickets});}));
app.patch("/api/admin/payment-tickets/:ticketId",auth,roles("ADMIN"),wrap(async(q,s)=>{const d=z.object({status:z.enum(["UNDER_REVIEW","MORE_INFO_REQUIRED","PAYMENT_VERIFIED","PAYMENT_REJECTED","ESCALATED"]),adminNotes:z.string().trim().max(3000).optional()}).parse(q.body);const old=await prisma.paymentTicket.findUnique({where:{ticketId:q.params.ticketId}});if(!old)return s.status(404).json({error:"Ticket not found."});const ticket=await prisma.paymentTicket.update({where:{ticketId:q.params.ticketId},data:{status:d.status,adminNotes:d.adminNotes||null,reviewedById:q.user.id,reviewedAt:new Date()},select:{ticketId:true,status:true,adminNotes:true,reviewedAt:true}});await prisma.auditLog.create({data:{actorId:q.user.id,action:"PAYMENT_TICKET_STATUS_CHANGED",targetType:"PaymentTicket",targetId:old.id,details:{status:d.status}}});s.json({ticket});}));
app.use((e,_q,s,_n)=>{if(e instanceof z.ZodError)return s.status(400).json({error:"Please check the submitted information.",details:e.issues.map(i=>({field:i.path.join("."),message:i.message}))});if(e.code==="P2002")return s.status(409).json({error:"That account or record already exists."});console.error(e);s.status(500).json({error:"Something went wrong. Please try again."});});
const server=app.listen(PORT,()=>console.log(`Yardjobsja listening on ${PORT}`));
async function close(){server.close();await prisma.$disconnect();process.exit(0)}process.on("SIGTERM",close);process.on("SIGINT",close);
