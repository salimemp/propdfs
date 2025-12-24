import { nanoid } from "nanoid";
import { eq, and, sql } from "drizzle-orm";
import { getDb } from "./db";
import { emailQueue, emailPreferences, emailTemplates, users } from "../drizzle/schema";
import type { InsertEmailQueueItem, EmailQueueItem, InsertEmailPreferences } from "../drizzle/schema";

// Types
export type EmailStatus = "queued" | "sending" | "sent" | "failed" | "bounced";

export interface EmailOptions {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text?: string;
  userId?: number;
  templateName?: string;
  variables?: Record<string, string>;
  scheduledFor?: Date;
}

export interface EmailTemplateData {
  name: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
  variables?: string[];
}

// Resend API configuration
const RESEND_API_URL = "https://api.resend.com/emails";
const FROM_EMAIL = "ProPDFs <noreply@propdfs.com>";
const FROM_NAME = "ProPDFs";

/**
 * Get Resend API key from environment
 */
function getResendApiKey(): string | null {
  return process.env.RESEND_API_KEY || null;
}

/**
 * Send an email using Resend API
 */
export async function sendEmail(options: EmailOptions): Promise<{ success: boolean; resendId?: string; error?: string }> {
  const apiKey = getResendApiKey();
  
  if (!apiKey) {
    console.warn("[Email] Resend API key not configured, email not sent");
    return { success: false, error: "Email service not configured" };
  }

  try {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [options.to],
        subject: options.subject,
        html: options.html,
        text: options.text,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return { success: true, resendId: data.id };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[Email] Failed to send:", errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Queue an email for sending
 */
export async function queueEmail(options: EmailOptions): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;

  const [result] = await db.insert(emailQueue).values({
    userId: options.userId,
    toEmail: options.to,
    toName: options.toName,
    templateName: options.templateName,
    subject: options.subject,
    htmlContent: options.html,
    textContent: options.text,
    variables: options.variables,
    status: "queued",
    scheduledFor: options.scheduledFor,
    retryCount: 0,
    maxRetries: 3,
  });

  return result.insertId;
}

/**
 * Process queued emails
 */
export async function processEmailQueue(limit: number = 10): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  // Get queued emails that are ready to send
  const emails = await db.select()
    .from(emailQueue)
    .where(and(
      eq(emailQueue.status, "queued"),
      sql`(${emailQueue.scheduledFor} IS NULL OR ${emailQueue.scheduledFor} <= NOW())`
    ))
    .limit(limit);

  let sentCount = 0;

  for (const email of emails) {
    // Update status to sending
    await db.update(emailQueue)
      .set({ status: "sending" })
      .where(eq(emailQueue.id, email.id));

    const result = await sendEmail({
      to: email.toEmail,
      toName: email.toName || undefined,
      subject: email.subject,
      html: email.htmlContent,
      text: email.textContent || undefined,
    });

    if (result.success) {
      await db.update(emailQueue)
        .set({ 
          status: "sent", 
          resendId: result.resendId,
          sentAt: new Date(),
        })
        .where(eq(emailQueue.id, email.id));
      sentCount++;
    } else {
      // Check if we should retry
      if (email.retryCount < email.maxRetries) {
        await db.update(emailQueue)
          .set({ 
            status: "queued",
            retryCount: email.retryCount + 1,
            lastRetryAt: new Date(),
            errorMessage: result.error,
          })
          .where(eq(emailQueue.id, email.id));
      } else {
        await db.update(emailQueue)
          .set({ 
            status: "failed",
            errorMessage: result.error,
          })
          .where(eq(emailQueue.id, email.id));
      }
    }
  }

  return sentCount;
}

/**
 * Render an email template with variables
 */
export function renderTemplate(template: string, variables: Record<string, string>): string {
  let rendered = template;
  for (const [key, value] of Object.entries(variables)) {
    rendered = rendered.replace(new RegExp(`{{${key}}}`, "g"), value);
  }
  return rendered;
}

// ==================== EMAIL TEMPLATES ====================

/**
 * Welcome email template
 */
