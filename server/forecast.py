# The "predict the future" part — same idea as skyCommand's Python forecasting,
# kept light so it runs on free tiers. Simple linear trend projection with numpy.
import json
import numpy as np


def forecast_next(history):
    """Project the next value from a short history using a linear trend."""
    y = np.array(history, dtype=float)
    x = np.arange(len(y))
    # fit a straight line y = m*x + b, then predict the next point
    m, b = np.polyfit(x, y, 1)
    next_val = float(m * len(y) + b)
    return round(next_val, 1)


if __name__ == "__main__":
    # Pretend these are the last 6 months of "Patients Seen".
    history = [1180, 1195, 1210, 1225, 1232, 1240]
    nxt = forecast_next(history)
    trend = "up" if nxt > history[-1] else "down"
    print(json.dumps({
        "history": history,
        "next_month": nxt,
        "trend": trend,
        "message": f"Patients Seen is trending {trend}; next month ~{nxt}.",
    }))
