// Drop-in replacement for buildEmailHtml() in the Cloudflare Worker
// Changes: mobile-responsive outer container + horizontally scrollable table

function buildEmailHtml(issues, dateStr) {
  const rows = issues.map(i => {
    const issueLabel = i.issue_category || i.issue_flag || '—'
    const isAuto = issueLabel.startsWith('AUTO /')
    return `
      <tr>
        <td style="padding:9px 10px;border-bottom:1px solid #e5e7eb;white-space:nowrap;">${esc(i.store_name)}</td>
        <td style="padding:9px 10px;border-bottom:1px solid #e5e7eb;white-space:nowrap;">${esc(i.order_num)}</td>
        <td style="padding:9px 10px;border-bottom:1px solid #e5e7eb;white-space:nowrap;">${esc(i.customer)}</td>
        <td style="padding:9px 10px;border-bottom:1px solid #e5e7eb;font-family:monospace;font-size:11px;white-space:nowrap;">${esc(i.tracking_num)}</td>
        <td style="padding:9px 10px;border-bottom:1px solid #e5e7eb;white-space:nowrap;">${esc(i.courier)}</td>
        <td style="padding:9px 10px;border-bottom:1px solid #e5e7eb;white-space:nowrap;color:${isAuto ? '#d97706' : '#dc2626'};font-weight:600;">${esc(issueLabel)}</td>
        <td style="padding:9px 10px;border-bottom:1px solid #e5e7eb;white-space:nowrap;">${esc(i.status)}</td>
        <td style="padding:9px 10px;border-bottom:1px solid #e5e7eb;text-align:center;white-space:nowrap;">${i.days_in_transit ?? '—'}</td>
        <td style="padding:9px 10px;border-bottom:1px solid #e5e7eb;font-size:11px;min-width:160px;">${esc((i.latest_update || '').slice(0, 100))}</td>
      </tr>`
  }).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Zippo Club Weekly Issues</title>
  <style>
    @media only screen and (max-width:600px) {
      .outer { padding: 12px 8px !important; }
      .card  { border-radius: 8px !important; }
      .hdr   { padding: 20px 16px !important; }
      .hdr h1 { font-size: 16px !important; }
      .banner { padding: 12px 16px !important; }
      .tbl-wrap { padding: 12px 8px !important; }
      .footer { padding: 12px 16px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">

  <div class="outer" style="padding:24px 16px;">
    <div class="card" style="max-width:680px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">

      <!-- Header -->
      <div class="hdr" style="background:#0f172a;padding:24px 28px;">
        <div style="display:flex;align-items:center;gap:12px;">
          <span style="font-size:26px;flex-shrink:0;">⚠️</span>
          <div>
            <h1 style="color:#f8fafc;margin:0;font-size:18px;font-weight:700;letter-spacing:-.3px;">ZIPPO CLUB ORDER TRACKER</h1>
            <p style="color:#94a3b8;margin:4px 0 0;font-size:12px;">Weekly Issues Digest · ${esc(dateStr)}</p>
          </div>
        </div>
      </div>

      <!-- Summary banner -->
      <div class="banner" style="background:#fef3c7;border-bottom:2px solid #f59e0b;padding:12px 28px;">
        <p style="margin:0;color:#92400e;font-size:13px;font-weight:600;">
          ${issues.length} order issue${issues.length > 1 ? 's' : ''} need${issues.length === 1 ? 's' : ''} your attention this week.
          Only <strong>new</strong> issues (not previously notified) are included below.
        </p>
      </div>

      <!-- Table — horizontally scrollable on mobile -->
      <div class="tbl-wrap" style="padding:20px 16px;">
        <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;width:100%;">
          <table style="min-width:680px;width:100%;border-collapse:collapse;font-size:12.5px;color:#374151;">
            <thead>
              <tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0;">
                <th style="padding:9px 10px;text-align:left;font-weight:600;white-space:nowrap;">Store</th>
                <th style="padding:9px 10px;text-align:left;font-weight:600;white-space:nowrap;">Order #</th>
                <th style="padding:9px 10px;text-align:left;font-weight:600;white-space:nowrap;">Customer</th>
                <th style="padding:9px 10px;text-align:left;font-weight:600;white-space:nowrap;">Tracking #</th>
                <th style="padding:9px 10px;text-align:left;font-weight:600;white-space:nowrap;">Courier</th>
                <th style="padding:9px 10px;text-align:left;font-weight:600;white-space:nowrap;">Issue</th>
                <th style="padding:9px 10px;text-align:left;font-weight:600;white-space:nowrap;">Status</th>
                <th style="padding:9px 10px;text-align:center;font-weight:600;white-space:nowrap;">Days</th>
                <th style="padding:9px 10px;text-align:left;font-weight:600;white-space:nowrap;">Latest Update</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>

      <!-- Footer -->
      <div class="footer" style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:14px 28px;">
        <p style="margin:0;color:#9ca3af;font-size:11.5px;line-height:1.6;">
          Sent automatically every Friday at 1:00 PM PH time by the Zippo Club Order Tracker scheduler.
          Issues marked as resolved in the app will not appear in future emails.
        </p>
      </div>

    </div>
  </div>

</body>
</html>`
}