export function getWelcomeEmailTemplate(userName: string): { subject: string; html: string; text: string } {
  return {
    subject: "Welcome to ProPDFs - Your Professional PDF Converter",
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to ProPDFs</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <tr>
      <td>
        <div style="background-color: white; border-radius: 12px; padding: 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="color: #2563eb; font-size: 28px; margin: 0;">📄 ProPDFs</h1>
          </div>
          
          <h2 style="color: #18181b; font-size: 24px; margin: 0 0 16px;">Welcome, ${userName}!</h2>
          
          <p style="color: #52525b; font-size: 16px; line-height: 1.6; margin: 0 0 24px;">
            Thank you for joining ProPDFs! You now have access to professional PDF conversion tools with enterprise-grade security.
          </p>
          
          <div style="background-color: #f4f4f5; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
            <h3 style="color: #18181b; font-size: 16px; margin: 0 0 16px;">Your Free Plan Includes:</h3>
            <ul style="color: #52525b; font-size: 14px; line-height: 1.8; margin: 0; padding-left: 20px;">
              <li>10 conversions per month</li>
              <li>25MB file size limit</li>
              <li>PDF merge, split, compress</li>
              <li>Image to PDF conversion</li>
              <li>No watermarks on output</li>
            </ul>
          </div>
          
          <div style="text-align: center; margin-bottom: 24px;">
            <a href="https://propdfs.com/convert" style="display: inline-block; background-color: #2563eb; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">Start Converting</a>
          </div>
          
          <p style="color: #71717a; font-size: 14px; line-height: 1.6; margin: 0;">
            Need more conversions? <a href="https://propdfs.com/pricing" style="color: #2563eb;">Upgrade to Pro</a> for unlimited access.
          </p>
        </div>
        
        <div style="text-align: center; padding: 24px;">
          <p style="color: #a1a1aa; font-size: 12px; margin: 0;">
            © ${new Date().getFullYear()} ProPDFs. All rights reserved.<br>
            <a href="https://propdfs.com/unsubscribe" style="color: #a1a1aa;">Unsubscribe</a> | <a href="https://propdfs.com/privacy" style="color: #a1a1aa;">Privacy Policy</a>
          </p>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
    text: `Welcome to ProPDFs, ${userName}!

Thank you for joining ProPDFs! You now have access to professional PDF conversion tools with enterprise-grade security.

Your Free Plan Includes:
- 10 conversions per month
- 25MB file size limit
- PDF merge, split, compress
- Image to PDF conversion
- No watermarks on output

Start converting: https://propdfs.com/convert

Need more conversions? Upgrade to Pro for unlimited access: https://propdfs.com/pricing

© ${new Date().getFullYear()} ProPDFs. All rights reserved.
    `,
  };
}

/**
 * Conversion complete email template
 */
export function getConversionCompleteTemplate(
  userName: string,
  filename: string,
  conversionType: string,
  downloadUrl: string
): { subject: string; html: string; text: string } {
  return {
    subject: `Your PDF conversion is complete - ${filename}`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <tr>
      <td>
        <div style="background-color: white; border-radius: 12px; padding: 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 24px;">
            <div style="width: 64px; height: 64px; background-color: #dcfce7; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;">
              <span style="font-size: 32px;">✓</span>
            </div>
          </div>
          
          <h2 style="color: #18181b; font-size: 24px; margin: 0 0 16px; text-align: center;">Conversion Complete!</h2>
          
          <p style="color: #52525b; font-size: 16px; line-height: 1.6; margin: 0 0 24px; text-align: center;">
            Hi ${userName}, your file has been successfully converted.
          </p>
          
          <div style="background-color: #f4f4f5; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
              <tr>
                <td style="color: #71717a; font-size: 14px; padding-bottom: 8px;">File:</td>
                <td style="color: #18181b; font-size: 14px; padding-bottom: 8px; text-align: right; font-weight: 500;">${filename}</td>
              </tr>
              <tr>
                <td style="color: #71717a; font-size: 14px;">Conversion:</td>
                <td style="color: #18181b; font-size: 14px; text-align: right; font-weight: 500;">${conversionType}</td>
              </tr>
            </table>
          </div>
          
          <div style="text-align: center; margin-bottom: 24px;">
            <a href="${downloadUrl}" style="display: inline-block; background-color: #2563eb; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">Download File</a>
          </div>
          
          <p style="color: #a1a1aa; font-size: 12px; text-align: center; margin: 0;">
            This download link will expire in 7 days.
          </p>
        </div>
        
        <div style="text-align: center; padding: 24px;">
          <p style="color: #a1a1aa; font-size: 12px; margin: 0;">
            © ${new Date().getFullYear()} ProPDFs. All rights reserved.
          </p>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
    text: `Conversion Complete!

Hi ${userName}, your file has been successfully converted.

File: ${filename}
Conversion: ${conversionType}

Download your file: ${downloadUrl}

This download link will expire in 7 days.

© ${new Date().getFullYear()} ProPDFs. All rights reserved.
    `,
  };
}

