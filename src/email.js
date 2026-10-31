const RESEND_API_URL = "https://api.resend.com/emails";

/* HTML SAFETY */

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };

    return entities[character];
  });
}

/* EMAIL TEMPLATE */

function emailLayout(title, content) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;background:#f3f7f4;font-family:Arial,sans-serif;color:#183126;">
  <div style="max-width:600px;margin:0 auto;padding:28px 16px;">
    <div style="background:#0b6b4f;color:#ffffff;padding:22px 24px;border-radius:12px 12px 0 0;">
      <h1 style="margin:0;font-size:24px;">Yardjobsja</h1>
      <p style="margin:8px 0 0;">Find help. Find work.</p>
    </div>
    <div style="background:#ffffff;padding:26px 24px;border-radius:0 0 12px 12px;line-height:1.6;">
      <h2 style="margin-top:0;">${escapeHtml(title)}</h2>
      ${content}
      <hr style="border:0;border-top:1px solid #e1e9e3;margin:28px 0 16px;">
      <p style="font-size:12px;color:#65756b;">Yardjobsja - Helping Jamaica get things done.</p>
      <p style="font-size:12px;color:#65756b;">Support: support@yardjobsja.com</p>
    </div>
  </div>
</body>
</html>`;
}

/* SEND EMAIL THROUGH RESEND */

async function sendEmail({ to, subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const recipients = Array.isArray(to) ? to : [to];

  if (
    !apiKey ||
    !from ||
    recipients.length === 0 ||
    recipients.some(
      (email) => typeof email !== "string" || !email.trim()
    )
  ) {
    console.error("Yardjobsja email configuration check:", {
  }

  try {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from,
        to: recipients,
        subject,
        html,
        text
      })
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error("Resend rejected an email request:", {
        status: response.status,
        message:
          result.message ||
          result.name ||
          "Provider rejected request"
      });

      return {
        accepted: false,
        reason: "PROVIDER_REJECTED",
        status: response.status
      };
    }

    return {
      accepted: true,
      id: result.id || null
    };
  } catch (error) {
    console.error(
      "Yardjobsja email request failed:",
      error.message
    );

    return {
      accepted: false,
      reason: "NETWORK_ERROR"
    };
  }
}

/* CUSTOMER AND TASKER WELCOME EMAILS */

async function sendWelcomeEmail(user) {
  const name = escapeHtml(user.fullName);
  const accountId = escapeHtml(user.accountId);
  const isTasker = user.role === "TASKER";

  const subject = isTasker
    ? "Welcome to Yardjobsja - Start finding work"
    : "Welcome to Yardjobsja";

  const message = isTasker
    ? "Your tasker account has been created. Complete your profile and explore available jobs across Jamaica."
    : "Your customer account has been created. You can post tasks, review offers and manage your bookings.";

  return sendEmail({
    to: user.email,
    subject,
    html: emailLayout(
      subject,
      `
        <p>Hello ${name},</p>
        <p>${escapeHtml(message)}</p>
        <p><strong>Your account ID:</strong> ${accountId}</p>
        <p>Keep your account details secure. Yardjobsja will never ask you to email us your password.</p>
      `
    ),
    text: [
      `Hello ${user.fullName},`,
      "",
      message,
      `Your account ID: ${user.accountId}`,
      "",
      "Yardjobsja",
      "Support: support@yardjobsja.com"
    ].join("\n")
  });
}

/* ADMIN PAYMENT-TICKET NOTIFICATION */

async function sendAdminTicketNotice(
  ticket,
  customer,
  bookingId,
  title
) {
  const adminEmail =
    process.env.TICKET_NOTIFICATION_EMAIL ||
    "yardjobsja@gmail.com";

  const amount = Number(ticket.amountJmd).toLocaleString("en-JM");

  return sendEmail({
    to: adminEmail,
    subject: `Yardjobsja payment ticket ${ticket.ticketId}: ${ticket.status}`,
    html: emailLayout(
      "Payment ticket update",
      `
        <p>A payment ticket has been submitted or its status has changed.</p>
        <p><strong>Ticket ID:</strong> ${escapeHtml(ticket.ticketId)}</p>
        <p><strong>Booking ID:</strong> ${escapeHtml(bookingId)}</p>
        <p><strong>Task:</strong> ${escapeHtml(title)}</p>
        <p><strong>Customer:</strong> ${escapeHtml(customer.fullName)}</p>
        <p><strong>Customer account ID:</strong> ${escapeHtml(customer.accountId)}</p>
        <p><strong>Customer email:</strong> ${escapeHtml(customer.email)}</p>
        <p><strong>Payment method:</strong> ${escapeHtml(ticket.method)}</p>
        <p><strong>Amount:</strong> J$${amount}</p>
        <p><strong>Status:</strong> ${escapeHtml(ticket.status)}</p>
        <p><strong>Transaction reference:</strong> ${escapeHtml(ticket.transactionRef)}</p>
        <p>Sign in to the Yardjobsja administrator dashboard to review this ticket.</p>
      `
    ),
    text: [
      "Yardjobsja payment ticket update",
      `Ticket ID: ${ticket.ticketId}`,
      `Booking ID: ${bookingId}`,
      `Task: ${title}`,
      `Customer: ${customer.fullName}`,
      `Customer account ID: ${customer.accountId}`,
      `Customer email: ${customer.email}`,
      `Payment method: ${ticket.method}`,
      `Amount: J$${amount}`,
      `Status: ${ticket.status}`,
      `Transaction reference: ${ticket.transactionRef}`
    ].join("\n")
  });
}

/* CUSTOMER PAYMENT-TICKET STATUS EMAIL */

async function sendCustomerTicketStatus(
  ticket,
  customer,
  bookingId,
  title
) {
  const statusMessages = {
    PAYMENT_SUBMITTED:
      "Your payment information has been submitted.",

    AWAITING_REVIEW:
      "Your payment information has been submitted and is waiting for review. Your booking is not confirmed yet.",

    UNDER_REVIEW:
      "Your payment is currently under review.",

    MORE_INFO_REQUIRED:
      "We need additional information to continue reviewing your payment. Please sign in to Yardjobsja or contact support.",

    PAYMENT_VERIFIED:
      "Your payment has been verified and your booking is confirmed.",

    PAYMENT_REJECTED:
      "Your payment could not be verified. Please contact support before submitting another payment.",

    ESCALATED:
      "Your payment ticket has been escalated for further review.",

    CANCELLED:
      "Your payment ticket has been cancelled. Contact support if you believe this is incorrect."
  };

  const statusMessage =
    statusMessages[ticket.status] ||
    "Your payment ticket has been updated.";

  const reviewNote = ticket.adminNotes
    ? `<p><strong>Note from the review team:</strong> ${escapeHtml(ticket.adminNotes)}</p>`
    : "";

  return sendEmail({
    to: customer.email,
    subject: `Yardjobsja update: payment ticket ${ticket.ticketId}`,
    html: emailLayout(
      "Your payment ticket has been updated",
      `
        <p>Hello ${escapeHtml(customer.fullName)},</p>
        <p>${escapeHtml(statusMessage)}</p>
        <p><strong>Ticket ID:</strong> ${escapeHtml(ticket.ticketId)}</p>
        <p><strong>Booking ID:</strong> ${escapeHtml(bookingId)}</p>
        <p><strong>Task:</strong> ${escapeHtml(title)}</p>
        <p><strong>Current status:</strong> ${escapeHtml(ticket.status)}</p>
        ${reviewNote}
        <p>If you need assistance, contact support@yardjobsja.com.</p>
      `
    ),
    text: [
      `Hello ${customer.fullName},`,
      "",
      statusMessage,
      "",
      `Ticket ID: ${ticket.ticketId}`,
      `Booking ID: ${bookingId}`,
      `Task: ${title}`,
      `Current status: ${ticket.status}`,
      ticket.adminNotes
        ? `Review team note: ${ticket.adminNotes}`
        : "",
      "",
      "Support: support@yardjobsja.com"
    ]
      .filter(Boolean)
      .join("\n")
  });
}

/* EXPORT FUNCTIONS */

module.exports = {
  sendEmail,
  sendWelcomeEmail,
  sendAdminTicketNotice,
  sendCustomerTicketStatus,
  emailLayout,
  escapeHtml
};
