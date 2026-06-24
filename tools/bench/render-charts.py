#!/usr/bin/env python3
"""Dev-only benchmark chart renderer. Run: pip install -r tools/bench/requirements.txt"""

from __future__ import annotations

import csv
from pathlib import Path

import matplotlib.pyplot as plt
import matplotlib.ticker as mticker

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "docs"
SWEEP_CSV = DOCS / "bench-ewma-alpha-sweep.csv"

STYLE = {
    "figure.figsize": (8, 5),
    "font.size": 11,
    "axes.titlesize": 13,
    "axes.labelsize": 11,
    "axes.grid": True,
    "grid.alpha": 0.3,
    "axes.spines.top": False,
    "axes.spines.right": False,
}

COLORS = {
    "primary": "#2563eb",
    "secondary": "#64748b",
    "accent": "#059669",
    "warn": "#d97706",
    "muted": "#94a3b8",
}

BENCH_DATA = {
    "b1": {
        "single_checker_fpr_pct": 33.3,
        "consensus_fpr_pct": 0.0,
        "note": "Phase 3 lossy window — checker-eu iptables FORWARD drop",
    },
    "b3": {
        "runs": [
            {
                "label": "sustained\n(20s fail / 20s ok)",
                "consensus_edges": 295,
                "alerts": 144,
            },
            {
                "label": "sub-threshold\n(10s fail / 10s ok)",
                "consensus_edges": 199,
                "alerts": 0,
            },
        ],
        "note": "Phase 4 flap suppression — fake-target, 100 cycles each",
    },
    "b5": {
        "scenarios": [
            {
                "label": "service-wide\n/control/slow/400",
                "service_anomaly": 1,
                "regional_anomaly": 0,
                "service_alert": 1,
            },
            {
                "label": "regional\ntc netem 400ms (eu only)",
                "service_anomaly": 0,
                "regional_anomaly": 1,
                "service_alert": 0,
            },
        ],
        "note": "Phase 7 DoD — binary outcomes (occurred / not); all paths slow pages, one path slow does not",
    },
}


