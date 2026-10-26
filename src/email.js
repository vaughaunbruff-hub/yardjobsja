“use strict”;

const RESEND_API_URL = “https://api.resend.com/emails”;

function escapeHtml(value) {
return String(value ?? “”).replace(/[&<>”’]/g, (character) => ({
“&”: “&”,
“<”: “<”,
“>”: “>”,
‘”’: “"”,
“’”: “'”
})[character]);
}

function emailLayout(title, content) {
return <!doctype html> <html lang="en"> <head> <meta charset="utf-8"> <meta name="viewport" content="width=device-width"> </head> <body style="margin:0;background:#f3f7f4;font-family:Arial,sans-serif;color:#183126;"> <div style="max-width:600px;margin:0 auto;padding:28px 16px;"> <div style="background:#0b6b4f;color:#ffffff;padding:22px 24px;border-radius:12px 12px 0 0;"> <h1 style="margin:0;font-size:24px;">Yardjobsja</h1> <p style="margin:8px 0 0;">Find help. Find work.</p> </div> <div style="background:#ffffff;padding:26px 24px;border-radius:0 0 12px 12px;line-height:1.6;"> <h2 style="margin-top:0;">${escapeHtml(title)}</h2> ${content} <hr style="border:0;border-top:1px solid #e1e9e3;margin:28px 0 16px;"> <p style="font-size:12px;color:#65756b;"> Yardjobsja · Helping Jamaica get things done. </p> </div> </div> </body> </html>;
}

async function sendEmail({ to, subject, html, text }) {
const apiKey = process.env.RESEND_API_KEY;
const from = process.env.EMAIL_FROM;
const recipient = Array.isArray(to) ? to : [to];

if (!apiKey || !from || !recipient[0]) {
console.error(“Yardjobsja email not sent: email configuration is missing.”);
return {
accepted: false,
reason: “EMAIL_NOT_CONFIGURED”
};
}

try {
const response = await fetch(RESEND_API_URL, {
method: “POST”,
headers: {
Authorization: Bearer ${apiKey},
“Content-Type”: “application/json”
},
body: JSON.stringify({
from,
to: recipient,
subject,
html,
text
})
});

const result = await response.json().catch(() => ({}));
if (!response.ok) {
  console.error("Resend rejected an email request:", {
    status: response.status,
    message: result.message || result.name || "Provider rejected request"
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
console.error(“Yardjobsja email request failed:”, error.message);

return {
  accepted: false,
  reason: "NETWORK_ERROR"
};

}
}

async function sendWelcomeEmail(user) {
const name = escapeHtml(user.fullName);
const accountId = escapeHtml(user.accountId);
const isTasker = user.role === “TASKER”;

const title = isTasker
? “Welcome to Yardjobsja — start finding work”
: “Welcome to Yardjobsja”;

const message = isTasker
? “Your tasker account has been created. Complete your profile and explore available jobs across Jamaica.”
: “Your customer account has been created. You can post tasks, review offers and manage your bookings.”;

return sendEmail({
to: user.email,
subject: title,
html: emailLayout(title, <p>Hello ${name},</p> <p>${message}</p> <p><strong>Your account ID:</strong> ${accountId}</p> <p>Keep your account details secure. Yardjobsja will never ask you to email us your password.</p>),
text: Hello ${user.fullName},\n\n${message}\nYour account ID: ${user.accountId}\n\nYardjobsja
});
}

async function sendAdminTicketNotice(ticket, customer, bookingId, title) {
const adminEmail =
process.env.TICKET_NOTIFICATION_EMAIL || “yardjobsja@gmail.com”;

return sendEmail({
to: adminEmail,
subject: Yardjobsja payment ticket ${ticket.ticketId}: ${ticket.status},
html: emailLayout(“Payment ticket update”, <p>A payment ticket needs attention or has changed status.</p> <p><strong>Ticket:</strong> ${escapeHtml(ticket.ticketId)}</p> <p><strong>Booking:</strong> ${escapeHtml(bookingId)}</p> <p><strong>Task:</strong> ${escapeHtml(title)}</p> <p><strong>Customer:</strong> ${escapeHtml(customer.fullName)}</p> <p><strong>Customer account ID:</strong> ${escapeHtml(customer.accountId)}</p> <p><strong>Customer email:</strong> ${escapeHtml(customer.email)}</p> <p><strong>Payment method:</strong> ${escapeHtml(ticket.method)}</p> <p><strong>Amount:</strong> J$${Number(ticket.amountJmd).toLocaleString("en-JM")}</p> <p><strong>Status:</strong> ${escapeHtml(ticket.status)}</p> <p><strong>Transaction reference:</strong> ${escapeHtml(ticket.transactionRef)}</p> <p>Review this ticket in the Yardjobsja administrator dashboard.</p>),
text: [
“Yardjobsja payment ticket update”,
Ticket: ${ticket.ticketId},
Booking: ${bookingId},
Task: ${title},
Customer: ${customer.fullName},
Account ID: ${customer.accountId},
Email: ${customer.email},
Payment method: ${ticket.method},
Amount: J$${Number(ticket.amountJmd).toLocaleString("en-JM")},
Status: ${ticket.status},
Transaction reference: ${ticket.transactionRef}
].join(”\n”)
});
}

async function sendCustomerTicketStatus(ticket, customer, bookingId, title) {
const statusMessages = {
AWAITING_REVIEW: “Your payment information has been submitted and is waiting for review. Your booking is not confirmed yet.”,
UNDER_REVIEW: “Your payment is currently under review.”,
MORE_INFO_REQUIRED: “We need additional information to continue reviewing your payment. Please sign in to Yardjobsja or contact support.”,
PAYMENT_VERIFIED: “Your payment has been verified and your booking is confirmed.”,
PAYMENT_REJECTED: “Your payment could not be verified. Please contact support before submitting another payment.”,
ESCALATED: “Your payment ticket has been escalated for further review.”,
CANCELLED: “Your payment ticket has been cancelled. Contact support if you believe this is incorrect.”
};

const statusMessage =
statusMessages[ticket.status] ||
“Your payment ticket has been updated.”;

return sendEmail({
to: customer.email,
subject: Yardjobsja update: payment ticket ${ticket.ticketId},
html: emailLayout(“Your payment ticket has been updated”, <p>Hello ${escapeHtml(customer.fullName)},</p> <p>${escapeHtml(statusMessage)}</p> <p><strong>Ticket ID:</strong> ${escapeHtml(ticket.ticketId)}</p> <p><strong>Booking ID:</strong> ${escapeHtml(bookingId)}</p> <p><strong>Task:</strong> ${escapeHtml(title)}</p> <p><strong>Current status:</strong> ${escapeHtml(ticket.status)}</p> ${ticket.adminNotes ?Note from the review team: ${escapeHtml(ticket.adminNotes)}: ""} <p>If you need assistance, contact support@yardjobsja.com.</p>),
text: [
Hello ${customer.fullName},,
statusMessage,
Ticket ID: ${ticket.ticketId},
Booking ID: ${bookingId},
Task: ${title},
Status: ${ticket.status},
ticket.adminNotes ? Review team note: ${ticket.adminNotes} : “”,
“Support: support@yardjobsja.com”
].filter(Boolean).join(”\n\n”)
});
}

module.exports = {
sendEmail,
sendWelcomeEmail,
sendAdminTicketNotice,
sendCustomerTicketStatus,
emailLayout,
escapeHtml
};
