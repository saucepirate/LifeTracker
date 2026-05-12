"""
Tests for the trip packing system.

Covers:
- Applying an inline preset in single-list mode
- Creating multiple packing lists (Shared + personal) via per_list mode
- Gender routing: men's lists get all_travelers + men items only;
  women's lists get all_travelers + women items only
- Explicit traveler_names / traveler_genders override attendee-derived names
- Merge vs replace behaviour
- Applying a saved custom template via /apply-template
- Packing data response structure (lists, categories, items, progress counts)
"""

import pytest
from .conftest import SIMPLE_PRESET_CATEGORIES

# Minimal preset with all four owner_type values for routing tests
GENDERED_CATEGORIES = [
    {
        "name": "Clothing",
        "items": [
            {"name": "T-shirt",      "quantity": 3, "owner_type": "all_travelers"},
            {"name": "Dress shirt",  "quantity": 2, "owner_type": "men"},
            {"name": "Blouse",       "quantity": 2, "owner_type": "women"},
        ],
    },
    {
        "name": "Shared Gear",
        "items": [
            {"name": "First aid kit", "quantity": 1, "owner_type": "shared"},
            {"name": "Sunscreen",     "quantity": 1, "owner_type": "shared"},
        ],
    },
]


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _apply(client, trip_id, categories, *, mode="single", merge=True,
           list_id=None, traveler_names=None, traveler_genders=None):
    body = {"categories": categories, "merge": merge, "mode": mode}
    if list_id is not None:
        body["list_id"] = list_id
    if traveler_names is not None:
        body["traveler_names"] = traveler_names
    if traveler_genders is not None:
        body["traveler_genders"] = traveler_genders
    r = client.post(f"/api/trips/{trip_id}/packing/apply-inline-preset", json=body)
    assert r.status_code == 200, r.text
    return r.json()


# ---------------------------------------------------------------------------
# Single-list mode
# ---------------------------------------------------------------------------

class TestApplyInlinePresetSingleMode:
    def test_creates_default_list_if_none_exists(self, client, trip):
        data = _apply(client, trip["id"], SIMPLE_PRESET_CATEGORIES)
        assert len(data["lists"]) == 1
        assert data["lists"][0]["name"] == "Packing List"

    def test_all_categories_added_to_single_list(self, client, trip):
        data = _apply(client, trip["id"], SIMPLE_PRESET_CATEGORIES)
        cat_names = [c["name"] for c in data["lists"][0]["categories"]]
        assert "Shelter" in cat_names
        assert "Essentials" in cat_names

    def test_items_added_with_correct_owner_type(self, client, trip):
        data = _apply(client, trip["id"], SIMPLE_PRESET_CATEGORIES)
        shelter = next(c for c in data["lists"][0]["categories"] if c["name"] == "Shelter")
        item_map = {i["name"]: i["owner_type"] for i in shelter["items"]}
        assert item_map["Tent"] == "shared"
        assert item_map["Sleeping bag"] == "all_travelers"

    def test_merge_adds_to_existing_categories(self, client, trip):
        _apply(client, trip["id"], [{"name": "Gear", "items": [
            {"name": "Jacket", "quantity": 1, "owner_type": "all_travelers"}
        ]}])
        data = _apply(client, trip["id"], [{"name": "Gear", "items": [
            {"name": "Trousers", "quantity": 1, "owner_type": "all_travelers"}
        ]}], merge=True)
        gear = next(c for c in data["lists"][0]["categories"] if c["name"] == "Gear")
        names = [i["name"] for i in gear["items"]]
        assert "Jacket" in names
        assert "Trousers" in names

    def test_replace_clears_list_before_applying(self, client, trip):
        _apply(client, trip["id"], [{"name": "Old Category", "items": [
            {"name": "Old Item", "quantity": 1, "owner_type": "all_travelers"}
        ]}])
        data = _apply(client, trip["id"], [{"name": "New Category", "items": [
            {"name": "New Item", "quantity": 1, "owner_type": "all_travelers"}
        ]}], merge=False)
        cat_names = [c["name"] for c in data["lists"][0]["categories"]]
        assert "New Category" in cat_names
        assert "Old Category" not in cat_names

    def test_empty_category_name_skipped(self, client, trip):
        data = _apply(client, trip["id"], [
            {"name": "", "items": [{"name": "Phantom", "quantity": 1, "owner_type": "shared"}]},
            {"name": "Real", "items": [{"name": "Item", "quantity": 1, "owner_type": "all_travelers"}]},
        ])
        cat_names = [c["name"] for c in data["lists"][0]["categories"]]
        assert "Real" in cat_names
        assert "" not in cat_names