/**
 * Batch processing complete email template
 */
export function getBatchCompleteTemplate(
  userName: string,
  batchId: string,
  totalFiles: number,
  completedFiles: number,
  failedFiles: number,
  dashboardUrl: string
): { subject: string; html: string; text: string } {
  const successRate = totalFiles > 0 ? Math.round((completedFiles / totalFiles) * 100) : 0;
  const statusColor = failedFiles === 0 ? "#16a34a" : failedFiles < totalFiles ? "#ca8a04" : "#dc2626";
  const statusText = failedFiles === 0 ? "All files converted successfully!" : 
                     failedFiles < totalFiles ? "Batch completed with some failures" : "Batch processing failed";

  return {
    subject: `Batch processing complete - ${completedFiles}/${totalFiles} files converted`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <tr>
      <td>
        <div style="background-color: white; border-radius: 12px; padding: 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #2563eb; font-size: 24px; margin: 0;">📄 ProPDFs</h1>
          </div>
          
          <h2 style="color: #18181b; font-size: 24px; margin: 0 0 8px; text-align: center;">Batch Processing Complete</h2>
          <p style="color: ${statusColor}; font-size: 16px; margin: 0 0 24px; text-align: center; font-weight: 500;">${statusText}</p>
          
          <div style="background-color: #f4f4f5; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
            <div style="text-align: center; margin-bottom: 16px;">
              <span style="font-size: 48px; font-weight: bold; color: #2563eb;">${successRate}%</span>
              <p style="color: #71717a; font-size: 14px; margin: 4px 0 0;">Success Rate</p>
            </div>
            
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
              <tr>
                <td style="color: #71717a; font-size: 14px; padding: 8px 0;">Total Files:</td>
                <td style="color: #18181b; font-size: 14px; padding: 8px 0; text-align: right; font-weight: 600;">${totalFiles}</td>
              </tr>
              <tr>
                <td style="color: #71717a; font-size: 14px; padding: 8px 0;">Completed:</td>
                <td style="color: #16a34a; font-size: 14px; padding: 8px 0; text-align: right; font-weight: 600;">${completedFiles}</td>
              </tr>
              ${failedFiles > 0 ? `
              <tr>
                <td style="color: #71717a; font-size: 14px; padding: 8px 0;">Failed:</td>
                <td style="color: #dc2626; font-size: 14px; padding: 8px 0; text-align: right; font-weight: 600;">${failedFiles}</td>
              </tr>
              ` : ""}
            </table>
          </div>
          
          <div style="text-align: center; margin-bottom: 24px;">
            <a href="${dashboardUrl}" style="display: inline-block; background-color: #2563eb; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">View Results</a>
          </div>
          
          <p style="color: #71717a; font-size: 14px; text-align: center; margin: 0;">
            Batch ID: ${batchId}
          </p>
        </div>
        
        <div style="text-align: center; padding: 24px;">
          <p style="color: #a1a1aa; font-size: 12px; margin: 0;">
            © ${new Date().getFullYear()} ProPDFs. All rights reserved.
          </p>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
    text: `Batch Processing Complete

Hi ${userName},

${statusText}

Results:
- Total Files: ${totalFiles}
- Completed: ${completedFiles}
- Failed: ${failedFiles}
- Success Rate: ${successRate}%

View your results: ${dashboardUrl}

Batch ID: ${batchId}

© ${new Date().getFullYear()} ProPDFs. All rights reserved.
    `,
  };
}

/**
 * Team invitation email template
 */
