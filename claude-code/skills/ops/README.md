# ops/

| Skill | Covers |
| --- | --- |
| [`lgtm-observability`](lgtm-observability/) | PromQL, LogQL, Tempo, and Alloy collector config. Correlating metrics → logs → traces, and instrumenting a service so it is diagnosable |

## Also installed

| Skill | From |
| --- | --- |
| `kubernetes-skill` | `LukasNiessen` — manifests, Helm, Kustomize, EKS/GKE/AKS/OpenShift, GitOps |
| `ci-cd-and-automation` | `addyosmani` |
| `observability-and-instrumentation` | `addyosmani` |
| `security-and-hardening` | `addyosmani` |
| `shipping-and-launch` | `addyosmani` |
| `wizard` | `mattpocock` — generates an interactive bash wizard for steps only a human can do (credentials, CI secrets, third-party dashboards) |

## Tools, not skills

[`k8sgpt`](https://github.com/k8sgpt-ai/k8sgpt) — `k8sgpt analyze --explain`
diagnoses a cluster in plain language, read-only by default.
[`trivy`](https://github.com/aquasecurity/trivy) for image and IaC scanning,
[`act`](https://github.com/nektos/act) to run Actions locally.

## The rule

**Observe, plan, bound, then mutate.** Plan/diff before every apply, `--context`
explicit on every `kubectl`, GitOps means editing manifests in git rather than
the cluster. See the `plan-before-operational-change` instinct and
[the devops workflow](../../../docs/docs/workflows/devops.md).
