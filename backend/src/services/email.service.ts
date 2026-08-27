import axios from "axios";

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

// Helper to construct a standard dark-themed email layout
function buildEmailTemplate(title: string, contentHtml: string): string {
  return `
    <div style="background-color: #0a0a0f; color: #f3f4f6; font-family: monospace, sans-serif; padding: 40px 20px; line-height: 1.6;">
      <div style="max-width: 520px; margin: 0 auto; background-color: #12121a; border: 1px solid #1c1c2e; padding: 32px; border-radius: 6px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
        <!-- Logo/Header -->
        <div style="text-align: center; margin-bottom: 28px; border-bottom: 1px solid #1c1c2e; padding-bottom: 20px;">
          <span style="font-family: sans-serif; font-size: 24px; font-weight: bold; letter-spacing: 0.15em; color: #ffffff;">
            STOCK<span style="color: #00e5a0;">PULSE</span>
          </span>
          <div style="font-size: 9px; color: #9ca3af; letter-spacing: 0.2em; margin-top: 4px; text-transform: uppercase;">
            Virtual Portfolio & Thesis Log
          </div>
        </div>

        <!-- Title -->
        <h3 style="font-family: sans-serif; font-size: 18px; color: #00e5a0; letter-spacing: 0.05em; margin-top: 0; margin-bottom: 20px; text-transform: uppercase; text-align: center;">
          ${title}
        </h3>

        <!-- Core Message -->
        <div style="font-size: 13px; color: #d1d5db; margin-bottom: 24px;">
          ${contentHtml}
        </div>

        <!-- Footer Note -->
        <div style="font-size: 10px; color: #6b7280; text-align: center; border-top: 1px solid #1c1c2e; padding-top: 20px; margin-top: 28px;">
          This is an automated security transmission. Please do not reply directly to this message.
          <br />
          &copy; 2026 StockPulse Inc. All rights reserved.
        </div>
      </div>
    </div>
  `;
}

