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
app.post("/api/tasks/:bookingId/offers",auth,roles("TASKER"),wrap(async(q,s)=>{const d=z.object({requestedJmd:z.number().int().positive().max(100000000),message:z.string().trim().max(2000).optional(),proposedAt:z.string().datetime().optional()}).parse(q.body);const task=await prisma.task.findUnique({where:{bookingId:q.params.bookingId}});if(!task||task.status!=="OPEN")return s.status(404).json({error:"Job not available."});if(task.customerId===q.user.id)return s.status(400).json({error:"You cannot offer on your own job."});const fee=Math.round(d.requestedJmd*.10);const offer=await prisma.offer.create({data:{offerId:id("OFF"),taskId:task.id,taskerId:q.user.id,requestedJmd:d.requestedJmd,platformFeeJmd:fee,customerTotalJmd:d.requestedJmd+fee,message:d.message||null,proposedAt:d.proposedAt?new Date(d.proposedAt):null},select:{offerId:true,requestedJmd:true,platformFeeJmd:true,customerTotalJmd:true,message:true,proposedAt:true,status:true}});s.status(201).json({
  offer: {
    offerId: offer.offerId,
    requestedJmd: offer.requestedJmd,
    platformFeeJmd: offer.platformFeeJmd,
    customerTotalJmd: offer.customerTotalJmd,
    message: offer.message,
    proposedAt: offer.proposedAt,
    status: offer.status
  },
  message: "Your offer has been submitted."
});}));
/* =========================================
   CUSTOMER TASK HISTORY AND OFFERS
========================================= */

app.get(
  "/api/my-tasks",
  auth,
  roles("CUSTOMER"),
  wrap(async (req, res) => {
    const tasks = await prisma.task.findMany({
      where: {
        customerId: req.user.id
      },
      orderBy: {
        createdAt: "desc"
      },
      include: {
        offers: {
          orderBy: {
            createdAt: "asc"
          },
          select: {
            offerId: true,
            requestedJmd: true,
            customerTotalJmd: true,
            message: true,
            proposedAt: true,
            status: true,
            createdAt: true,
            tasker: {
              select: {
                accountId: true,
                fullName: true,
                taskerProfile: {
                  select: {
                    bio: true,
                    skills: true,
                    serviceAreas: true,
                    verificationStatus: true
                  }
                }
              }
            }
          }
        }
      }
    });

    res.json({ tasks });
  })
);


/* =========================================
   CUSTOMER ACCEPTS A TASKER OFFER
========================================= */

