export type Order = {
  id: string
  store_name: string | null
  order_num: string | null
  customer: string | null
  tracking_num: string | null
  courier: string | null
  status: string | null
  days_in_transit: number | null
  latest_update: string | null
  issue_flag: string | null
  issue_category: string | null
  has_issue: boolean | null
  date_added: string | null
  last_checked: string | null
  my_status: string | null
  notes: string | null
  updated_at: string | null
  updated_by: string | null
  issue_emailed_at: string | null
}

export type Profile = {
  id: string
  email: string | null
  role: string | null
  created_at: string | null
}

export type LogEntry = {
  id: string
  text: string | null
  author: string | null
  ts: string | null
}

export type TrackEvent = {
  time?: string
  message?: string
  location?: string
  _tr?: string
}

export type TrackResult =
  | {
      ok: true
      carrier: string | null
      status: string | null
      sub_status: string | null
      latest_event: string | null
      latest_event_time: string | null
      location: string | null
      days_of_transit: number | null
      estimated_delivery: unknown
      events: TrackEvent[]
    }
  | { ok: false; error: string }
