---
name: lgtm-observability
description: Query and operate the Grafana LGTM stack — Prometheus/Mimir metrics, Loki logs, Tempo traces, and Alloy collectors. PromQL and LogQL patterns, correlating the three signals, and instrumenting a service so it is diagnosable. Use when investigating an incident, writing a dashboard or alert rule, configuring Alloy, or when a service has no useful telemetry.
source:
  upstream: hand-authored in preflight
  imported: 2026-09-20
risk_level: medium
writes_files: true
---

# LGTM: Loki, Grafana, Tempo, Mimir

With the Grafana MCP servers connected (one per environment), the agent queries
these directly instead of you pasting screenshots.

## The investigation order

```
alert / symptom
  → metrics (Prometheus/Mimir)  WHAT is wrong, and since when
  → logs    (Loki)              WHY — the error at that timestamp
  → traces  (Tempo)             WHERE in the request path
  → fix → verify on the same dashboard
```

**Metrics before logs, always.** A log query without a time window and a service
is a fishing expedition that returns a million lines and burns the context.

## PromQL

Always a `rate()` over a counter, never the raw counter:

```promql
# error rate by route
sum(rate(http_requests_total{job="api",status=~"5.."}[5m])) by (route)

# p95 latency — the bucket must exist, or this silently returns nothing
histogram_quantile(0.95,
  sum(rate(http_request_duration_seconds_bucket[5m])) by (le, route))

# saturation: is the pod being throttled?
sum(rate(container_cpu_cfs_throttled_seconds_total{namespace="prod"}[5m])) by (pod)

# is it a deploy? correlate with the restart
changes(kube_pod_container_status_restarts_total{namespace="prod"}[1h]) > 0
```

Rate window rule: **at least 4× the scrape interval.** `[1m]` on a 30s scrape
gives two points and a jagged, untrustworthy line.

## LogQL

Filter by **label** before matching text — labels are indexed, text is not:

```logql
{namespace="prod", app="api"} |= "error" | json | status >= 500

# aggregate first, drill in second — never dump raw lines into the context
sum by (error_type) (count_over_time({app="api"} | json | __error__="" [5m]))

# extract a numeric field and chart it
{app="api"} | json | unwrap duration_ms | quantile_over_time(0.95, [5m]) by (route)
```

`{app="api"} |= "error"` over 7 days will time out. Narrow the window first.

**Never make a high-cardinality field a label** — user id, request id, trace id.
That is what kills a Loki install. Keep them in the log line and extract with
`| json`.

## Tempo

Traces answer "where did the time go". The link that makes it usable is
`traceID` in the log line — Grafana turns it into a jump from log to trace.

Find slow traces by service and duration, then read the span breakdown. A span
tree with one 900ms gap and no child is almost always a network call that is not
instrumented.

## Alloy

Grafana Alloy is the collector — replaces Promtail, the Grafana Agent, and
standalone OTel collectors. Config is in its own HCL-like language:

```alloy
discovery.kubernetes "pods" { role = "pod" }

loki.source.kubernetes "pods" {
  targets    = discovery.kubernetes.pods.targets
  forward_to = [loki.process.labels.receiver]
}

loki.process "labels" {
  stage.json { expressions = { level = "", traceID = "" } }
  stage.labels { values = { level = "" } }      // low cardinality only
  forward_to = [loki.write.default.receiver]
}

loki.write "default" {
  endpoint { url = "https://loki.example.com/loki/api/v1/push" }
}

otelcol.receiver.otlp "default" {
  grpc {}
  output { traces = [otelcol.exporter.otlp.tempo.input] }
}
```

Rules that matter:

- **`stage.labels` only for low-cardinality values** — level, namespace, app.
  Everything else stays in the line.
- One Alloy per node as a DaemonSet for logs; a Deployment for OTLP ingest.
- Validate with `alloy fmt` and `alloy run --stability.level=experimental` before
  rolling out. A bad config silently drops telemetry — you find out during the
  next incident.

## Instrumenting a service

If a dashboard cannot show **latency, traffic, errors, saturation** for a
service, that is the gap — and it is cheaper to fix now than during an incident.

- RED for request-driven services (Rate, Errors, Duration)
- USE for resources (Utilisation, Saturation, Errors)
- Emit `traceID` on every log line
- Histogram buckets chosen around your SLO, not the library defaults

## Alerting

**Alert on symptoms users feel** — error rate, latency, queue age. Not on
causes — CPU, memory. A cause-based alert fires when nothing is wrong and stays
quiet when something is.

Every alert needs: a runbook link, a clear owner, and a reason it is worth
waking someone. If it does not, it is a dashboard panel, not an alert.

## During an incident

1. **Preserve evidence before remediating**, when safe
2. Stabilise — rollback beats a forward fix under pressure
3. One change at a time, with a stated health gate
4. Write the timeline as you go

See the `plan-before-operational-change` instinct.
