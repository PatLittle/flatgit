from collections import Counter


def categories(rows):
    """Count records by category."""
    return Counter(row["category"] for row in rows)


if __name__ == "__main__":
    print(categories([{"category": "data"}, {"category": "data"}, {"category": "docs"}]))
