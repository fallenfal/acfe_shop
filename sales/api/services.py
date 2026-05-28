"""Sales import and write-side business logic."""

import csv
import io
from collections import defaultdict
from datetime import datetime
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from sales.models import MenuItem, Sale, SaleItem

REQUIRED_COLUMNS = frozenset(
    {"timestamp", "item_name", "quantity", "unit_price", "total", "payment_method"}
)

PAYMENT_ALIASES = {
    "card": Sale.PaymentMethod.CARD,
    "credit": Sale.PaymentMethod.CARD,
    "debit": Sale.PaymentMethod.CARD,
    "cash": Sale.PaymentMethod.CASH,
    "mobile": Sale.PaymentMethod.MOBILE,
    "apple pay": Sale.PaymentMethod.MOBILE,
    "google pay": Sale.PaymentMethod.MOBILE,
    "contactless": Sale.PaymentMethod.CARD,
    "other": Sale.PaymentMethod.OTHER,
}


def _normalize_header(name):
    return (name or "").strip().lower().replace(" ", "_")


def _parse_decimal(value, field_name, row_num):
    if value is None or str(value).strip() == "":
        raise ValueError(f"Row {row_num}: missing {field_name}")
    try:
        return Decimal(str(value).strip().replace("£", "").replace(",", ""))
    except (InvalidOperation, ValueError) as exc:
        raise ValueError(f"Row {row_num}: invalid {field_name} '{value}'") from exc


def _parse_timestamp(value, row_num):
    raw = str(value).strip()
    if not raw:
        raise ValueError(f"Row {row_num}: missing timestamp")
    dt = parse_datetime(raw)
    if dt is None:
        for fmt in (
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%d %H:%M",
            "%Y-%m-%d",
            "%d/%m/%Y %H:%M:%S",
            "%d/%m/%Y %H:%M",
            "%d/%m/%Y",
        ):
            try:
                dt = datetime.strptime(raw, fmt)
                break
            except ValueError:
                continue
    if dt is None:
        raise ValueError(f"Row {row_num}: could not parse timestamp '{value}'")
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, timezone.get_current_timezone())
    return dt


def _normalize_payment(value, row_num):
    key = str(value or "card").strip().lower()
    if key in PAYMENT_ALIASES:
        return PAYMENT_ALIASES[key]
    if key in Sale.PaymentMethod.values:
        return key
    raise ValueError(f"Row {row_num}: unknown payment_method '{value}'")


def _build_menu_lookup(organisation):
    lookup = {}
    for item in MenuItem.objects.filter(organisation=organisation, is_active=True):
        lookup[item.name.strip().lower()] = item
    return lookup


def import_sales_csv(location, file_obj):
    """
    Parse POS CSV and create Sale / SaleItem records.
    Rows with the same timestamp are grouped into one transaction.
    """
    content = file_obj.read()
    if isinstance(content, bytes):
        content = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(content))
    if not reader.fieldnames:
        return {
            "rows_processed": 0,
            "sales_created": 0,
            "errors": ["CSV file is empty or has no header row."],
            "revenue_imported": 0.0,
        }

    field_map = {_normalize_header(h): h for h in reader.fieldnames}
    missing = REQUIRED_COLUMNS - set(field_map)
    if missing:
        return {
            "rows_processed": 0,
            "sales_created": 0,
            "errors": [f"Missing required columns: {', '.join(sorted(missing))}"],
            "revenue_imported": 0.0,
        }

    menu_lookup = _build_menu_lookup(location.organisation)
    grouped = defaultdict(list)
    errors = []
    rows_processed = 0

    for row_num, raw_row in enumerate(reader, start=2):
        rows_processed += 1
        row = {
            col: raw_row.get(field_map[col], "").strip()
            for col in REQUIRED_COLUMNS
            if col in field_map
        }
        try:
            ts = _parse_timestamp(row["timestamp"], row_num)
            quantity = int(_parse_decimal(row["quantity"], "quantity", row_num))
            if quantity < 1:
                raise ValueError(f"Row {row_num}: quantity must be at least 1")
            unit_price = _parse_decimal(row["unit_price"], "unit_price", row_num)
            line_total = _parse_decimal(row["total"], "total", row_num)
            payment_method = _normalize_payment(row["payment_method"], row_num)
            item_name = str(row["item_name"]).strip()
            if not item_name:
                raise ValueError(f"Row {row_num}: missing item_name")

            menu_item = menu_lookup.get(item_name.lower())
            grouped[(ts, payment_method)].append(
                {
                    "menu_item": menu_item,
                    "item_name": item_name,
                    "quantity": quantity,
                    "unit_price": unit_price,
                    "line_total": line_total,
                    "row_num": row_num,
                }
            )
        except ValueError as exc:
            errors.append(str(exc))

    sales_created = 0
    revenue_imported = Decimal("0")

    with transaction.atomic():
        for (ts, payment_method), lines in grouped.items():
            try:
                sale_total = sum(line["line_total"] for line in lines)
                sale = Sale.objects.create(
                    location=location,
                    timestamp=ts,
                    total_amount=sale_total,
                    payment_method=payment_method,
                )
                for line in lines:
                    SaleItem.objects.create(
                        sale=sale,
                        menu_item=line["menu_item"],
                        quantity=line["quantity"],
                        unit_price=line["unit_price"],
                        line_total=line["line_total"],
                    )
                    if line["menu_item"] is None:
                        errors.append(
                            f"Row {line['row_num']}: menu item "
                            f"'{line['item_name']}' not found; line imported without link"
                        )
                sales_created += 1
                revenue_imported += sale_total
            except Exception as exc:
                errors.append(f"Transaction at {ts}: {exc}")

    return {
        "rows_processed": rows_processed,
        "sales_created": sales_created,
        "errors": errors,
        "revenue_imported": float(revenue_imported),
    }
