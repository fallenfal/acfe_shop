"""Seed realistic training programmes, enrolments, and comments for ACFE Coffee."""

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from core.models import Location, Organisation, User, UserLocationRole
from training.models import (
    StepCompletion,
    TrainingComment,
    TrainingEnrolment,
    TrainingProgramme,
    TrainingStep,
)


def clear_training_for_org(organisation: Organisation) -> None:
    TrainingProgramme.objects.filter(organisation=organisation).delete()


def _staff_and_cm_assignments(org: Organisation) -> list[tuple[User, Location]]:
    """Users with staff or content_manager role at each assigned location."""
    rows = (
        UserLocationRole.objects.filter(
            location__organisation=org,
            role__slug__in=("staff", "content_manager"),
        )
        .select_related("user", "location")
        .order_by("user__username")
    )
    return [(row.user, row.location) for row in rows]


def _complete_steps(enrolment: TrainingEnrolment, count: int) -> int:
    steps = list(enrolment.programme.steps.order_by("order")[:count])
    created = 0
    for step in steps:
        _, was_created = StepCompletion.objects.get_or_create(
            enrolment=enrolment,
            step=step,
            defaults={
                "acknowledged": step.requires_acknowledgement,
            },
        )
        if was_created:
            created += 1
    enrolment.update_status()
    return created


