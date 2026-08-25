#!/usr/bin/env bash
# Сбор данных Crucible review для последующего анализа (Python и т.д.)
#
# Usage:
#   ./crucible.sh CR-17391
#   ./crucible.sh              # default: CR-17391

set -euo pipefail

REVIEW="${1:-CR-17391}"
BASE_URL="https://abderus.dept07/crucible"
API="$BASE_URL/rest-service/reviews-v1"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

fetch_json() {
  curl -sS -H "Accept: application/json" "$1" -o "$2"
}

echo "Fetching review $REVIEW ..."

# Review meta + все review items (файлы, ревизии, contentUrl)
fetch_json "$API/$REVIEW/details" "$REVIEW-details.json"

# Inline-комментарии к коду (треды, replies, lineRanges, reviewItemId)
fetch_json "$API/$REVIEW/comments/versioned" "$REVIEW-comments.json"

# Общие комментарии к review
fetch_json "$API/$REVIEW/comments/general" "$REVIEW-general-comments.json"

# HTML страница review — embedded JS с status: UNRESOLVED / RESOLVED
curl -sS "$BASE_URL/cru/$REVIEW" -o "$REVIEW.html"

echo
echo "Done. Files in $SCRIPT_DIR:"
echo "  $REVIEW-details.json          — review + review items"
echo "  $REVIEW-comments.json         — versioned comments"
echo "  $REVIEW-general-comments.json — general comments"
echo "  $REVIEW.html                  — resolution status (UNRESOLVED/RESOLVED)"