# ---------------------------------------------------------------------------
# Per-list mode — multiple lists from one preset
# ---------------------------------------------------------------------------

class TestApplyInlinePresetPerListMode:
    def test_creates_shared_and_personal_lists(self, client, trip):
        data = _apply(client, trip["id"], GENDERED_CATEGORIES, mode="per_list")
        list_names = [l["name"] for l in data["lists"]]
        assert "Shared" in list_names
        assert "Personal" in list_names

    def test_shared_list_contains_shared_items_only(self, client, trip):
        data = _apply(client, trip["id"], GENDERED_CATEGORIES, mode="per_list")
        shared = next(l for l in data["lists"] if l["name"] == "Shared")
        all_items = [i for c in shared["categories"] for i in c["items"]]
        assert all(i["owner_type"] == "shared" for i in all_items)
        item_names = {i["name"] for i in all_items}
        assert "First aid kit" in item_names
        assert "Sunscreen" in item_names
        # Non-shared items must not appear on the Shared list
        assert "T-shirt" not in item_names

    def test_personal_list_contains_all_travelers_items(self, client, trip):
        data = _apply(client, trip["id"], GENDERED_CATEGORIES, mode="per_list")
        personal = next(l for l in data["lists"] if l["name"] == "Personal")
        all_items = [i for c in personal["categories"] for i in c["items"]]
        item_names = {i["name"] for i in all_items}
        assert "T-shirt" in item_names

    def test_explicit_traveler_names_create_named_lists(self, client, trip):
        data = _apply(client, trip["id"], GENDERED_CATEGORIES, mode="per_list",
                      traveler_names=["Alice", "Bob"],
                      traveler_genders=["women", "men"])
        list_names = [l["name"] for l in data["lists"]]
        assert "Shared" in list_names
        assert "Alice" in list_names
        assert "Bob" in list_names

    def test_men_list_excludes_women_items(self, client, trip):
        data = _apply(client, trip["id"], GENDERED_CATEGORIES, mode="per_list",
                      traveler_names=["Bob"],
                      traveler_genders=["men"])
        bob = next(l for l in data["lists"] if l["name"] == "Bob")
        all_items = [i for c in bob["categories"] for i in c["items"]]
        item_names = {i["name"] for i in all_items}
        assert "T-shirt" in item_names
        assert "Dress shirt" in item_names
        assert "Blouse" not in item_names

    def test_women_list_excludes_men_items(self, client, trip):
        data = _apply(client, trip["id"], GENDERED_CATEGORIES, mode="per_list",
                      traveler_names=["Alice"],
                      traveler_genders=["women"])
        alice = next(l for l in data["lists"] if l["name"] == "Alice")
        all_items = [i for c in alice["categories"] for i in c["items"]]
        item_names = {i["name"] for i in all_items}
        assert "T-shirt" in item_names
        assert "Blouse" in item_names
        assert "Dress shirt" not in item_names

    def test_neutral_gender_traveler_gets_all_gendered_items(self, client, trip):
        data = _apply(client, trip["id"], GENDERED_CATEGORIES, mode="per_list",
                      traveler_names=["Casey"],
                      traveler_genders=["any"])
        casey = next(l for l in data["lists"] if l["name"] == "Casey")
        all_items = [i for c in casey["categories"] for i in c["items"]]
        item_names = {i["name"] for i in all_items}
        assert "T-shirt" in item_names
        assert "Dress shirt" in item_names
        assert "Blouse" in item_names