PROGRAMME_SPECS = [
    {
        "title": "New Starter Onboarding",
        "description": (
            "Essential induction for everyone joining ACFE Coffee. Covers our culture, "
            "safety basics, till operations, menu knowledge, and customer service standards."
        ),
        "category": TrainingProgramme.Category.ONBOARDING,
        "is_mandatory": True,
        "status": TrainingProgramme.Status.PUBLISHED,
        "estimated_duration_minutes": 60,
        "assign_locations": True,
        "steps": [
            {
                "title": "Welcome to ACFE",
                "description": (
                    "ACFE Coffee exists to serve exceptional coffee with genuine hospitality. "
                    "Our values are quality, consistency, and community — every shift should "
                    "reflect pride in the product and respect for colleagues and customers. "
                    "Introduce yourself to your team lead and read the staff handbook on the "
                    "shared drive before your first service."
                ),
                "requires_acknowledgement": False,
            },
            {
                "title": "Health & Safety Basics",
                "description": (
                    "Know your site: fire exits are marked with green signs; the assembly point "
                    "is shown on the wall chart by the staff entrance. First aid kits are in the "
                    "back office and behind the bar — check they are stocked at the start of each "
                    "shift. Report all accidents and near-misses to your manager immediately and "
                    "record them in the accident book, no matter how minor."
                ),
                "requires_acknowledgement": True,
            },
            {
                "title": "Till & POS Training",
                "description": (
                    "Log in with your personal PIN — never share it. Ring items by tapping "
                    "categories or scanning barcodes; apply discounts only with manager approval. "
                    "For card payments, wait for the terminal to show Approved before handing "
                    "over the receipt. Count cash in the drawer at open and close; place floats "
                    "and takings in the safe following the daily cash-up sheet."
                ),
                "requires_acknowledgement": False,
            },
            {
                "title": "Menu Knowledge",
                "description": (
                    "Learn the core menu: hot drinks (espresso-based and filter), cold drinks, "
                    "bakery, and food. Know the 14 major allergens and which items contain them — "
                    "when in doubt, check the allergen matrix or ask a manager. Popular combos "
                    "include flat white with a croissant, and avocado toast with an americano. "
                    "Offer oat or whole milk as standard alternatives."
                ),
                "requires_acknowledgement": False,
            },
            {
                "title": "Customer Service Standards",
                "description": (
                    "Greet every customer within 30 seconds with a smile and eye contact. "
                    "Listen fully before suggesting additions — upsell naturally (e.g. pastry "
                    "with coffee) without pressure. If something goes wrong, apologise, fix it "
                    "quickly, and tell a manager the same day. Thank guests and invite them back."
                ),
                "requires_acknowledgement": False,
            },
        ],
    },
    {
        "title": "Barista Skills Level 1",
        "description": (
            "Foundation barista training: beans, grinding, espresso, milk, latte art, "
            "standard drink builds, and quality control."
        ),
        "category": TrainingProgramme.Category.BARISTA,
        "is_mandatory": False,
        "status": TrainingProgramme.Status.PUBLISHED,
        "estimated_duration_minutes": 90,
        "assign_locations": True,
        "steps": [
            {
                "title": "Coffee Bean Basics",
                "description": (
                    "Understand origin (country/region), processing (washed vs natural), and "
                    "roast level (light to dark). Store beans in airtight containers away from "
                    "heat, light, and strong odours; use within two weeks of opening. Our house "
                    "blend is medium roast — note tasting notes on the bag for service conversations."
                ),
            },
            {
                "title": "Grinding & Dosing",
                "description": (
                    "Grind size must match brew method: fine for espresso, coarser for filter. "
                    "Dose 18 g into a clean, dry basket; distribute evenly and tamp level with "
                    "consistent pressure. Weigh every few shots during dial-in — target 18 g in, "
                    "36 g out in 28–30 seconds for a double."
                ),
            },
            {
                "title": "Pulling Espresso Shots",
                "description": (
                    "Purge the group head, lock the portafilter firmly, and start immediately. "
                    "Watch for even flow and honey-coloured crema. Sour = grind finer or increase "
                    "yield; bitter = coarser or shorter yield. Flush and wipe baskets between drinks."
                ),
            },
            {
                "title": "Milk Steaming",
                "description": (
                    "Use cold, fresh milk in a clean jug. Stretch briefly at the start (paper-tearing "
                    "sound), then bury the wand to spin a whirlpool until 60–65 °C on the thermometer. "
                    "Texture should be glossy microfoam, not large bubbles. Wipe and purge the steam wand "
                    "after every use."
                ),
            },
            {
                "title": "Latte Art Fundamentals",
                "description": (
                    "Pour from height to mix, then lower the jug and wiggle for patterns. Start with "
                    "a heart: central pour, lift through the middle. Rosetta: side-to-side wiggle while "
                    "moving forward. Tulip: stack three blobs and pull through. Practice on off-peak "
                    "shifts with manager approval."
                ),
            },
            {
                "title": "Drink Recipes",
                "description": (
                    "Flat white: double shot, 6 oz milk, thin foam. Latte: double, 8 oz, light foam. "
                    "Cappuccino: double, equal parts espresso, steamed milk, foam. Americano: double "
                    "over hot water to 8 oz. Mocha: double, chocolate, steamed milk, whip optional — "
                    "follow the spec card for syrup pumps."
                ),
            },
            {
                "title": "Quality Control",
                "description": (
                    "Taste espresso and milk drinks at least once per dial-in. Adjust grind or dose "
                    "in small steps and log changes on the dial-in sheet. Check cup weight, temperature, "
                    "and presentation before service. If quality drops mid-shift, flush, re-dial, and "
                    "ask a senior barista to verify."
                ),
            },
        ],
    },
    {
        "title": "Food Safety & Hygiene",
        "description": (
            "Mandatory food hygiene training aligned with UK standards — handwashing, temperatures, "
            "allergens, cleaning, and stock rotation."
        ),
        "category": TrainingProgramme.Category.FOOD_SAFETY,
        "is_mandatory": True,
        "status": TrainingProgramme.Status.PUBLISHED,
        "estimated_duration_minutes": 45,
        "assign_locations": True,
        "steps": [
            {
                "title": "Handwashing Procedure",
                "description": (
                    "Wash hands before starting work, after breaks, toilet visits, handling raw food, "
                    "bins, or money, and whenever they look dirty. Use warm water, soap, 20 seconds "
                    "scrub including nails and wrists, rinse, and dry with disposable towels. "
                    "Hand sanitiser is not a substitute for proper washing."
                ),
                "requires_acknowledgement": True,
            },
            {
                "title": "Temperature Control",
                "description": (
                    "Fridges must stay at 5 °C or below — log at open, midday, and close. Hot holding "
                    "for display food must be 63 °C or above. The danger zone is 5–63 °C; minimise "
                    "time food spends there. Calibrate probes weekly and report any unit that fails "
                    "a check immediately."
                ),
            },
            {
                "title": "Allergen Management",
                "description": (
                    "Know the 14 allergens: celery, gluten, crustaceans, eggs, fish, lupin, milk, "
                    "molluscs, mustard, nuts, peanuts, sesame, soy, sulphites. Prevent cross-contact "
                    "with separate utensils and surfaces where needed. Always tell customers to check "
                    "the allergen matrix if they declare an allergy — never guess."
                ),
                "requires_acknowledgement": True,
            },
            {
                "title": "Cleaning Schedules",
                "description": (
                    "Daily: work surfaces, equipment touchpoints, toilets, and floor hotspots. "
                    "Weekly: fridges inside, shelving, and deep clean of coffee equipment areas. "
                    "Monthly: behind units, vents, and grease traps per the site checklist. Sign off "
                    "each task on the cleaning log — if you run out of a chemical, tell the manager."
                ),
            },
            {
                "title": "Date Checking & Stock Rotation",
                "description": (
                    "Use FIFO: oldest stock to the front. Use-by dates must not be exceeded — dispose "
                    "safely if past. Best-before is quality, not safety, but follow site policy for "
                    "bakery and dry goods. Record date checks in the app; escalate expired or "
                    "damaged stock to a manager before service."
                ),
                "requires_acknowledgement": True,
            },
        ],
    },
    {
        "title": "Closing Procedure",
        "description": (
            "End-of-day checklist for cash, kitchen, and front of house — draft programme for review."
        ),
        "category": TrainingProgramme.Category.CLOSING,
        "is_mandatory": False,
        "status": TrainingProgramme.Status.DRAFT,
        "estimated_duration_minutes": 20,
        "assign_locations": False,
        "steps": [
            {
                "title": "Cash Up",
                "description": (
                    "Count the till drawer and reconcile card totals with the POS Z-report. Record "
                    "figures on the daily sheet and bag cash for the safe. Note any discrepancies "
                    "over £5 to the manager on duty before leaving site."
                ),
            },
            {
                "title": "Kitchen Close Down",
                "description": (
                    "Switch off equipment per the shutdown checklist, cover and label all chilled food, "
                    "wipe prep surfaces, and empty sanitiser buckets. Take rubbish to the external bin "
                    "and ensure fridges are closed and doors sealed."
                ),
            },
            {
                "title": "Front of House",
                "description": (
                    "Wipe tables and counters, restock napkins and condiments, empty customer bins, "
                    "and set chairs for the cleaner. Turn off display lights except security lighting, "
                    "set the alarm, and lock all doors."
                ),
            },
        ],
    },
]