export function getTeamInvitationTemplate(
  inviterName: string,
  teamName: string,
  inviteUrl: string,
  role: string
): { subject: string; html: string; text: string } {
  return {
    subject: `${inviterName} invited you to join ${teamName} on ProPDFs`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <tr>
      <td>
        <div style="background-color: white; border-radius: 12px; padding: 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #2563eb; font-size: 24px; margin: 0;">📄 ProPDFs</h1>
          </div>
          
          <h2 style="color: #18181b; font-size: 24px; margin: 0 0 16px; text-align: center;">You're Invited!</h2>
          
          <p style="color: #52525b; font-size: 16px; line-height: 1.6; margin: 0 0 24px; text-align: center;">
            <strong>${inviterName}</strong> has invited you to join <strong>${teamName}</strong> as a <strong>${role}</strong>.
          </p>
          
          <div style="background-color: #eff6ff; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
            <p style="color: #1e40af; font-size: 14px; line-height: 1.6; margin: 0;">
              As a team member, you'll be able to collaborate on documents, share files, and work together on PDF conversions.
            </p>
          </div>
          
          <div style="text-align: center; margin-bottom: 24px;">
            <a href="${inviteUrl}" style="display: inline-block; background-color: #2563eb; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">Accept Invitation</a>
          </div>
          
          <p style="color: #a1a1aa; font-size: 12px; text-align: center; margin: 0;">
            This invitation will expire in 7 days.
          </p>
        </div>
        
        <div style="text-align: center; padding: 24px;">
          <p style="color: #a1a1aa; font-size: 12px; margin: 0;">
            © ${new Date().getFullYear()} ProPDFs. All rights reserved.
          </p>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
    text: `You're Invited to ${teamName}!

${inviterName} has invited you to join ${teamName} as a ${role}.

As a team member, you'll be able to collaborate on documents, share files, and work together on PDF conversions.

Accept your invitation: ${inviteUrl}

This invitation will expire in 7 days.

© ${new Date().getFullYear()} ProPDFs. All rights reserved.
    `,
  };
}

/**
 * Usage limit warning email template
 */