app.post(
  "/api/tasks/:bookingId/offers/:offerId/accept",
  auth,
  roles("CUSTOMER"),
  wrap(async (req, res) => {
    const outcome = await prisma.$transaction(async (tx) => {
      const task = await tx.task.findUnique({
        where: {
          bookingId: req.params.bookingId
        }
      });

      if (!task || task.customerId !== req.user.id) {
        return {
          error: "Task not found.",
          status: 404
        };
      }

      if (task.status !== "OPEN") {
        return {
          error: "This task is no longer open for offer selection.",
          status: 409
        };
      }

      const offer = await tx.offer.findUnique({
        where: {
          offerId: req.params.offerId
        },
        select: {
          id: true,
          offerId: true,
          taskId: true,
          taskerId: true,
          requestedJmd: true,
          platformFeeJmd: true,
          customerTotalJmd: true,
          status: true
        }
      });

      if (!offer || offer.taskId !== task.id) {
        return {
          error: "Offer not found for this task.",
          status: 404
        };
      }

      if (offer.status !== "PENDING") {
        return {
          error: "This offer is no longer available.",
          status: 409
        };
      }

      const updatedTask = await tx.task.updateMany({
        where: {
          id: task.id,
          status: "OPEN"
        },
        data: {
          status: "OFFER_SELECTED",
          selectedTaskerId: offer.taskerId
        }
      });

      if (updatedTask.count !== 1) {
        return {
          error: "This task has already been selected or changed.",
          status: 409
        };
      }

      await tx.offer.update({
        where: {
          id: offer.id
        },
        data: {
          status: "ACCEPTED"
        }
      });

      await tx.offer.updateMany({
        where: {
          taskId: task.id,
          id: {
            not: offer.id
          },
          status: "PENDING"
        },
        data: {
          status: "DECLINED"
        }
      });

      return {
        task: {
          bookingId: task.bookingId,
          status: "OFFER_SELECTED"
        },
        offer: {
          offerId: offer.offerId,
          customerTotalJmd: offer.customerTotalJmd
        },
        message:
          "Offer accepted. Continue to payment to proceed."
      };
    });

    if (outcome.error) {
      return res.status(outcome.status).json({
        error: outcome.error
      });
    }

    res.json(outcome);
  })
);
app.post(
  "/api/payment-tickets",
  auth,
  roles("CUSTOMER"),
  wrap(async (req, res) => {
    const data = z.object({
      bookingId: z.string().min(5).max(100),
      method: z.enum([
        "LYNK",
        "BPAY",
        "NCB_TRANSFER",
        "CIBC_TRANSFER",
        "OTHER"
      ]),
      amountJmd: z.number().int().positive().max(100000000),
      transactionRef: z.string().trim().min(3).max(160),
      receiptUrl: z.string().url().max(1000).optional()
    }).parse(req.body);
    const outcome = await prisma.$transaction(async (tx) => {
      const task = await tx.task.findUnique({
        where: {
          bookingId: data.bookingId
        }
      });
      if (!task || task.customerId !== req.user.id) {
        return {
          error: "Booking not found.",
          status: 404
        };
      }
      if (
        task.status !== "OFFER_SELECTED" ||
        !task.selectedTaskerId
      ) {
        return {
          error: "Accept a tasker's offer before submitting payment.",
          status: 409
        };
      }
      const acceptedOffer = await tx.offer.findFirst({
        where: {
          taskId: task.id,
          taskerId: task.selectedTaskerId,
          status: "ACCEPTED"
        },
        select: {
          customerTotalJmd: true
        }
      });
      if (!acceptedOffer) {
        return {
          error: "No accepted offer was found for this booking.",
          status: 409
        };
      }
      if (data.amountJmd !== acceptedOffer.customerTotalJmd) {
        return {
          error: "The payment amount must match the accepted offer's total.",
          status: 400
        };
      }
      const existingTicket = await tx.paymentTicket.findFirst({
        where: {
          taskId: task.id,
          status: {
            notIn: [
              "PAYMENT_REJECTED",
              "CANCELLED"
            ]
          }
        },
        select: {
          ticketId: true,
          status: true
        }
      });
      if (existingTicket) {
        return {
          error: "A payment ticket already exists for this booking.",
          status: 409
        };
      }
      const ticket = await tx.paymentTicket.create({
        data: {
          ticketId: id("PAY"),
          customerId: req.user.id,
          taskId: task.id,
          method: data.method,
          amountJmd: data.amountJmd,
          transactionRef: data.transactionRef,
          receiptUrl: data.receiptUrl || null,
          status: "AWAITING_REVIEW"
        },
        select: {
          ticketId: true,
          status: true,
          amountJmd: true,
          submittedAt: true
        }
      });
      return {
        ticket
      };
    });
    if (outcome.error) {
      return res.status(outcome.status).json({
        error: outcome.error
      });
    }
    res.status(201).json({
      ticket: outcome.ticket,
      notificationDelivery: "NOT_CONFIGURED",
      notificationEmail:
        process.env.TICKET_NOTIFICATION_EMAIL ||
        "yardjobsja@gmail.com",
      message:
        "Your payment details have been submitted. " +
        "Your booking remains unconfirmed until an admin verifies payment."
    });
  })
);
app.get("/api/admin/payment-tickets",auth,roles("ADMIN"),wrap(async(_q,s)=>{const tickets=await prisma.paymentTicket.findMany({orderBy:{submittedAt:"asc"},take:200,include:{customer:{select:{accountId:true,fullName:true,email:true}},task:{select:{bookingId:true,title:true}}}});s.json({tickets});}));
app.patch(
  "/api/admin/payment-tickets/:ticketId",
  auth,
  roles("ADMIN"),
  wrap(async (req, res) => {
    const data = z.object({
      status: z.enum([
        "UNDER_REVIEW",
        "MORE_INFO_REQUIRED",
        "PAYMENT_VERIFIED",
        "PAYMENT_REJECTED",
        "ESCALATED"
      ]),
      adminNotes: z.string().trim().max(3000).optional()
    }).parse(req.body);

    const outcome = await prisma.$transaction(async (tx) => {
      const ticket = await tx.paymentTicket.findUnique({
        where: {
          ticketId: req.params.ticketId
        }
      });

      if (!ticket) {
        return {
          error: "Payment ticket not found.",
          status: 404
        };
      }

      if (ticket.status === "PAYMENT_VERIFIED") {
        return {
          error: "This payment has already been verified and cannot be changed.",
          status: 409
        };
      }

      if (data.status === "PAYMENT_VERIFIED") {
        const task = await tx.task.findUnique({
          where: {
            id: ticket.taskId
          }
        });

        if (
          !task ||
          task.customerId !== ticket.customerId ||
          task.status !== "OFFER_SELECTED" ||
          !task.selectedTaskerId
        ) {
          return {
            error: "The booking is not eligible for payment verification.",
            status: 409
          };
        }

        const acceptedOffer = await tx.offer.findFirst({
          where: {
            taskId: task.id,
            taskerId: task.selectedTaskerId,
            status: "ACCEPTED"
          },
          select: {
            customerTotalJmd: true
          }
        });

        if (
          !acceptedOffer ||
          ticket.amountJmd !== acceptedOffer.customerTotalJmd
        ) {
          return {
            error: "The payment amount does not match the accepted offer.",
            status: 409
          };
        }

        const updatedTask = await tx.task.updateMany({
          where: {
            id: task.id,
            customerId: ticket.customerId,
            status: "OFFER_SELECTED",
            selectedTaskerId: task.selectedTaskerId
          },
          data: {
            status: "BOOKED"
          }
        });

        if (updatedTask.count !== 1) {
          return {
            error: "The booking changed during verification. Please refresh and try again.",
            status: 409
          };
        }
      }

      const updatedTicket = await tx.paymentTicket.update({
        where: {
          id: ticket.id
        },
        data: {
          status: data.status,
          adminNotes: data.adminNotes || null,
          reviewedById: req.user.id,
          reviewedAt: new Date()
        },
        select: {
          ticketId: true,
          status: true,
          adminNotes: true,
          reviewedAt: true
        }
      });

      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          action: "PAYMENT_TICKET_STATUS_CHANGED",
          targetType: "PaymentTicket",
          targetId: ticket.id,
          details: {
            status: data.status,
            bookingId: (
              await tx.task.findUnique({
                where: {
                  id: ticket.taskId
                },
                select: {
                  bookingId: true
                }
              })
            )?.bookingId || null
          }
        }
      });

      return {
        ticket: updatedTicket,
        bookingConfirmed: data.status === "PAYMENT_VERIFIED"
      };
    });

    if (outcome.error) {
      return res.status(outcome.status).json({
        error: outcome.error
      });
    }

    res.json({
      ticket: outcome.ticket,
      bookingConfirmed: outcome.bookingConfirmed,
      message: outcome.bookingConfirmed
        ? "Payment verified and booking confirmed."
        : "Payment ticket status updated."
    });
  })
);
app.use((e,_q,s,_n)=>{if(e instanceof z.ZodError)return s.status(400).json({error:"Please check the submitted information.",details:e.issues.map(i=>({field:i.path.join("."),message:i.message}))});if(e.code==="P2002")return s.status(409).json({error:"That account or record already exists."});console.error(e);s.status(500).json({error:"Something went wrong. Please try again."});});
const server=app.listen(PORT,()=>console.log(`Yardjobsja listening on ${PORT}`));
async function close(){server.close();await prisma.$disconnect();process.exit(0)}process.on("SIGTERM",close);process.on("SIGINT",close);