export class EmailService {
  private static getHeaders() {
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) {
      console.warn("[EmailService] BREVO_API_KEY is not defined in environment variables. Emails will be mocked to console.");
    }
    return {
      "api-key": apiKey || "",
      "Content-Type": "application/json",
    };
  }

  private static getSender() {
    return {
      name: process.env.EMAIL_FROM_NAME || "StockPulse",
      email: process.env.EMAIL_FROM || "no-reply@stockpulse.com",
    };
  }

  private static async sendEmail(toEmail: string, subject: string, htmlContent: string): Promise<boolean> {
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) {
      // Mocking output when API key is missing
      console.log(`\n================= MOCKED EMAIL SENDER =================`);
      console.log(`TO:      ${toEmail}`);
      console.log(`SUBJECT: ${subject}`);
      console.log(`BODY:    ${htmlContent.replace(/<[^>]*>/g, " ").trim().slice(0, 200)}...`);
      console.log(`=======================================================\n`);
      return true;
    }

    try {
      const payload = {
        sender: this.getSender(),
        to: [{ email: toEmail }],
        subject: subject,
        htmlContent: htmlContent,
      };

      const response = await axios.post(BREVO_API_URL, payload, { headers: this.getHeaders() });
      return response.status === 201 || response.status === 200;
    } catch (error: any) {
      // Diagnostic logging only, safe error abstraction for response routing
      console.error("[EmailService] Brevo API Transmission Error:", error.response?.data || error.message);
      return false;
    }
  }

  /** OTP Verification code to reset password */
  public static async sendPasswordResetOTP(email: string, otp: string): Promise<boolean> {
    const title = "Password Reset Request";
    const content = `
      We received a request to reset the password for your StockPulse account.
      <br /><br />
      Your verification code is:
      <div style="font-family: monospace; font-size: 28px; font-weight: bold; color: #ff3b5c; letter-spacing: 0.15em; background-color: #181824; border: 1px dashed #ff3b5c; padding: 12px; margin: 20px 0; text-align: center; border-radius: 4px;">
        ${otp}
      </div>
      This verification code is valid for <strong>10 minutes</strong>.
      <br /><br />
      If you did not request this password reset, please change your password immediately or alert security if you suspect unauthorized access.
    `;
    return this.sendEmail(email, "StockPulse password reset code", buildEmailTemplate(title, content));
  }

  /** OTP Verification code to verify email address */
  public static async sendEmailVerificationOTP(email: string, otp: string): Promise<boolean> {
    const title = "Confirm Email Registration";
    const content = `
      Thank you for registering at StockPulse. Please verify your email address to complete your account setup.
      <br /><br />
      Your email verification code is:
      <div style="font-family: monospace; font-size: 28px; font-weight: bold; color: #00e5a0; letter-spacing: 0.15em; background-color: #181824; border: 1px dashed #00e5a0; padding: 12px; margin: 20px 0; text-align: center; border-radius: 4px;">
        ${otp}
      </div>
      This code is valid for <strong>10 minutes</strong>.
      <br /><br />
      If you did not initiate this registration request, you can safely ignore this message.
    `;
    return this.sendEmail(email, "Verify your StockPulse email", buildEmailTemplate(title, content));
  }

  /** Welcoming new users */
  public static async sendWelcomeEmail(email: string, name: string): Promise<boolean> {
    const title = "Welcome to StockPulse";
    const content = `
      Welcome <strong>${name}</strong>,
      <br /><br />
      We are excited to have you on board! StockPulse provides you with premium AI-backed investment signals, real-time watchlist monitoring, portfolio tracking, and comprehensive technical scanners.
      <br /><br />
      To get started:
      <ul>
        <li>Set up your goals inside the virtual dashboard.</li>
        <li>Browse our live stock indicators.</li>
        <li>Manually input your external holdings in the portfolio section.</li>
      </ul>
      If you have any questions or need support, click the "Support" tab in your dashboard panel.
    `;
    return this.sendEmail(email, "Welcome to StockPulse!", buildEmailTemplate(title, content));
  }

  /** Security Alerts */
  public static async sendSecurityAlert(email: string, alertType: string, details: string): Promise<boolean> {
    const title = "Security Alert Triggered";
    const content = `
      This is an important security notice regarding your StockPulse account.
      <br /><br />
      <strong>Event Triggered</strong>: <span style="color: #ff3b5c; font-weight: bold;">${alertType}</span>
      <br />
      <strong>Details</strong>: ${details}
      <br />
      <strong>Timestamp</strong>: ${new Date().toUTCString()}
      <br /><br />
      If you did not execute this action, please reset your password immediately or contact administration to lock your account.
    `;
    return this.sendEmail(email, "StockPulse Security Alert", buildEmailTemplate(title, content));
  }

  /** KYC Verification Status Updates */
  public static async sendKYCStatusEmail(email: string, status: string, reason?: string): Promise<boolean> {
    const title = "KYC Verification Update";
    const isApproved = status.toUpperCase() === "VERIFIED";
    const color = isApproved ? "#00e5a0" : "#ff3b5c";
    
    const content = `
      Your KYC identity document submission status has been updated.
      <br /><br />
      Status: <strong style="color: ${color}; text-transform: uppercase;">${status}</strong>
      ${reason ? `<br /><br /><strong>Reason/Details</strong>: ${reason}` : ""}
      <br /><br />
      ${isApproved 
        ? "Your account features are fully unlocked! You can now participate in real-time IPO listings and broker connections." 
        : "Please review the rejection reason and re-submit your documents in the KYC tab."
      }
    `;
    return this.sendEmail(email, `StockPulse KYC Status: ${status}`, buildEmailTemplate(title, content));
  }

  /** Stock Alert Triggers */
  public static async sendStockAlertEmail(email: string, symbol: string, triggerType: string, price: number): Promise<boolean> {
    const title = "Stock Alert Triggered";
    const content = `
      One of your active stock alerts has matched the market parameters.
      <br /><br />
      <strong>Ticker Symbol</strong>: <span style="font-weight: bold; color: #ffffff;">${symbol}</span>
      <br />
      <strong>Condition met</strong>: ${triggerType}
      <br />
      <strong>Execution Price</strong>: ${price.toFixed(2)}
      <br /><br />
      Review this security in your Search Terminal to execute trades or modify signal alerts.
    `;
    return this.sendEmail(email, `Alert Triggered for ${symbol}`, buildEmailTemplate(title, content));
  }
}