export function getUsageLimitWarningTemplate(
  userName: string,
  currentUsage: number,
  limit: number,
  tier: string
): { subject: string; html: string; text: string } {
  const usagePercent = Math.round((currentUsage / limit) * 100);
  
  return {
    subject: `You've used ${usagePercent}% of your monthly conversions`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <tr>
      <td>
        <div style="background-color: white; border-radius: 12px; padding: 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 24px;">
            <div style="width: 64px; height: 64px; background-color: #fef3c7; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;">
              <span style="font-size: 32px;">⚠️</span>
            </div>
          </div>
          
          <h2 style="color: #18181b; font-size: 24px; margin: 0 0 16px; text-align: center;">Usage Limit Warning</h2>
          
          <p style="color: #52525b; font-size: 16px; line-height: 1.6; margin: 0 0 24px; text-align: center;">
            Hi ${userName}, you've used <strong>${usagePercent}%</strong> of your monthly conversions.
          </p>
          
          <div style="background-color: #f4f4f5; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
            <div style="background-color: #e5e7eb; border-radius: 4px; height: 8px; margin-bottom: 12px;">
              <div style="background-color: ${usagePercent >= 90 ? '#dc2626' : '#ca8a04'}; border-radius: 4px; height: 8px; width: ${usagePercent}%;"></div>
            </div>
            <p style="color: #52525b; font-size: 14px; margin: 0; text-align: center;">
              <strong>${currentUsage}</strong> of <strong>${limit}</strong> conversions used
            </p>
          </div>
          
          ${tier === "free" ? `
          <div style="text-align: center; margin-bottom: 24px;">
            <a href="https://propdfs.com/pricing" style="display: inline-block; background-color: #2563eb; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">Upgrade to Pro</a>
          </div>
          <p style="color: #71717a; font-size: 14px; text-align: center; margin: 0;">
            Get unlimited conversions for just $5.99/month
          </p>
          ` : `
          <p style="color: #71717a; font-size: 14px; text-align: center; margin: 0;">
            Your limit will reset at the start of next month.
          </p>
          `}
        </div>
        
        <div style="text-align: center; padding: 24px;">
          <p style="color: #a1a1aa; font-size: 12px; margin: 0;">
            © ${new Date().getFullYear()} ProPDFs. All rights reserved.
          </p>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
    text: `Usage Limit Warning

Hi ${userName}, you've used ${usagePercent}% of your monthly conversions.

${currentUsage} of ${limit} conversions used

${tier === "free" ? `Upgrade to Pro for unlimited conversions: https://propdfs.com/pricing` : `Your limit will reset at the start of next month.`}

© ${new Date().getFullYear()} ProPDFs. All rights reserved.
    `,
  };
}

/**
 * Subscription upgrade email template
 */
export function getSubscriptionUpgradeTemplate(
  userName: string,
  newTier: string,
  features: string[]
): { subject: string; html: string; text: string } {
  const tierName = newTier === "pro" ? "Pro" : "Enterprise";
  
  return {
    subject: `Welcome to ProPDFs ${tierName}! 🎉`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <tr>
      <td>
        <div style="background-color: white; border-radius: 12px; padding: 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 24px;">
            <div style="width: 64px; height: 64px; background-color: #dcfce7; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;">
              <span style="font-size: 32px;">🎉</span>
            </div>
          </div>
          
          <h2 style="color: #18181b; font-size: 24px; margin: 0 0 16px; text-align: center;">Welcome to ${tierName}!</h2>
          
          <p style="color: #52525b; font-size: 16px; line-height: 1.6; margin: 0 0 24px; text-align: center;">
            Hi ${userName}, thank you for upgrading! You now have access to all ${tierName} features.
          </p>
          
          <div style="background-color: #f4f4f5; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
            <h3 style="color: #18181b; font-size: 16px; margin: 0 0 16px;">Your ${tierName} Benefits:</h3>
            <ul style="color: #52525b; font-size: 14px; line-height: 1.8; margin: 0; padding-left: 20px;">
              ${features.map(f => `<li>${f}</li>`).join("")}
            </ul>
          </div>
          
          <div style="text-align: center;">
            <a href="https://propdfs.com/dashboard" style="display: inline-block; background-color: #2563eb; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">Go to Dashboard</a>
          </div>
        </div>
        
        <div style="text-align: center; padding: 24px;">
          <p style="color: #a1a1aa; font-size: 12px; margin: 0;">
            © ${new Date().getFullYear()} ProPDFs. All rights reserved.
          </p>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
    text: `Welcome to ProPDFs ${tierName}!

Hi ${userName}, thank you for upgrading! You now have access to all ${tierName} features.

Your ${tierName} Benefits:
${features.map(f => `- ${f}`).join("\n")}

Go to your dashboard: https://propdfs.com/dashboard

© ${new Date().getFullYear()} ProPDFs. All rights reserved.
    `,
  };
}

// ==================== EMAIL PREFERENCES ====================

/**
 * Create default email preferences for a user
 */
export async function createEmailPreferences(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const unsubscribeToken = nanoid(32);

  await db.insert(emailPreferences).values({
    userId,
    conversionComplete: true,
    batchComplete: true,
    weeklyDigest: true,
    teamInvitations: true,
    securityAlerts: true,
    productUpdates: false,
    usageLimitWarnings: true,
    unsubscribeToken,
  }).onDuplicateKeyUpdate({
    set: { updatedAt: new Date() },
  });
}

/**
 * Get user's email preferences
 */
export async function getEmailPreferences(userId: number) {
  const db = await getDb();
  if (!db) return null;

  const prefs = await db.select()
    .from(emailPreferences)
    .where(eq(emailPreferences.userId, userId))
    .limit(1);

  return prefs.length > 0 ? prefs[0] : null;
}

/**
 * Update user's email preferences
 */
export async function updateEmailPreferences(
  userId: number,
  updates: Partial<InsertEmailPreferences>
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  await db.update(emailPreferences)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(emailPreferences.userId, userId));

  return true;
}

/**
 * Check if user wants to receive a specific email type
 */
export async function shouldSendEmail(userId: number, emailType: keyof InsertEmailPreferences): Promise<boolean> {
  const prefs = await getEmailPreferences(userId);
  if (!prefs) return true; // Default to sending if no preferences set
  
  return prefs[emailType] === true;
}

// ==================== NOTIFICATION HELPERS ====================

/**
 * Send welcome email to new user
 */
export async function sendWelcomeEmail(userId: number, email: string, name: string): Promise<void> {
  const template = getWelcomeEmailTemplate(name || "there");
  await queueEmail({
    to: email,
    toName: name,
    userId,
    templateName: "welcome",
    subject: template.subject,
    html: template.html,
    text: template.text,
  });
}

/**
 * Send conversion complete notification
 */
export async function sendConversionCompleteEmail(
  userId: number,
  email: string,
  name: string,
  filename: string,
  conversionType: string,
  downloadUrl: string
): Promise<void> {
  if (!await shouldSendEmail(userId, "conversionComplete")) return;
  
  const template = getConversionCompleteTemplate(name || "there", filename, conversionType, downloadUrl);
  await queueEmail({
    to: email,
    toName: name,
    userId,
    templateName: "conversion_complete",
    subject: template.subject,
    html: template.html,
    text: template.text,
  });
}

/**
 * Send batch complete notification
 */
export async function sendBatchCompleteEmail(
  userId: number,
  email: string,
  name: string,
  batchId: string,
  totalFiles: number,
  completedFiles: number,
  failedFiles: number
): Promise<void> {
  if (!await shouldSendEmail(userId, "batchComplete")) return;
  
  const dashboardUrl = `https://propdfs.com/dashboard/batch/${batchId}`;
  const template = getBatchCompleteTemplate(name || "there", batchId, totalFiles, completedFiles, failedFiles, dashboardUrl);
  await queueEmail({
    to: email,
    toName: name,
    userId,
    templateName: "batch_complete",
    subject: template.subject,
    html: template.html,
    text: template.text,
  });
}

/**
 * Send team invitation email
 */
export async function sendTeamInvitationEmail(
  email: string,
  inviterName: string,
  teamName: string,
  inviteToken: string,
  role: string
): Promise<void> {
  const inviteUrl = `https://propdfs.com/teams/invite/${inviteToken}`;
  const template = getTeamInvitationTemplate(inviterName, teamName, inviteUrl, role);
  await queueEmail({
    to: email,
    templateName: "team_invitation",
    subject: template.subject,
    html: template.html,
    text: template.text,
  });
}

/**
 * Send usage limit warning email
 */
export async function sendUsageLimitWarningEmail(
  userId: number,
  email: string,
  name: string,
  currentUsage: number,
  limit: number,
  tier: string
): Promise<void> {
  if (!await shouldSendEmail(userId, "usageLimitWarnings")) return;
  
  const template = getUsageLimitWarningTemplate(name || "there", currentUsage, limit, tier);
  await queueEmail({
    to: email,
    toName: name,
    userId,
    templateName: "usage_warning",
    subject: template.subject,
    html: template.html,
    text: template.text,
  });
}


// ==================== AUTHENTICATION EMAIL TEMPLATES ====================

/**
 * Email verification template
 */
export function getEmailVerificationTemplate(
  verificationUrl: string
): { subject: string; html: string; text: string } {
  return {
    subject: "Verify your email address - ProPDFs",
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <tr>
      <td>
        <div style="background-color: white; border-radius: 12px; padding: 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #2563eb; font-size: 24px; margin: 0;">📄 ProPDFs</h1>
          </div>
          
          <h2 style="color: #18181b; font-size: 24px; margin: 0 0 16px; text-align: center;">Verify your email address</h2>
          
          <p style="color: #52525b; font-size: 16px; line-height: 1.6; margin: 0 0 24px; text-align: center;">
            Thanks for signing up for ProPDFs! Please verify your email address by clicking the button below.
          </p>
          
          <div style="text-align: center; margin-bottom: 24px;">
            <a href="${verificationUrl}" style="display: inline-block; background-color: #2563eb; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">Verify Email Address</a>
          </div>
          
          <p style="color: #71717a; font-size: 14px; text-align: center; margin: 0 0 16px;">
            Or copy and paste this link into your browser:
          </p>
          <p style="color: #2563eb; font-size: 12px; word-break: break-all; text-align: center; margin: 0 0 24px;">
            ${verificationUrl}
          </p>
          
          <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; margin-bottom: 16px;">
            <p style="color: #92400e; font-size: 14px; margin: 0;">
              This link will expire in 24 hours. If you didn't create an account with ProPDFs, you can safely ignore this email.
            </p>
          </div>
        </div>
        
        <div style="text-align: center; padding: 24px;">
          <p style="color: #a1a1aa; font-size: 12px; margin: 0;">
            © ${new Date().getFullYear()} ProPDFs. All rights reserved.
          </p>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
    text: `Verify your email address

Thanks for signing up for ProPDFs! Please verify your email address by visiting:

${verificationUrl}

This link will expire in 24 hours. If you didn't create an account with ProPDFs, you can safely ignore this email.

© ${new Date().getFullYear()} ProPDFs. All rights reserved.
    `,
  };
}

/**
 * Magic link login template
 */
export function getMagicLinkTemplate(
  magicLinkUrl: string
): { subject: string; html: string; text: string } {
  return {
    subject: "Sign in to ProPDFs",
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <tr>
      <td>
        <div style="background-color: white; border-radius: 12px; padding: 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #2563eb; font-size: 24px; margin: 0;">📄 ProPDFs</h1>
          </div>
          
          <h2 style="color: #18181b; font-size: 24px; margin: 0 0 16px; text-align: center;">Sign in to ProPDFs</h2>
          
          <p style="color: #52525b; font-size: 16px; line-height: 1.6; margin: 0 0 24px; text-align: center;">
            Click the button below to sign in to your account. No password needed!
          </p>
          
          <div style="text-align: center; margin-bottom: 24px;">
            <a href="${magicLinkUrl}" style="display: inline-block; background-color: #2563eb; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">Sign In to ProPDFs</a>
          </div>
          
          <p style="color: #71717a; font-size: 14px; text-align: center; margin: 0 0 16px;">
            Or copy and paste this link into your browser:
          </p>
          <p style="color: #2563eb; font-size: 12px; word-break: break-all; text-align: center; margin: 0 0 24px;">
            ${magicLinkUrl}
          </p>
          
          <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; margin-bottom: 16px;">
            <p style="color: #92400e; font-size: 14px; margin: 0;">
              This link will expire in 15 minutes and can only be used once. If you didn't request this email, you can safely ignore it.
            </p>
          </div>
        </div>
        
        <div style="text-align: center; padding: 24px;">
          <p style="color: #a1a1aa; font-size: 12px; margin: 0;">
            © ${new Date().getFullYear()} ProPDFs. All rights reserved.
          </p>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
    text: `Sign in to ProPDFs

Click the link below to sign in to your account. No password needed!

${magicLinkUrl}

This link will expire in 15 minutes and can only be used once. If you didn't request this email, you can safely ignore it.

© ${new Date().getFullYear()} ProPDFs. All rights reserved.
    `,
  };
}

/**
 * Password reset template
 */
export function getPasswordResetTemplate(
  resetUrl: string
): { subject: string; html: string; text: string } {
  return {
    subject: "Reset your password - ProPDFs",
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <tr>
      <td>
        <div style="background-color: white; border-radius: 12px; padding: 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #2563eb; font-size: 24px; margin: 0;">📄 ProPDFs</h1>
          </div>
          
          <h2 style="color: #18181b; font-size: 24px; margin: 0 0 16px; text-align: center;">Reset your password</h2>
          
          <p style="color: #52525b; font-size: 16px; line-height: 1.6; margin: 0 0 24px; text-align: center;">
            We received a request to reset your password. Click the button below to create a new password.
          </p>
          
          <div style="text-align: center; margin-bottom: 24px;">
            <a href="${resetUrl}" style="display: inline-block; background-color: #2563eb; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">Reset Password</a>
          </div>
          
          <p style="color: #71717a; font-size: 14px; text-align: center; margin: 0 0 16px;">
            Or copy and paste this link into your browser:
          </p>
          <p style="color: #2563eb; font-size: 12px; word-break: break-all; text-align: center; margin: 0 0 24px;">
            ${resetUrl}
          </p>
          
          <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; margin-bottom: 16px;">
            <p style="color: #92400e; font-size: 14px; margin: 0;">
              This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
            </p>
          </div>
        </div>
        
        <div style="text-align: center; padding: 24px;">
          <p style="color: #a1a1aa; font-size: 12px; margin: 0;">
            © ${new Date().getFullYear()} ProPDFs. All rights reserved.
          </p>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
    text: `Reset your password

We received a request to reset your password. Visit the link below to create a new password:

${resetUrl}

This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.

© ${new Date().getFullYear()} ProPDFs. All rights reserved.
    `,
  };
}

/**
 * File share invitation template
 */
export function getFileShareTemplate(
  senderName: string,
  fileName: string,
  shareUrl: string,
  message?: string
): { subject: string; html: string; text: string } {
  return {
    subject: `${senderName} shared "${fileName}" with you - ProPDFs`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <tr>
      <td>
        <div style="background-color: white; border-radius: 12px; padding: 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #2563eb; font-size: 24px; margin: 0;">📄 ProPDFs</h1>
          </div>
          
          <h2 style="color: #18181b; font-size: 24px; margin: 0 0 16px; text-align: center;">${senderName} shared a file with you</h2>
          
          <p style="color: #52525b; font-size: 16px; line-height: 1.6; margin: 0 0 24px; text-align: center;">
            <strong>${senderName}</strong> has shared "<strong>${fileName}</strong>" with you on ProPDFs.
          </p>
          
          ${message ? `
          <div style="background-color: #f9fafb; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
            <p style="color: #52525b; font-size: 14px; font-style: italic; margin: 0;">"${message}"</p>
          </div>
          ` : ""}
          
          <div style="text-align: center; margin-bottom: 24px;">
            <a href="${shareUrl}" style="display: inline-block; background-color: #2563eb; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">View File</a>
          </div>
          
          <p style="color: #71717a; font-size: 14px; text-align: center; margin: 0 0 16px;">
            Or copy and paste this link into your browser:
          </p>
          <p style="color: #2563eb; font-size: 12px; word-break: break-all; text-align: center; margin: 0;">
            ${shareUrl}
          </p>
        </div>
        
        <div style="text-align: center; padding: 24px;">
          <p style="color: #a1a1aa; font-size: 12px; margin: 0;">
            © ${new Date().getFullYear()} ProPDFs. All rights reserved.
          </p>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
    text: `${senderName} shared a file with you

${senderName} has shared "${fileName}" with you on ProPDFs.

${message ? `Message: "${message}"` : ""}

View the file: ${shareUrl}

© ${new Date().getFullYear()} ProPDFs. All rights reserved.
    `,
  };
}

// ==================== AUTHENTICATION EMAIL HELPERS ====================

/**
 * Send email verification email
 */
export async function sendVerificationEmail(
  email: string,
  verificationToken: string,
  baseUrl: string
): Promise<{ success: boolean; error?: string }> {
  const verificationUrl = `${baseUrl}/verify-email?token=${verificationToken}`;
  const template = getEmailVerificationTemplate(verificationUrl);
  
  return sendEmail({
    to: email,
    subject: template.subject,
    html: template.html,
    text: template.text,
  });
}

/**
 * Send magic link login email
 */
export async function sendMagicLinkEmail(
  email: string,
  magicLinkToken: string,
  baseUrl: string
): Promise<{ success: boolean; error?: string }> {
  const magicLinkUrl = `${baseUrl}/auth/magic-link?token=${magicLinkToken}`;
  const template = getMagicLinkTemplate(magicLinkUrl);
  
  return sendEmail({
    to: email,
    subject: template.subject,
    html: template.html,
    text: template.text,
  });
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(
  email: string,
  resetToken: string,
  baseUrl: string
): Promise<{ success: boolean; error?: string }> {
  const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;
  const template = getPasswordResetTemplate(resetUrl);
  
  return sendEmail({
    to: email,
    subject: template.subject,
    html: template.html,
    text: template.text,
  });
}

/**
 * Send file share invitation email
 */
export async function sendFileShareEmail(
  email: string,
  senderName: string,
  fileName: string,
  shareToken: string,
  baseUrl: string,
  message?: string
): Promise<{ success: boolean; error?: string }> {
  const shareUrl = `${baseUrl}/share/${shareToken}`;
  const template = getFileShareTemplate(senderName, fileName, shareUrl, message);
  
  return sendEmail({
    to: email,
    subject: template.subject,
    html: template.html,
    text: template.text,
  });
}

/**
 * Validate Resend API key
 */
export async function validateResendApiKey(): Promise<{ valid: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  
  if (!apiKey) {
    return { valid: false, error: "RESEND_API_KEY not configured" };
  }
  
  try {
    const response = await fetch("https://api.resend.com/domains", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
      },
    });
    
    if (response.ok) {
      return { valid: true };
    }
    
    if (response.status === 401) {
      return { valid: false, error: "Invalid API key" };
    }
    
    return { valid: false, error: `API returned status ${response.status}` };
  } catch (error) {
    return { valid: false, error: "Failed to connect to Resend API" };
  }
}