class Command(BaseCommand):
    help = "Seed training programmes, enrolments, and comments for ACFE Coffee"

    def add_arguments(self, parser):
        parser.add_argument(
            "--org",
            default="acfe-coffee",
            help="Organisation slug (default: acfe-coffee)",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Delete existing training data for this organisation before seeding",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        try:
            org = Organisation.objects.get(slug=options["org"])
        except Organisation.DoesNotExist:
            self.stderr.write(
                self.style.ERROR(f"Organisation '{options['org']}' not found.")
            )
            return

        if options["force"]:
            clear_training_for_org(org)
            self.stdout.write(
                self.style.WARNING(f"Cleared existing training data for {org.name}.")
            )

        if TrainingProgramme.objects.filter(organisation=org).exists():
            self.stderr.write(
                self.style.WARNING(
                    f"Training data already exists for {org.name}. "
                    "Run with --force to replace it."
                )
            )
            return

        locations = list(Location.objects.filter(organisation=org).order_by("slug"))
        if len(locations) < 2:
            self.stderr.write(
                self.style.ERROR(
                    "Expected at least two locations for this organisation. "
                    "Run seed_data first."
                )
            )
            return

        creator = User.objects.filter(
            organisation=org, username="sarah.cm.union"
        ).first()
        if not creator:
            creator = User.objects.filter(organisation=org).first()

        programmes: dict[str, TrainingProgramme] = {}
        step_count = 0

        for spec in PROGRAMME_SPECS:
            status = spec["status"]
            programme = TrainingProgramme.objects.create(
                organisation=org,
                title=spec["title"],
                description=spec["description"],
                category=spec["category"],
                is_mandatory=spec["is_mandatory"],
                status=status,
                estimated_duration_minutes=spec["estimated_duration_minutes"],
                created_by=creator,
                published_at=timezone.now()
                if status == TrainingProgramme.Status.PUBLISHED
                else None,
            )
            if spec.get("assign_locations"):
                programme.locations.set(locations)

            programmes[spec["title"]] = programme

            for order, step_spec in enumerate(spec["steps"], start=1):
                TrainingStep.objects.create(
                    programme=programme,
                    order=order,
                    title=step_spec["title"],
                    description=step_spec["description"],
                    requires_acknowledgement=step_spec.get(
                        "requires_acknowledgement", False
                    ),
                )
                step_count += 1

        onboarding = programmes["New Starter Onboarding"]
        barista = programmes["Barista Skills Level 1"]
        food_safety = programmes["Food Safety & Hygiene"]

        users_by_username = {
            u.username: u
            for u in User.objects.filter(organisation=org)
        }

        def get_user(username: str) -> User:
            user = users_by_username.get(username)
            if not user:
                raise ValueError(f"Expected user '{username}' — run seed_data first.")
            return user

        emma = get_user("emma.staff.union")
        liam = get_user("liam.staff.beach")
        sarah = get_user("sarah.cm.union")

        location_by_slug = {loc.slug: loc for loc in locations}
        union_st = location_by_slug.get("aberdeen-union-st", locations[0])
        beach = location_by_slug.get("aberdeen-beach", locations[-1])

        enrolment_count = 0
        completion_count = 0

        for user, location in _staff_and_cm_assignments(org):
            enrolment, _ = TrainingEnrolment.objects.get_or_create(
                programme=onboarding,
                user=user,
                location=location,
                defaults={"status": TrainingEnrolment.Status.NOT_STARTED},
            )
            enrolment_count += 1

        emma_onboarding = TrainingEnrolment.objects.get(
            programme=onboarding, user=emma, location=union_st
        )
        completion_count += _complete_steps(emma_onboarding, 5)

        liam_onboarding = TrainingEnrolment.objects.get(
            programme=onboarding, user=liam, location=beach
        )
        completion_count += _complete_steps(liam_onboarding, 3)

        barista_enrolment, _ = TrainingEnrolment.objects.get_or_create(
            programme=barista,
            user=emma,
            location=union_st,
            defaults={"status": TrainingEnrolment.Status.NOT_STARTED},
        )
        enrolment_count += 1
        completion_count += _complete_steps(barista_enrolment, 4)

        allergen_step = food_safety.steps.get(order=3)

        TrainingComment.objects.create(
            programme=barista,
            user=emma,
            body=(
                "For the house blend on the Mythos grinder — should we be at 14 or 15 "
                "on the dial for a double during busy periods? Shots have been running fast."
            ),
        )
        TrainingComment.objects.create(
            programme=barista,
            user=sarah,
            body=(
                "Start at 14.5 and adjust in quarter turns — if you're under 28 seconds, "
                "go slightly finer. Busy service usually needs a touch finer as the grinder "
                "heats up. Log any change on the dial-in sheet."
            ),
        )
        TrainingComment.objects.create(
            programme=food_safety,
            user=liam,
            step=allergen_step,
            body=(
                "The printed allergen cards behind the till look faded at Beach — can we "
                "get replacements before the weekend rush?"
            ),
        )

        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(
                f"Created {len(programmes)} programmes, {step_count} steps, "
                f"{enrolment_count} enrolments, {completion_count} completions"
            )
        )