def _save(fig: plt.Figure, name: str) -> Path:
    DOCS.mkdir(parents=True, exist_ok=True)
    path = DOCS / name
    fig.tight_layout()
    fig.savefig(path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    return path


def chart_b1() -> Path:
    data = BENCH_DATA["b1"]
    labels = ["single-checker\n(checker-eu down rate)", "consensus\n(alerts fired)"]
    values = [data["single_checker_fpr_pct"], data["consensus_fpr_pct"]]

    fig, ax = plt.subplots()
    bars = ax.bar(
        labels,
        values,
        color=[COLORS["warn"], COLORS["accent"]],
        width=0.55,
        edgecolor="white",
        linewidth=0.8,
    )
    ax.set_ylabel("false positive rate (%)")
    ax.set_title("Benchmark 1 — consensus suppresses single-checker packet loss")
    ax.set_ylim(0, max(values) * 1.25 + 5)
    ax.yaxis.set_major_formatter(mticker.FormatStrFormatter("%.1f%%"))

    for bar, val in zip(bars, values, strict=True):
        ax.text(
            bar.get_x() + bar.get_width() / 2,
            bar.get_height() + 1,
            f"{val:.1f}%",
            ha="center",
            va="bottom",
            fontsize=10,
        )

    ax.text(
        0.5,
        -0.22,
        data["note"],
        transform=ax.transAxes,
        ha="center",
        fontsize=9,
        color=COLORS["secondary"],
    )
    return _save(fig, "bench-b1-consensus-fpr.png")


def _zero_stub(max_val: float, fraction: float = 0.025) -> float:
    return max(max_val * fraction, 1.0)


def _label_bar(ax, bar, value: int, *, stub: bool = False) -> None:
    h = bar.get_height()
    y = h + (max(ax.get_ylim()) * 0.01)
    ax.text(
        bar.get_x() + bar.get_width() / 2,
        y,
        str(value),
        ha="center",
        va="bottom",
        fontsize=9,
        color=COLORS["secondary"] if stub else "black",
    )


def chart_b3() -> Path:
    data = BENCH_DATA["b3"]
    runs = data["runs"]
    labels = [r["label"] for r in runs]
    x = range(len(labels))
    width = 0.35
    ymax = max(r["consensus_edges"] for r in runs) * 1.18
    stub = _zero_stub(ymax)

    fig, ax = plt.subplots()
    ax.set_ylim(0, ymax)

    for i, run in enumerate(runs):
        edges = run["consensus_edges"]
        alerts = run["alerts"]

        edge_bar = ax.bar(
            i - width / 2,
            edges,
            width,
            color=COLORS["secondary"],
            label="consensus edges" if i == 0 else None,
        )
        _label_bar(ax, edge_bar[0], edges)

        if alerts == 0:
            alert_bar = ax.bar(
                i + width / 2,
                stub,
                width,
                color=COLORS["primary"],
                alpha=0.35,
                edgecolor=COLORS["primary"],
                linewidth=1.5,
                label="alerts delivered" if i == 0 else None,
            )
            _label_bar(ax, alert_bar[0], 0, stub=True)
        else:
            alert_bar = ax.bar(
                i + width / 2,
                alerts,
                width,
                color=COLORS["primary"],
                label="alerts delivered" if i == 0 else None,
            )
            _label_bar(ax, alert_bar[0], alerts)

    ax.set_xticks(list(x))
    ax.set_xticklabels(labels)
    ax.set_ylabel("count")
    ax.set_title(
        "Benchmark 3 — flap suppression vs consensus-edge alerting",
        pad=28,
    )
    ax.text(
        0.5,
        1.04,
        "sub-threshold run: 199 consensus edges → 0 alerts",
        transform=ax.transAxes,
        ha="center",
        va="bottom",
        fontsize=10,
        color=COLORS["accent"],
        fontweight="bold",
    )
    ax.legend(loc="upper right", frameon=False)

    ax.text(
        0.5,
        -0.2,
        data["note"],
        transform=ax.transAxes,
        ha="center",
        fontsize=9,
        color=COLORS["secondary"],
    )
    return _save(fig, "bench-b3-flap-suppression.png")


def chart_b5() -> Path:
    data = BENCH_DATA["b5"]
    scenarios = data["scenarios"]
    labels = [s["label"] for s in scenarios]
    x = range(len(labels))
    width = 0.25
    stub = 0.06

    fig, ax = plt.subplots()
    ax.set_ylim(0, 1.15)

    series = [
        ("service_anomaly", "service-wide anomaly", COLORS["warn"]),
        ("regional_anomaly", "regional anomaly", COLORS["primary"]),
        ("service_alert", "service alert (paged)", COLORS["accent"]),
    ]
    offsets = [-width, 0, width]

    for offset, (key, legend, color) in zip(offsets, series, strict=True):
        for i, scenario in enumerate(scenarios):
            val = scenario[key]
            is_zero = val == 0
            height = stub if is_zero else val
            bar = ax.bar(
                i + offset,
                height,
                width,
                color=color,
                alpha=0.35 if is_zero else 1.0,
                edgecolor=color if is_zero else "white",
                linewidth=1.2 if is_zero else 0.8,
                label=legend if i == 0 else None,
            )
            if is_zero:
                ax.text(
                    bar[0].get_x() + bar[0].get_width() / 2,
                    height + 0.03,
                    "0",
                    ha="center",
                    va="bottom",
                    fontsize=8,
                    color=COLORS["secondary"],
                )

    ax.set_xticks(list(x))
    ax.set_xticklabels(labels)
    ax.set_ylabel("occurred (1 = yes)")
    ax.set_yticks([0, 0.5, 1])
    ax.set_yticklabels(["0", "", "1"])
    ax.set_title("Benchmark 5 — service-wide vs regional latency classification")
    ax.legend(loc="upper right", frameon=False, fontsize=9)

    ax.text(
        0.5,
        -0.22,
        data["note"],
        transform=ax.transAxes,
        ha="center",
        fontsize=9,
        color=COLORS["secondary"],
    )
    return _save(fig, "bench-b5-regional-vs-service.png")


def _load_sweep_rows() -> list[dict[str, str]]:
    if not SWEEP_CSV.exists():
        return []
    with SWEEP_CSV.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def chart_b2() -> Path | None:
    rows = _load_sweep_rows()
    if not rows:
        print(f"skip B2: {SWEEP_CSV} not found")
        return None

    phase5 = [r for r in rows if r["series"] == "phase5-style"]
    drift = [r for r in rows if r["series"] == "drift"]
    if not phase5 or not drift:
        print("skip B2: expected phase5-style and drift rows in sweep csv")
        return None

    alphas = [float(r["alpha"]) for r in phase5]
    fp = [int(r["false_positives_pre_inject"]) for r in phase5]
    z_scores = [float(r["first_z_score"]) for r in drift]

    fig, (ax_fp, ax_z) = plt.subplots(1, 2, figsize=(10, 4.5))

    ax_fp.bar(
        [str(a) for a in alphas],
        fp,
        color=COLORS["warn"],
        width=0.55,
        edgecolor="white",
    )
    ax_fp.set_xlabel("alpha")
    ax_fp.set_ylabel("false positives (pre-inject)")
    ax_fp.set_title("messy baseline (phase5-style)")
    ax_fp.set_ylim(0, max(fp) + 1)

    ax_z.plot(alphas, z_scores, marker="o", color=COLORS["primary"], linewidth=2)
    ax_z.axhline(3, color=COLORS["muted"], linestyle="--", linewidth=1, label="z = 3 threshold")
    ax_z.set_xlabel("alpha")
    ax_z.set_ylabel("first-detection z-score")
    ax_z.set_title("gentle drift (+3ms/cycle)")
    ax_z.legend(frameon=False, fontsize=9)

    fig.suptitle("Benchmark 2 — EWMA alpha sweep (offline replay)", fontsize=13, y=1.02)
    return _save(fig, "bench-b2-ewma-alpha-sweep.png")


def main() -> None:
    plt.rcParams.update(STYLE)
    outputs: list[Path] = []

    for fn in (chart_b1, chart_b3, chart_b5):
        path = fn()
        outputs.append(path)
        print(f"wrote {path.relative_to(ROOT)}")

    b2 = chart_b2()
    if b2:
        outputs.append(b2)
        print(f"wrote {b2.relative_to(ROOT)}")

    print(f"\n{len(outputs)} chart(s) in docs/")


if __name__ == "__main__":
    main()
