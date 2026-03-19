function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

export function getWelcomeEmailTemplate(
  name: string,
  baseUrl: string
): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>Welcome to Not Athletes</title>
    <!--[if mso]>
    <style type="text/css">
        body, table, td {font-family: Arial, sans-serif !important;}
    </style>
    <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
    <!-- Wrapper table for email client compatibility -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f5f5f4;">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                <!-- Main content table -->
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <!-- Logo -->
                    <tr>
                        <td style="padding: 40px 40px 20px 40px; text-align: center;">
                            <img src="${baseUrl}/brand-logos/logo.png" 
                                 alt="Not Athletes" 
                                 width="160" 
                                 height="32" 
                                 border="0"
                                 style="display: block; margin: 0 auto; max-width: 160px; height: auto; border: 0; outline: none; text-decoration: none;" />
                        </td>
                    </tr>
                    
                    <!-- Header -->
                    <tr>
                        <td style="padding: 0 40px 20px 40px; text-align: center;">
                            <h1 style="margin: 0; font-size: 28px; font-weight: 300; color: #1e293b; line-height: 1.2;">
                                Welcome, ${escapeHtml(name)}!
                            </h1>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding: 0 40px 30px 40px;">
                            <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #1e293b;">
                                Your 30-day trial has started. Training designed for everyday people, just like you.
                            </p>
                            
                            <p style="margin: 0 0 30px 0; font-size: 16px; line-height: 1.6; color: #1e293b;">
                                Download our app to get started. Your coach will be in touch shortly via the app to create your personalized training plan.
                            </p>
                        </td>
                    </tr>
                    
                    <!-- CTA Button -->
                    <tr>
                        <td style="padding: 0 40px 20px 40px; text-align: center;">
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
                                <tr>
                                    <td style="background-color: #000000; border-radius: 12px;">
                                        <a href="https://apps.apple.com/app/id6758530822" 
                                           style="display: inline-block; padding: 14px 36px; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 12px; line-height: 1.5; vertical-align: middle;">
                                            <span style="display: inline-block; vertical-align: middle; margin-right: 8px;">
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: middle;">
                                                    <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C1.79 15.25 4.96 6.39 9.38 6.39c1.34 0 2.24.76 3.38.76 1.1 0 1.8-.76 3.38-.76 3.83 0 6.94 7.5 1.91 13.89zm-3.86-15.9c.9-1.09.81-2.56-.2-3.5-1.05-1.09-2.75-1.15-3.7-.12-.9 1.09-.81 2.56.2 3.5 1.05 1.09 2.75 1.15 3.7.12z"/>
                                                </svg>
                                            </span>
                                            <span style="display: inline-block; vertical-align: middle;">Download for iOS</span>
                                        </a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <!-- Android note -->
                    <tr>
                        <td style="padding: 0 40px 30px 40px; text-align: center;">
                            <p style="margin: 0; font-size: 14px; color: #64748b; line-height: 1.5;">
                                Android coming soon
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 30px 40px 40px 40px; border-top: 1px solid #e2e8f0;">
                            <p style="margin: 0; font-size: 14px; color: #64748b; line-height: 1.6;">
                                Questions? Your coach will be in touch via the app to answer them.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
  `.trim();
}
