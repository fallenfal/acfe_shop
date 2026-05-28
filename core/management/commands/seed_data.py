"""
Populate the database with realistic ACFE Coffee test data.
"""

import random
from datetime import timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from core.management.superuser import (
    SUPERUSER_EMAIL,
    SUPERUSER_PASSWORD,
    SUPERUSER_USERNAME,
    ensure_dev_superuser,
)
from core.models import Location, Organisation, Role, User, UserLocationRole
from core.role_permissions import (
    ensure_datechecks_permissions_on_roles,
    ensure_training_permissions_on_roles,
)
from inventory.models import LocationStock, StockItem
from memos.models import Memo
from sales.models import MenuItem, Sale, SaleItem
from waste.models import WasteEntry

from datechecks.seed_helpers import seed_datechecks

DEFAULT_PASSWORD = "acfe2024!"


def all_permissions_true():
    return {
        "memos": {
            "create": True,
            "read": True,
            "update": True,
            "delete": True,
            "acknowledge": True,
        },
        "inventory": {
            "create": True,
            "read": True,
            "update": True,
            "stock_take": True,
        },
        "waste": {"create": True, "read": True, "view_reports": True},
        "datechecks": {
            "create": True,
            "read": True,
            "resolve_alerts": True,
            "manage_schedule": True,
        },
        "training": {
            "create": True,
            "read": True,
            "update": True,
            "delete": True,
            "assign": True,
            "complete": True,
        },
        "sales": {
            "view_dashboard": True,
            "view_financials": True,
            "export": True,
        },
        "users": {"invite": True, "manage": True, "view": True},
        "settings": {"manage_location": True, "manage_org": True},
    }


def cm_permissions():
    return {
        "memos": {
            "create": True,
            "read": True,
            "update": True,
            "delete": True,
            "acknowledge": True,
        },
        "inventory": {
            "create": True,
            "read": True,
            "update": True,
            "stock_take": True,
        },
        "waste": {"create": True, "read": True, "view_reports": True},
        "datechecks": {
            "create": True,
            "read": True,
            "resolve_alerts": True,
            "manage_schedule": True,
        },
        "training": {
            "create": True,
            "read": True,
            "update": True,
            "delete": True,
            "assign": True,
            "complete": True,
        },
        "sales": {"view_dashboard": True, "view_financials": True},
        "users": {"view": True},
    }


def staff_permissions():
    return {
        "memos": {"read": True, "acknowledge": True},
        "inventory": {"read": True, "stock_take": True},
        "waste": {"create": True, "read": True},
        "datechecks": {"create": True, "read": True},
        "training": {"read": True, "complete": True},
        "sales": {"view_dashboard": True},
    }


