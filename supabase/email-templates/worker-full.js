/**
 * ZIPPO CLUB — Background Scheduler Worker
 *
 * Cron triggers (UTC — Philippines is UTC+8):
 *   0 4 * * *   → Every day at 12:00 PM PHT  → runDailyScan()
 *   0 5 * * 5   → Every Friday at 1:00 PM PHT → sendWeeklyEmail()
 *
 * Required Worker Secrets (set via Cloudflare Dashboard → Settings → Variables):
 *   SUPABASE_URL         e.g. https://xxxxxxxxxxx.supabase.co
 *   SUPABASE_SERVICE_KEY  Service-role key (bypasses RLS) — NOT the anon key
 *   AFTERSHIP_KEY        AfterShip API key
 *   RESEND_API_KEY       Resend API key (resend.com)
 *   FROM_EMAIL           Verified sender e.g. orders@yourdomain.com
 */

// ── Constants (mirrored from index.html) ────────────────────────────────────────

const AS_BASE = 'https://api.aftership.com/tracking/2026-01'

const SKIP_STATUSES = [
  'delivered', 'canceled', 'cancelled', 'refunded', 'returnedtosender', 'onhold'
]
const MANUAL_STATUS_LOCK = [
  'canceled', 'cancelled', 'refunded', 'returned to sender', 'on hold'
]
const AUTO_FLAG = 'AUTO / AT RISK'
const STUCK_DAYS_THRESHOLD = 15
const CONCERNING_STATUSES = [
  'exception', 'deliveryfailure', 'notfound', 'updateerror', 'deliveryfailure'
]

// ── Utilities ───────────────────────────────────────────────────────────────────

function normStatus(s) {
  return String(s || '').trim().toLowerCase().replace(/[\s_-]+/g, '')
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

function isAutoFlag(flag) {
  return String(flag || '').trim().startsWith('AUTO /')
}

// ── Supabase REST helpers ───────────────────────────────────────────────────────

async function sbGet(env, path) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1${path}`, {
    headers: {
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    }
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`sbGet ${path} → ${res.status}: ${t}`)
  }
  return res.json()
}

async function sbPatch(env, path, body) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1${path}`, {
    method: 'PATCH',
    headers: {
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`sbPatch ${path} → ${res.status}: ${t}`)
  }
}

async function sbUpsert(env, table, body) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(body)
  })
  // swallow errors on upsert (table may not exist yet)
  return res.ok
}

// ── AfterShip helpers ───────────────────────────────────────────────────────────