# ---------------------------------------------------------------------------
# Packing data response structure
# ---------------------------------------------------------------------------

class TestPackingDataStructure:
    def test_get_empty_packing_returns_empty_lists(self, client, trip):
        r = client.get(f"/api/trips/{trip['id']}/packing")
        assert r.status_code == 200
        data = r.json()
        assert "lists" in data
        assert data["total"] == 0
        assert data["checked"] == 0
        assert data["pct"] == 0

    def test_progress_counters_reflect_checked_items(self, client, trip):
        data = _apply(client, trip["id"], [{"name": "Gear", "items": [
            {"name": "Item A", "quantity": 1, "owner_type": "all_travelers"},
            {"name": "Item B", "quantity": 1, "owner_type": "all_travelers"},
        ]}])
        assert data["total"] == 2
        assert data["checked"] == 0

        gear_cat = next(c for c in data["lists"][0]["categories"] if c["name"] == "Gear")
        item_id = gear_cat["items"][0]["id"]
        client.put(f"/api/trips/{trip['id']}/packing/items/{item_id}", json={"checked": 1})
        r = client.get(f"/api/trips/{trip['id']}/packing")
        assert r.json()["checked"] == 1
        assert r.json()["pct"] == 50

    def test_multiple_lists_shown_in_response(self, client, trip):
        # Create two lists manually
        client.post(f"/api/trips/{trip['id']}/packing/lists", json={"name": "Shared", "list_type": "shared"})
        client.post(f"/api/trips/{trip['id']}/packing/lists", json={"name": "Personal", "list_type": "personal"})
        r = client.get(f"/api/trips/{trip['id']}/packing")
        list_names = [l["name"] for l in r.json()["lists"]]
        assert "Shared" in list_names
        assert "Personal" in list_names

    def test_delete_packing_list(self, client, trip):
        r = client.post(f"/api/trips/{trip['id']}/packing/lists",
                        json={"name": "Temp", "list_type": "personal"})
        lst_id = r.json()["lists"][-1]["id"]
        del_r = client.delete(f"/api/trips/{trip['id']}/packing/lists/{lst_id}")
        assert del_r.status_code == 204


# ---------------------------------------------------------------------------
# Apply saved template (apply-template endpoint)
# ---------------------------------------------------------------------------

class TestApplySavedTemplate:
    def _create_template_with_items(self, client):
        t = client.post("/api/packing-templates/from-preset", json={
            "name": "Test Template",
            "icon": "🧳",
            "categories": [
                {
                    "name": "Clothes",
                    "items": [
                        {"name": "Socks",   "quantity": 3, "owner_type": "all_travelers"},
                        {"name": "Towel",   "quantity": 1, "owner_type": "shared"},
                    ],
                }
            ],
        }).json()
        return t

    def test_apply_template_adds_items(self, client, trip):
        t = self._create_template_with_items(client)
        r = client.post(f"/api/trips/{trip['id']}/packing/apply-template", json={
            "template_id": t["id"],
            "merge": True,
        })
        assert r.status_code == 200
        cats = r.json()["lists"][0]["categories"]
        assert any(c["name"] == "Clothes" for c in cats)

    def test_apply_template_missing_template_returns_404(self, client, trip):
        r = client.post(f"/api/trips/{trip['id']}/packing/apply-template", json={
            "template_id": 9999,
            "merge": True,
        })
        assert r.status_code == 404

    def test_apply_template_missing_trip_returns_404(self, client):
        t = client.post("/api/packing-templates", json={"name": "T"}).json()
        r = client.post("/api/trips/9999/packing/apply-template", json={
            "template_id": t["id"],
            "merge": True,
        })
        assert r.status_code == 404