class Command(BaseCommand):
    help = "Populate the database with realistic ACFE Coffee test data"

    def add_arguments(self, parser):
        parser.add_argument(
            "--force",
            action="store_true",
            help="Delete existing ACFE Coffee data and re-seed",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        _, superuser_created = ensure_dev_superuser()

        if Organisation.objects.filter(slug="acfe-coffee").exists():
            if not options["force"]:
                patched_datechecks = ensure_datechecks_permissions_on_roles()
                patched_training = ensure_training_permissions_on_roles()
                if patched_datechecks:
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"Updated datechecks permissions on {patched_datechecks} role(s)."
                        )
                    )
                if patched_training:
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"Updated training permissions on {patched_training} role(s)."
                        )
                    )
                self.stderr.write(
                    self.style.WARNING(
                        "Organisation 'ACFE Coffee' already exists. "
                        "Run with --force to delete and re-seed."
                    )
                )
                self._print_superuser_only(superuser_created)
                return
            self._clear_existing()

        summary = {"superuser": 1}
        org = self._create_organisation()
        summary["organisation"] = 1

        locations = self._create_locations(org)
        summary["locations"] = len(locations)

        roles = self._create_roles(org)
        summary["roles"] = len(roles)

        users = self._create_users(org)
        summary["users"] = len(users)

        ulr_count = self._assign_user_location_roles(users, roles, locations)
        summary["user_location_roles"] = ulr_count

        stock_items = self._create_stock_items(org)
        summary["stock_items"] = len(stock_items)

        ls_count = self._create_location_stock(stock_items, locations)
        summary["location_stock"] = ls_count

        menu_items = self._create_menu_items(org)
        summary["menu_items"] = len(menu_items)

        memo_count = self._create_memos(org, locations, users)
        summary["memos"] = memo_count

        waste_count = self._create_waste_entries(
            locations, menu_items, stock_items, users
        )
        summary["waste_entries"] = waste_count

        sale_count, sale_item_count = self._create_sales(locations, menu_items)
        summary["sales"] = sale_count
        summary["sale_items"] = sale_item_count

        datecheck_stats = seed_datechecks(org)
        summary["date_checks"] = datecheck_stats["date_checks"]
        summary["date_check_entries"] = datecheck_stats["entries"]
        summary["expiry_alerts_active"] = datecheck_stats["active_alerts"]

        self._print_summary(org, locations, users, summary)

    def _print_superuser_only(self, created):
        verb = "Created" if created else "Ensured"
        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS(f"{verb} Django admin superuser."))
        self._print_admin_credentials()

    def _print_admin_credentials(self):
        self.stdout.write("")
        self.stdout.write("  Django Admin (all orgs, all data): /admin/")
        self.stdout.write(f"    Username: {SUPERUSER_USERNAME}")
        self.stdout.write(f"    Email:    {SUPERUSER_EMAIL}")
        self.stdout.write(f"    Password: {SUPERUSER_PASSWORD}")
        self.stdout.write(
            self.style.WARNING("    (Use username on login form, not email.)")
        )

    def _clear_existing(self):
        org = Organisation.objects.filter(slug="acfe-coffee").first()
        if org:
            org.delete()
        self.stdout.write(self.style.WARNING("Cleared existing ACFE Coffee data."))

    def _create_organisation(self):
        return Organisation.objects.create(
            name="ACFE Coffee",
            slug="acfe-coffee",
            settings={
                "timezone": "Europe/London",
                "currency": "GBP",
                "date_format": "DD/MM/YYYY",
            },
        )

    def _create_locations(self, org):
        specs = [
            {
                "name": "ACFE Aberdeen Union St",
                "slug": "aberdeen-union-st",
                "address": "123 Union Street, Aberdeen AB10 1QP",
                "phone": "01224 123456",
                "email": "unionst@acfe.coffee",
            },
            {
                "name": "ACFE Aberdeen Beach",
                "slug": "aberdeen-beach",
                "address": "Beach Boulevard, Aberdeen AB24 5NS",
                "phone": "01224 654321",
                "email": "beach@acfe.coffee",
            },
        ]
        locations = []
        for spec in specs:
            locations.append(
                Location.objects.create(
                    organisation=org,
                    opening_hours={
                        "monday": {"open": "07:00", "close": "18:00"},
                        "tuesday": {"open": "07:00", "close": "18:00"},
                        "wednesday": {"open": "07:00", "close": "18:00"},
                        "thursday": {"open": "07:00", "close": "18:00"},
                        "friday": {"open": "07:00", "close": "19:00"},
                        "saturday": {"open": "08:00", "close": "17:00"},
                        "sunday": {"open": "09:00", "close": "16:00"},
                    },
                    **spec,
                )
            )
        return locations

    def _create_roles(self, org):
        role_specs = [
            ("Owner", "owner", all_permissions_true(), True),
            ("Content Manager", "content_manager", cm_permissions(), True),
            ("Staff", "staff", staff_permissions(), True),
        ]
        roles = {}
        for name, slug, permissions, is_system in role_specs:
            roles[slug] = Role.objects.create(
                organisation=org,
                name=name,
                slug=slug,
                permissions=permissions,
                is_system_role=is_system,
            )
        return roles

    def _create_users(self, org):
        specs = [
            {
                "username": "jordan.owner",
                "email": "jordan@acfe.coffee",
                "first_name": "Jordan",
                "last_name": "MacLeod",
                "phone": "07700 900001",
                "is_staff": True,
            },
            {
                "username": "sarah.cm.union",
                "email": "sarah.union@acfe.coffee",
                "first_name": "Sarah",
                "last_name": "Fraser",
                "phone": "07700 900002",
                "is_staff": True,
            },
            {
                "username": "mike.cm.beach",
                "email": "mike.beach@acfe.coffee",
                "first_name": "Mike",
                "last_name": "Stewart",
                "phone": "07700 900003",
                "is_staff": True,
            },
            {
                "username": "emma.staff.union",
                "email": "emma.union@acfe.coffee",
                "first_name": "Emma",
                "last_name": "Reid",
                "phone": "07700 900004",
            },
            {
                "username": "liam.staff.beach",
                "email": "liam.beach@acfe.coffee",
                "first_name": "Liam",
                "last_name": "Gordon",
                "phone": "07700 900005",
            },
        ]
        users = {}
        for spec in specs:
            user = User.objects.create_user(
                password=DEFAULT_PASSWORD,
                organisation=org,
                **spec,
            )
            users[spec["username"]] = user
        return users

    def _assign_user_location_roles(self, users, roles, locations):
        union_st, beach = locations
        assignments = [
            (users["jordan.owner"], union_st, roles["owner"]),
            (users["jordan.owner"], beach, roles["owner"]),
            (users["sarah.cm.union"], union_st, roles["content_manager"]),
            (users["mike.cm.beach"], beach, roles["content_manager"]),
            (users["emma.staff.union"], union_st, roles["staff"]),
            (users["liam.staff.beach"], beach, roles["staff"]),
        ]
        for user, location, role in assignments:
            UserLocationRole.objects.create(
                user=user,
                location=location,
                role=role,
                assigned_by=users["jordan.owner"],
            )
        return len(assignments)

    def _create_stock_items(self, org):
        specs = [
            ("Whole milk", StockItem.Category.DAIRY, StockItem.Unit.L, ["Grahams Dairy"]),
            (
                "Single-origin coffee beans",
                StockItem.Category.COFFEE_TEA,
                StockItem.Unit.KG,
                ["Origin Coffee Roasters"],
            ),
            ("Oat milk (barista)", StockItem.Category.DAIRY, StockItem.Unit.L, ["Oatly"]),
            (
                "Granulated sugar",
                StockItem.Category.DRY_GOODS,
                StockItem.Unit.KG,
                ["Brakes"],
            ),
            (
                "12oz takeaway cups",
                StockItem.Category.PACKAGING,
                StockItem.Unit.UNITS,
                ["Huhtamaki"],
            ),
            (
                "Flat lids (12oz)",
                StockItem.Category.PACKAGING,
                StockItem.Unit.UNITS,
                ["Huhtamaki"],
            ),
            (
                "Plain flour",
                StockItem.Category.DRY_GOODS,
                StockItem.Unit.KG,
                ["Brakes"],
            ),
            (
                "Unsalted butter",
                StockItem.Category.DAIRY,
                StockItem.Unit.KG,
                ["Grahams Dairy"],
            ),
            (
                "Free-range eggs",
                StockItem.Category.DAIRY,
                StockItem.Unit.UNITS,
                ["Grahams Dairy"],
            ),
            (
                "Paper napkins",
                StockItem.Category.PACKAGING,
                StockItem.Unit.UNITS,
                ["Brakes"],
            ),
            (
                "Vanilla syrup",
                StockItem.Category.BEVERAGES,
                StockItem.Unit.ML,
                ["Monin"],
            ),
            (
                "Drinking chocolate powder",
                StockItem.Category.DRY_GOODS,
                StockItem.Unit.KG,
                ["Callebaut"],
            ),
            (
                "Ripe avocados",
                StockItem.Category.FRESH_PRODUCE,
                StockItem.Unit.UNITS,
                ["Harbour Foods"],
            ),
            (
                "Sourdough loaf",
                StockItem.Category.BAKERY,
                StockItem.Unit.UNITS,
                ["Bread Ahead"],
            ),
            (
                "Commercial dish soap",
                StockItem.Category.CLEANING,
                StockItem.Unit.ML,
                ["Ecolab"],
            ),
        ]
        return [
            StockItem.objects.create(
                organisation=org,
                name=name,
                category=category,
                unit=unit,
                preferred_suppliers=suppliers,
            )
            for name, category, unit, suppliers in specs
        ]

    def _create_location_stock(self, stock_items, locations):
        # (current_qty, par_level, unit_cost) per location — beach is busier on drinks
        profiles = {
            0: [(42.0, 20.0, 0.89), (38.0, 18.0, 0.92)],  # milk
            1: [(8.5, 4.0, 18.50), (7.2, 3.5, 19.00)],  # beans
            2: [(28.0, 12.0, 1.45), (35.0, 15.0, 1.48)],  # oat milk
            3: [(5.0, 2.0, 0.95), (4.5, 2.0, 0.95)],
            4: [(1200, 500, 0.04), (1500, 600, 0.04)],  # cups
            5: [(1100, 500, 0.02), (1400, 600, 0.02)],
            6: [(12.0, 5.0, 0.65), (10.0, 4.0, 0.65)],
            7: [(4.0, 2.0, 6.80), (3.5, 1.5, 6.80)],
            8: [(48, 24, 0.35), (36, 18, 0.35)],
            9: [(800, 300, 0.01), (650, 250, 0.01)],
            10: [(2000, 800, 0.008), (1800, 700, 0.008)],
            11: [(2.5, 1.0, 12.00), (2.0, 1.0, 12.00)],
            12: [(24, 12, 0.85), (18, 10, 0.88)],
            13: [(8, 4, 3.20), (6, 3, 3.25)],
            14: [(5000, 2000, 0.002), (4500, 1800, 0.002)],
        }
        count = 0
        for idx, item in enumerate(stock_items):
            for loc_idx, location in enumerate(locations):
                qty, par, cost = profiles[idx][loc_idx]
                LocationStock.objects.create(
                    stock_item=item,
                    location=location,
                    current_quantity=qty,
                    par_level=par,
                    unit_cost=Decimal(str(cost)),
                )
                count += 1
        return count

    def _create_menu_items(self, org):
        specs = [
            ("Flat white", MenuItem.Category.HOT_DRINKS, "3.40", "0.45"),
            ("Latte", MenuItem.Category.HOT_DRINKS, "3.50", "0.48"),
            ("Cappuccino", MenuItem.Category.HOT_DRINKS, "3.50", "0.48"),
            ("Americano", MenuItem.Category.HOT_DRINKS, "3.00", "0.35"),
            ("Mocha", MenuItem.Category.HOT_DRINKS, "3.80", "0.55"),
            ("Hot chocolate", MenuItem.Category.HOT_DRINKS, "3.60", "0.50"),
            ("Iced latte", MenuItem.Category.COLD_DRINKS, "3.70", "0.52"),
            ("Orange juice", MenuItem.Category.COLD_DRINKS, "2.80", "0.65"),
            ("Croissant", MenuItem.Category.BAKERY, "2.50", "0.55"),
            ("Pain au chocolat", MenuItem.Category.BAKERY, "2.80", "0.62"),
            ("Sourdough toast", MenuItem.Category.FOOD, "4.50", "1.10"),
            ("Avocado toast", MenuItem.Category.FOOD, "7.50", "2.20"),
            ("Granola bowl", MenuItem.Category.FOOD, "5.50", "1.45"),
            ("Carrot cake", MenuItem.Category.BAKERY, "3.20", "0.85"),
            ("Brownie", MenuItem.Category.BAKERY, "2.90", "0.72"),
            ("Cookie", MenuItem.Category.BAKERY, "2.20", "0.40"),
            ("Banana bread", MenuItem.Category.BAKERY, "3.00", "0.68"),
            ("Soup of the day", MenuItem.Category.FOOD, "5.00", "1.35"),
            ("Sandwich", MenuItem.Category.FOOD, "6.50", "1.80"),
            ("Salad", MenuItem.Category.FOOD, "7.00", "2.10"),
        ]
        return [
            MenuItem.objects.create(
                organisation=org,
                name=name,
                category=category,
                price=Decimal(price),
                ingredient_cost=Decimal(cost),
            )
            for name, category, price, cost in specs
        ]

    def _create_memos(self, org, locations, users):
        union_st, beach = locations
        owner = users["jordan.owner"]
        cm_union = users["sarah.cm.union"]
        cm_beach = users["mike.cm.beach"]

        memo_specs = [
            {
                "title": "Weekend staffing — Union St",
                "location": union_st,
                "author": cm_union,
                "priority": Memo.Priority.IMPORTANT,
                "category": Memo.Category.DAILY_BRIEFING,
                "is_pinned": True,
                "body": (
                    "Saturday expects high footfall due to the farmers market. "
                    "Please arrive 15 minutes early for a quick huddle at 7:45."
                ),
            },
            {
                "title": "New seasonal blend launching Monday",
                "location": None,
                "author": owner,
                "priority": Memo.Priority.NORMAL,
                "category": Memo.Category.MENU_CHANGE,
                "is_pinned": True,
                "body": (
                    "Ethiopian Yirgacheffe replaces the house blend from Monday. "
                    "Dial in shots at 18g in / 36g out, 28–30 seconds."
                ),
            },
            {
                "title": "Beach esplanade event — extra waste bins",
                "location": beach,
                "author": cm_beach,
                "priority": Memo.Priority.NORMAL,
                "category": Memo.Category.GENERAL,
                "body": "Council event this Sunday. Place two extra bins by the terrace door.",
            },
            {
                "title": "Steam wand gasket replacement",
                "location": union_st,
                "author": cm_union,
                "priority": Memo.Priority.URGENT,
                "category": Memo.Category.EQUIPMENT,
                "body": (
                    "Engineer booked Tuesday 10:00. Use the backup machine on bar 2 until fixed."
                ),
            },
            {
                "title": "Allergen update: oat milk supplier change",
                "location": None,
                "author": owner,
                "priority": Memo.Priority.IMPORTANT,
                "category": Memo.Category.HEALTH_SAFETY,
                "requires_acknowledgement": True,
                "body": (
                    "New Oatly Barista batch may contain traces of nuts. "
                    "Update allergen cards at both sites by end of shift."
                ),
            },
            {
                "title": "Fridge temperature log reminder",
                "location": beach,
                "author": cm_beach,
                "priority": Memo.Priority.NORMAL,
                "category": Memo.Category.HEALTH_SAFETY,
                "body": "Log walk-in and display fridges at open, midday, and close.",
            },
            {
                "title": "Union St — loyalty card promotion",
                "location": union_st,
                "author": cm_union,
                "priority": Memo.Priority.NORMAL,
                "category": Memo.Category.GENERAL,
                "body": "Buy 9 hot drinks, get the 10th free. Stamp cards at the till.",
            },
            {
                "title": "Beach — patio furniture stored overnight",
                "location": beach,
                "author": cm_beach,
                "priority": Memo.Priority.IMPORTANT,
                "category": Memo.Category.POLICY_UPDATE,
                "body": (
                    "High winds forecast Thursday. Bring chairs inside after close; "
                    "stack tables against the south wall."
                ),
            },
            {
                "title": "Monthly deep clean checklist",
                "location": None,
                "author": owner,
                "priority": Memo.Priority.NORMAL,
                "category": Memo.Category.GENERAL,
                "body": (
                    "First Sunday of the month: grinder burrs, drip trays, "
                    "under-counter shelves, and grease trap check."
                ),
            },
            {
                "title": "Training: latte art refresher",
                "location": union_st,
                "author": cm_union,
                "priority": Memo.Priority.NORMAL,
                "category": Memo.Category.GENERAL,
                "body": "Optional session Wednesday 16:00 after close. Milk sponsored by the house.",
            },
        ]

        now = timezone.now()
        for i, spec in enumerate(memo_specs):
            memo = Memo.objects.create(organisation=org, **spec)
            Memo.objects.filter(pk=memo.pk).update(
                created_at=now - timedelta(days=10 - i)
            )
        return len(memo_specs)

    def _create_waste_entries(self, locations, menu_items, stock_items, users):
        union_st, beach = locations
        staff_by_loc = {
            union_st.id: users["emma.staff.union"],
            beach.id: users["liam.staff.beach"],
        }
        menu_by_name = {m.name: m for m in menu_items}
        stock_by_name = {s.name: s for s in stock_items}

        waste_specs = [
            # menu item waste
            ("Flat white", "menu_item", 2, "units", WasteEntry.Reason.CUSTOMER_RETURN, WasteEntry.Shift.MORNING),
            ("Croissant", "menu_item", 3, "units", WasteEntry.Reason.EXPIRED, WasteEntry.Shift.MORNING),
            ("Latte", "menu_item", 1, "units", WasteEntry.Reason.DROPPED_SPILLAGE, WasteEntry.Shift.MORNING),
            ("Avocado toast", "menu_item", 1, "units", WasteEntry.Reason.OVER_PRODUCTION, WasteEntry.Shift.AFTERNOON),
            ("Brownie", "menu_item", 4, "units", WasteEntry.Reason.EXPIRED, WasteEntry.Shift.EVENING),
            ("Soup of the day", "menu_item", 2, "units", WasteEntry.Reason.OVER_PRODUCTION, WasteEntry.Shift.EVENING),
            ("Iced latte", "menu_item", 1, "units", WasteEntry.Reason.QUALITY_ISSUE, WasteEntry.Shift.AFTERNOON),
            ("Pain au chocolat", "menu_item", 2, "units", WasteEntry.Reason.EXPIRED, WasteEntry.Shift.MORNING),
            ("Sandwich", "menu_item", 1, "units", WasteEntry.Reason.CUSTOMER_RETURN, WasteEntry.Shift.AFTERNOON),
            ("Carrot cake", "menu_item", 2, "units", WasteEntry.Reason.EXPIRED, WasteEntry.Shift.EVENING),
            # stock waste
            ("Whole milk", "stock_item", 2.5, "l", WasteEntry.Reason.EXPIRED, WasteEntry.Shift.MORNING),
            ("Oat milk (barista)", "stock_item", 1.0, "l", WasteEntry.Reason.DROPPED_SPILLAGE, WasteEntry.Shift.MORNING),
            ("Single-origin coffee beans", "stock_item", 0.2, "kg", WasteEntry.Reason.EQUIPMENT_FAILURE, WasteEntry.Shift.MORNING),
            ("Ripe avocados", "stock_item", 4, "units", WasteEntry.Reason.EXPIRED, WasteEntry.Shift.AFTERNOON),
            ("Free-range eggs", "stock_item", 6, "units", WasteEntry.Reason.EXPIRED, WasteEntry.Shift.MORNING),
            ("Sourdough loaf", "stock_item", 1, "units", WasteEntry.Reason.QUALITY_ISSUE, WasteEntry.Shift.MORNING),
            ("12oz takeaway cups", "stock_item", 15, "units", WasteEntry.Reason.DROPPED_SPILLAGE, WasteEntry.Shift.AFTERNOON),
            ("Unsalted butter", "stock_item", 0.3, "kg", WasteEntry.Reason.EXPIRED, WasteEntry.Shift.EVENING),
            ("Granulated sugar", "stock_item", 0.5, "kg", WasteEntry.Reason.OTHER, WasteEntry.Shift.EVENING),
            ("Vanilla syrup", "stock_item", 150, "ml", WasteEntry.Reason.EQUIPMENT_FAILURE, WasteEntry.Shift.AFTERNOON),
        ]

        # Pad to 30 entries with variations
        extra_menu = ["Cookie", "Mocha", "Granola bowl", "Banana bread", "Salad"]
        extra_reasons = list(WasteEntry.Reason.choices)
        extra_shifts = list(WasteEntry.Shift.choices)

        entries_data = list(waste_specs)
        while len(entries_data) < 30:
            name = random.choice(extra_menu)
            entries_data.append(
                (
                    name,
                    "menu_item",
                    random.randint(1, 3),
                    "units",
                    random.choice(extra_reasons)[0],
                    random.choice(extra_shifts)[0],
                )
            )

        entries_data = entries_data[:30]
        now = timezone.now()
        created = []

        for i, (item_name, item_type, qty, unit, reason, shift) in enumerate(entries_data):
            location = random.choice(locations)
            logged_by = staff_by_loc[location.id]

            if item_type == "menu_item":
                item = menu_by_name[item_name]
                cost = float(item.ingredient_cost) * qty
                entry = WasteEntry(
                    location=location,
                    item_type=WasteEntry.ItemType.MENU_ITEM,
                    menu_item=item,
                    quantity=qty,
                    unit=unit,
                    reason=reason,
                    shift=shift,
                    cost_value=Decimal(str(round(cost, 2))),
                    logged_by=logged_by,
                )
            else:
                item = stock_by_name[item_name]
                ls = LocationStock.objects.get(stock_item=item, location=location)
                cost = float(ls.unit_cost) * qty
                entry = WasteEntry(
                    location=location,
                    item_type=WasteEntry.ItemType.STOCK_ITEM,
                    stock_item=item,
                    quantity=qty,
                    unit=unit,
                    reason=reason,
                    shift=shift,
                    cost_value=Decimal(str(round(cost, 2))),
                    logged_by=logged_by,
                )

            entry.save()
            logged_at = now - timedelta(
                days=random.randint(0, 29),
                hours=random.randint(7, 20),
                minutes=random.randint(0, 59),
            )
            WasteEntry.objects.filter(pk=entry.pk).update(logged_at=logged_at)
            created.append(entry)

        return len(created)

    def _weighted_sale_hour(self):
        """Peak at 8–10 and 12–14; quieter early morning and late afternoon."""
        hour_weights = {
            7: 3,
            8: 18,
            9: 22,
            10: 15,
            11: 10,
            12: 20,
            13: 22,
            14: 18,
            15: 8,
            16: 6,
            17: 4,
            18: 2,
        }
        hours = list(hour_weights.keys())
        weights = [hour_weights[h] for h in hours]
        return random.choices(hours, weights=weights, k=1)[0]

    def _create_sales(self, locations, menu_items):
        hot_drinks = [m for m in menu_items if m.category == MenuItem.Category.HOT_DRINKS]
        cold_drinks = [m for m in menu_items if m.category == MenuItem.Category.COLD_DRINKS]
        bakery = [m for m in menu_items if m.category == MenuItem.Category.BAKERY]
        food = [m for m in menu_items if m.category == MenuItem.Category.FOOD]

        def pick_items():
            items = []
            # Morning coffee rush pattern
            items.append(random.choice(hot_drinks))
            if random.random() < 0.45:
                items.append(random.choice(hot_drinks))
            if random.random() < 0.35:
                items.append(random.choice(bakery))
            if random.random() < 0.25:
                items.append(random.choice(food))
            if random.random() < 0.15:
                items.append(random.choice(cold_drinks))
            return items

        payment_weights = [
            (Sale.PaymentMethod.CARD, 68),
            (Sale.PaymentMethod.MOBILE, 18),
            (Sale.PaymentMethod.CASH, 12),
            (Sale.PaymentMethod.OTHER, 2),
        ]
        payment_methods = [p[0] for p in payment_weights]
        payment_probs = [p[1] for p in payment_weights]

        now = timezone.now()
        ref_counter = 1000
        sale_count = 0
        sale_item_count = 0

        for _ in range(200):
            location = random.choice(locations)
            days_ago = random.randint(0, 29)
            hour = self._weighted_sale_hour()
            minute = random.randint(0, 59)
            ts = (now - timedelta(days=days_ago)).replace(
                hour=hour, minute=minute, second=random.randint(0, 59), microsecond=0
            )

            line_menu_items = pick_items()
            consolidated = {}
            for m in line_menu_items:
                consolidated[m] = consolidated.get(m, 0) + 1

            total = Decimal("0")
            ref_counter += 1
            for menu_item, qty in consolidated.items():
                total += menu_item.price * qty

            sale = Sale.objects.create(
                location=location,
                transaction_ref=f"POS-{location.slug[:3].upper()}-{ref_counter}",
                timestamp=ts,
                total_amount=total,
                payment_method=random.choices(
                    payment_methods, weights=payment_probs, k=1
                )[0],
            )
            sale_count += 1

            for menu_item, qty in consolidated.items():
                SaleItem.objects.create(
                    sale=sale,
                    menu_item=menu_item,
                    quantity=qty,
                    unit_price=menu_item.price,
                    line_total=menu_item.price * qty,
                )
                sale_item_count += 1

        return sale_count, sale_item_count

    def _print_summary(self, org, locations, users, summary):
        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("=" * 60))
        self.stdout.write(self.style.SUCCESS("  ACFE Coffee — seed data complete"))
        self.stdout.write(self.style.SUCCESS("=" * 60))
        self.stdout.write("")
        self.stdout.write(f"  Organisation:  {org.name} ({org.slug})")
        self.stdout.write("  Locations:")
        for loc in locations:
            self.stdout.write(f"    • {loc.name}")
        self.stdout.write("")
        self.stdout.write("  Users (password for all: %s)" % DEFAULT_PASSWORD)
        for username, user in users.items():
            self.stdout.write(f"    • {username} — {user.get_full_name()} ({user.email})")
        self.stdout.write("")
        self.stdout.write("  Records created:")
        for key, count in summary.items():
            label = key.replace("_", " ").title()
            self.stdout.write(f"    • {label}: {count}")
        self._print_admin_credentials()
        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("  Run the admin or API to explore the data."))
        self.stdout.write(self.style.SUCCESS("=" * 60))