async function asRequest(path, opts, key) {
  const res = await fetch(`${AS_BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'as-api-key': key,
      ...(opts.headers || {}),
    },
  })
  const json = await res.json().catch(() => null)
  return { ok: res.ok, status: res.status, json }
}

function buildSummary(number, t) {
  if (!t) return null
  const checkpoints = Array.isArray(t.checkpoints) ? t.checkpoints : []
  const latest = checkpoints[checkpoints.length - 1] || null
  return {
    carrier: t.courier_name || t.slug || null,
    status: t.tag || null,
    sub_status: t.subtag || null,
    latest_event: latest?.message || latest?.subtag_message || t.subtag_message || null,
    latest_event_time: latest?.checkpoint_time || latest?.created_at || null,
    location: latest?.location || latest?.city || null,
    days_of_transit: t.transit_time ?? null,
  }
}

async function lookupTracking(trackingNum, key) {
  // Step 1: Register tracking with AfterShip (idempotent)
  await asRequest('/trackings', {
    method: 'POST',
    body: JSON.stringify({ tracking: { tracking_number: trackingNum } }),
  }, key)

  // Step 2: GET current tracking state
  const lookup = await asRequest(
    `/trackings?tracking_numbers=${encodeURIComponent(trackingNum)}`,
    { method: 'GET' },
    key
  )
  let tracking = lookup.json?.data?.trackings?.[0] || null

  // Step 3: Fallback — fetch by slug/number if no checkpoints yet
  if (tracking && (!tracking.checkpoints || tracking.checkpoints.length === 0) && tracking.slug) {
    const fresh = await asRequest(
      `/trackings/${tracking.slug}/${encodeURIComponent(trackingNum)}`,
      { method: 'GET' },
      key
    )
    if (fresh.json?.data?.tracking) tracking = fresh.json.data.tracking
  }

  return buildSummary(trackingNum, tracking)
}

// ── Write live result back to order (mirrors index.html logic) ─────────────────

async function writeLiveResultBack(env, order, r) {
  const liveStatus = r.status || r.sub_status
  const liveIsNotFound = normStatus(liveStatus) === 'notfound'
  const storedLooksReal =
    (normStatus(order.status) && normStatus(order.status) !== 'notfound') ||
    (Number(order.days_in_transit) > 0)

  // Never downgrade a real status to "not found"
  if (liveIsNotFound && storedLooksReal) return

  const patch = {}
  if (r.carrier) patch.courier = r.carrier

  const statusLocked = MANUAL_STATUS_LOCK.includes(
    String(order.status || '').trim().toLowerCase()
  )
  if (liveStatus && !statusLocked) patch.status = liveStatus

  if (r.days_of_transit !== null && r.days_of_transit !== undefined) {
    patch.days_in_transit = r.days_of_transit
  }
  if (r.latest_event) {
    patch.latest_update =
      `${r.latest_event_time ? r.latest_event_time + ' | ' : ''}` +
      `${r.latest_event}` +
      `${r.location ? ' | ' + r.location : ''}`
  }

  if (!Object.keys(patch).length) return

  const changed = Object.keys(patch).some(
    k => String(order[k] ?? '') !== String(patch[k] ?? '')
  )
  if (!changed) return

  patch.updated_at = new Date().toISOString()
  await sbPatch(env, `/orders?id=eq.${order.id}`, patch)
}

// ── Auto-flag at-risk orders (mirrors index.html logic) ────────────────────────

function getAutoFlagSuggestion(order) {
  const days = Number(order.days_in_transit)
  if (CONCERNING_STATUSES.some(s => normStatus(order.status) === s)) {
    return {
      flag: AUTO_FLAG,
      category: `AUTO / ${(order.status || 'EXCEPTION').toUpperCase()}`
    }
  }
  if (days >= STUCK_DAYS_THRESHOLD && normStatus(order.status) !== 'delivered') {
    return {
      flag: AUTO_FLAG,
      category: `AUTO / STUCK ${STUCK_DAYS_THRESHOLD}+ DAYS IN TRANSIT`
    }
  }
  return null
}

async function autoFlagOrder(env, order) {
  const suggestion = getAutoFlagSuggestion(order)
  const hasAutoFlag = isAutoFlag(order.issue_flag) || isAutoFlag(order.issue_category)

  if (suggestion) {
    const alreadyFlagged =
      order.has_issue &&
      order.issue_flag === suggestion.flag &&
      order.issue_category === suggestion.category

    if (!alreadyFlagged) {
      await sbPatch(env, `/orders?id=eq.${order.id}`, {
        issue_flag: suggestion.flag,
        issue_category: suggestion.category,
        has_issue: true,
        issue_emailed_at: null,
        updated_at: new Date().toISOString()
      })
    }
  } else if (order.has_issue && hasAutoFlag) {
    await sbPatch(env, `/orders?id=eq.${order.id}`, {
      issue_flag: '',
      issue_category: '',
      has_issue: false,
      updated_at: new Date().toISOString()
    })
  }
}

// ── Daily scan ──────────────────────────────────────────────────────────────────

async function runDailyScan(env) {
  console.log('[zippo-scheduler] Daily scan starting…')
  const ts = new Date().toISOString()

  const allOrders = await sbGet(
    env,
    '/orders?select=id,tracking_num,store_name,customer,status,courier,' +
    'days_in_transit,latest_update,has_issue,issue_flag,issue_category,date_added,updated_at'
  )

  const targets = allOrders.filter(o =>
    o.tracking_num &&
    o.tracking_num !== '—' &&
    !SKIP_STATUSES.includes(normStatus(o.status))
  )

  console.log(`[zippo-scheduler] Scanning ${targets.length} of ${allOrders.length} orders`)

  let ok = 0, failed = 0

  for (const order of targets) {
    try {
      const r = await lookupTracking(order.tracking_num, env.AFTERSHIP_KEY)
      if (r) {
        await writeLiveResultBack(env, order, r)
        const merged = {
          ...order,
          status: r.status || order.status,
          days_in_transit: r.days_of_transit ?? order.days_in_transit,
        }
        await autoFlagOrder(env, merged)
        ok++
      } else {
        failed++
      }
    } catch (e) {
      console.error(`[zippo-scheduler] ${order.tracking_num}: ${e.message}`)
      failed++
    }
    await sleep(300)
  }

  await sbUpsert(env, 'app_settings', {
    key: 'last_live_scan',
    value: JSON.stringify({ ts: Date.now(), by: 'auto-scheduler (12pm daily)' }),
    updated_at: ts
  })

  console.log(`[zippo-scheduler] Daily scan done — ${ok} OK, ${failed} failed`)
}

// ── Friday email ────────────────────────────────────────────────────────────────

async function sendWeeklyEmail(env) {
  console.log('[zippo-scheduler] Friday email starting…')

  const allFlagged = await sbGet(
    env,
    '/orders?has_issue=eq.true&select=*&order=date_added.asc'
  )
  const issues = (allFlagged || []).filter(o => !o.issue_emailed_at)

  if (!issues || issues.length === 0) {
    console.log('[zippo-scheduler] No new issues to email — nothing sent.')
    return 'No new issues to email — nothing sent.'
  }

  const profiles = await sbGet(env, '/profiles?select=email')
  const emails = (profiles || []).map(p => p.email).filter(Boolean)

  if (!emails.length) {
    console.log('[zippo-scheduler] No team emails found — cannot send.')
    return 'No team emails found in profiles table.'
  }

  const dateStr = new Date().toLocaleDateString('en-PH', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'Asia/Manila'
  })

  const subject = `⚠️ ZIPPO CLUB — ${issues.length} New Order Issue${issues.length > 1 ? 's' : ''} · ${dateStr}`
  const html = buildEmailHtml(issues, dateStr)
  const text = buildEmailText(issues, dateStr)

  const res = await fetch(env.APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: emails, subject, html, text }),
    redirect: 'follow',
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('[zippo-scheduler] Apps Script error:', err)
    throw new Error(`Apps Script error ${res.status}: ${err}`)
  }

  const json = await res.json().catch(() => null)
  if (json && !json.ok) {
    throw new Error(`Apps Script returned error: ${json.error}`)
  }

  const now = new Date().toISOString()
  for (const issue of issues) {
    await sbPatch(env, `/orders?id=eq.${issue.id}`, { issue_emailed_at: now })
  }

  const summary = `Email sent to ${emails.length} recipient(s) — ${issues.length} issue(s) included.`
  console.log(`[zippo-scheduler] Friday email: ${summary}`)
  return summary
}

// ── Email HTML template (mobile-responsive) ─────────────────────────────────────

const APP_URL = 'https://zippo-order-tracker-nextjs-zeta.vercel.app'

function buildEmailHtml(issues, dateStr) {
  const rows = issues.map(i => {
    const issueLabel = i.issue_category || i.issue_flag || '—'
    const isAuto = issueLabel.startsWith('AUTO /')
    const trackingNum = i.tracking_num || ''
    const t17Url = `https://t.17track.net/en#nums=${encodeURIComponent(trackingNum)}`
    const asUrl = `https://track.aftership.com/${encodeURIComponent(trackingNum)}`
    const viewUrl = `${APP_URL}/?tab=issues&q=${encodeURIComponent(i.order_num || trackingNum || '')}`
    const pillStyle = 'display:inline-block;padding:4px 9px;border-radius:6px;background:#eef2ff;color:#4f46e5;font-size:10.5px;font-weight:600;text-decoration:none;white-space:nowrap;margin-right:4px;'
    const viewPillStyle = 'display:inline-block;padding:4px 9px;border-radius:6px;background:#0f172a;color:#fff;font-size:10.5px;font-weight:600;text-decoration:none;white-space:nowrap;margin-right:4px;'
    const trackLinks = `<a href="${viewUrl}" style="${viewPillStyle}">View →</a>` +
      (trackingNum
        ? `<a href="${t17Url}" style="${pillStyle}">17TRACK ↗</a><a href="${asUrl}" style="${pillStyle}margin-right:0;">AfterShip ↗</a>`
        : '')
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
        <td style="padding:9px 10px;border-bottom:1px solid #e5e7eb;white-space:nowrap;">${trackLinks}</td>
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
        <p style="margin:0 0 12px;color:#92400e;font-size:13px;font-weight:600;">
          ${issues.length} order issue${issues.length > 1 ? 's' : ''} need${issues.length === 1 ? 's' : ''} your attention this week.
          Only <strong>new</strong> issues (not previously notified) are included below.
        </p>
        <a href="${APP_URL}/?tab=issues" style="display:inline-block;background:#0f172a;color:#fff;font-size:12.5px;font-weight:600;text-decoration:none;padding:9px 18px;border-radius:8px;">Open Issues Dashboard →</a>
      </div>

      <!-- Table — horizontally scrollable on mobile -->
      <div class="tbl-wrap" style="padding:20px 16px;">
        <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;width:100%;">
          <table style="min-width:820px;width:100%;border-collapse:collapse;font-size:12.5px;color:#374151;">
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
                <th style="padding:9px 10px;text-align:left;font-weight:600;white-space:nowrap;">Track</th>
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

// ── Email plain-text fallback ───────────────────────────────────────────────────

function buildEmailText(issues, dateStr) {
  const lines = issues.map((i, n) => {
    const issue = i.issue_category || i.issue_flag || '—'
    return `${n + 1}. [${i.store_name || '—'}] Order ${i.order_num || '—'} · ${i.customer || '—'}\n` +
      `   Tracking: ${i.tracking_num || '—'} (${i.courier || '—'})\n` +
      `   Issue: ${issue} | Status: ${i.status || '—'} | Days in transit: ${i.days_in_transit ?? '—'}\n` +
      `   Latest: ${(i.latest_update || '—').slice(0, 120)}`
  }).join('\n\n')

  return `ZIPPO CLUB ORDER TRACKER — Weekly Issues Digest
${dateStr}
${'─'.repeat(60)}

${issues.length} new issue${issues.length > 1 ? 's' : ''} need${issues.length === 1 ? 's' : ''} attention:

${lines}

${'─'.repeat(60)}
Sent automatically every Friday at 1:00 PM PH time.
Only new issues (not previously notified) are included.`
}

// ── HTML escaping ───────────────────────────────────────────────────────────────

function esc(s) {
  return String(s || '—')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ── Worker entry point ──────────────────────────────────────────────────────────

export default {

  async scheduled(event, env, ctx) {
    console.log(`[zippo-scheduler] Cron fired: ${event.cron}`)

    if (event.cron === '0 4 * * *') {
      ctx.waitUntil(runDailyScan(env))
    } else if (event.cron === '0 5 * * 5') {
      ctx.waitUntil(sendWeeklyEmail(env))
    }
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url)

    if (url.pathname === '/__run-scan') {
      try {
        await runDailyScan(env)
        return new Response(
          JSON.stringify({ ok: true, message: 'Daily scan complete.' }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      } catch (e) {
        return new Response(
          JSON.stringify({ ok: false, error: e.message }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
      }
    }

    if (url.pathname === '/__run-email') {
      try {
        const result = await sendWeeklyEmail(env)
        return new Response(
          JSON.stringify({ ok: true, message: result || 'Email job complete.' }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      } catch (e) {
        return new Response(
          JSON.stringify({ ok: false, error: e.message }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
      }
    }

    if (url.pathname === '/__debug') {
      const results = {}
      try {
        const rawRes = await fetch(`${env.SUPABASE_URL}/rest/v1/orders?select=id&limit=1`, {
          headers: {
            'apikey': env.SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          }
        })
        const body = await rawRes.text()
        results.t0_raw_connection = {
          status: rawRes.status,
          body: body.slice(0, 300),
          url_prefix: (env.SUPABASE_URL || '').slice(0, 40),
          key_prefix: (env.SUPABASE_SERVICE_KEY || '').slice(0, 20) + '...',
        }
      } catch (e) { results.t0_raw_connection = { fetch_error: e.message } }
      try {
        const r = await sbGet(env, '/orders?select=id,store_name&limit=3')
        results.t1_basic_select = { ok: true, rows: r.length }
      } catch (e) { results.t1_basic_select = { ok: false, error: e.message } }
      try {
        const r = await sbGet(env, '/orders?has_issue=eq.true&select=id&limit=3')
        results.t2_has_issue_filter = { ok: true, rows: r.length }
      } catch (e) { results.t2_has_issue_filter = { ok: false, error: e.message } }
      try {
        const r = await sbGet(env, '/orders?select=*&limit=1')
        results.t3_select_star = { ok: true, columns: Object.keys(r[0] || {}) }
      } catch (e) { results.t3_select_star = { ok: false, error: e.message } }
      try {
        const r = await sbGet(env, '/orders?select=id,issue_emailed_at&limit=3')
        results.t4_select_emailed_at = { ok: true, rows: r.length, sample: r[0] }
      } catch (e) { results.t4_select_emailed_at = { ok: false, error: e.message } }
      try {
        const r = await sbGet(env, '/orders?select=id&order=date_added.asc&limit=3')
        results.t5_order_param = { ok: true, rows: r.length }
      } catch (e) { results.t5_order_param = { ok: false, error: e.message } }
      try {
        const r = await sbGet(env, '/profiles?select=email')
        results.t6_profiles = { ok: true, rows: r.length }
      } catch (e) { results.t6_profiles = { ok: false, error: e.message } }
      return new Response(JSON.stringify(results, null, 2), { headers: { 'Content-Type': 'application/json' } })
    }

    return new Response(
      'Zippo Club Scheduler — running.\n' +
      'POST /__run-scan  to trigger scan now\n' +
      'POST /__run-email to trigger email now\n' +
      'GET  /__debug     to test Supabase queries',
      { status: 200 }
    )
  }
}
