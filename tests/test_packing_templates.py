"""
Tests for packing template CRUD and the bulk create/replace endpoints.

Covers:
- Copying a built-in preset (source_id preserved, filter metadata stored)
- Editing a custom template's name, icon, and filter fields
- Bulk create via /from-preset (categories + items with owner_type)
- Replace via /{id}/replace (old categories cleared, new ones written)
- Delete removes the template
"""

import pytest
from .conftest import SIMPLE_PRESET_CATEGORIES


# ---------------------------------------------------------------------------
# POST /api/packing-templates  (simple create / "copy" of a built-in)
# ---------------------------------------------------------------------------

class TestCreateTemplate:
    def test_create_stores_filter_metadata(self, client):
        r = client.post("/api/packing-templates", json={
            "name": "My Camping Pack",
            "icon": "🏕️",
            "filter_trip_type": "camping",
            "filter_destination": "domestic",
            "filter_length": "weeklong",
            "source_id": "camping",
        })
        assert r.status_code == 201
        data = r.json()
        assert data["name"] == "My Camping Pack"
        assert data["icon"] == "🏕️"
        assert data["filter_trip_type"] == "camping"
        assert data["filter_destination"] == "domestic"
        assert data["filter_length"] == "weeklong"
        assert data["source_id"] == "camping"

    def test_create_defaults_filters_to_any(self, client):
        r = client.post("/api/packing-templates", json={"name": "Generic Pack"})
        assert r.status_code == 201
        data = r.json()
        assert data["filter_trip_type"] == "any"
        assert data["filter_destination"] == "any"
        assert data["filter_length"] == "any"
        assert data["source_id"] is None

    def test_create_appears_in_list(self, client):
        client.post("/api/packing-templates", json={"name": "Alpha"})
        client.post("/api/packing-templates", json={"name": "Beta"})
        r = client.get("/api/packing-templates")
        assert r.status_code == 200
        names = [t["name"] for t in r.json()["items"]]
        assert "Alpha" in names
        assert "Beta" in names

    def test_get_by_id(self, client):
        created = client.post("/api/packing-templates", json={"name": "FindMe"}).json()
        r = client.get(f"/api/packing-templates/{created['id']}")
        assert r.status_code == 200
        assert r.json()["id"] == created["id"]

    def test_get_missing_returns_404(self, client):
        assert client.get("/api/packing-templates/9999").status_code == 404


# ---------------------------------------------------------------------------
# PUT /api/packing-templates/{id}  (edit custom template)
# ---------------------------------------------------------------------------

class TestEditTemplate:
    def _make(self, client, **kwargs):
        return client.post("/api/packing-templates", json={"name": "Base", **kwargs}).json()

    def test_rename(self, client):
        t = self._make(client)
        r = client.put(f"/api/packing-templates/{t['id']}", json={"name": "Renamed"})
        assert r.status_code == 200
        assert r.json()["name"] == "Renamed"

    def test_update_filter_trip_type(self, client):
        t = self._make(client, filter_trip_type="any")
        r = client.put(f"/api/packing-templates/{t['id']}", json={"filter_trip_type": "beach"})
        assert r.json()["filter_trip_type"] == "beach"

    def test_update_all_filter_fields(self, client):
        t = self._make(client)
        r = client.put(f"/api/packing-templates/{t['id']}", json={
            "filter_trip_type": "business",
            "filter_destination": "international",
            "filter_length": "extended",
        })
        d = r.json()
        assert d["filter_trip_type"] == "business"
        assert d["filter_destination"] == "international"
        assert d["filter_length"] == "extended"

    def test_source_id_preserved_through_edit(self, client):
        t = self._make(client, source_id="hiking")
        r = client.put(f"/api/packing-templates/{t['id']}", json={"name": "Hiking v2"})
        assert r.json()["source_id"] == "hiking"

    def test_source_id_can_be_updated(self, client):
        t = self._make(client, source_id="weekend")
        r = client.put(f"/api/packing-templates/{t['id']}", json={"source_id": "beach"})
        assert r.json()["source_id"] == "beach"

    def test_edit_missing_returns_404(self, client):
        assert client.put("/api/packing-templates/9999", json={"name": "x"}).status_code == 404


# ---------------------------------------------------------------------------
# DELETE /api/packing-templates/{id}
# ---------------------------------------------------------------------------

class TestDeleteTemplate:
    def test_delete_returns_204(self, client):
        t = client.post("/api/packing-templates", json={"name": "ToDelete"}).json()
        assert client.delete(f"/api/packing-templates/{t['id']}").status_code == 204

    def test_deleted_template_not_in_list(self, client):
        t = client.post("/api/packing-templates", json={"name": "Gone"}).json()
        client.delete(f"/api/packing-templates/{t['id']}")
        names = [x["name"] for x in client.get("/api/packing-templates").json()["items"]]
        assert "Gone" not in names

    def test_delete_missing_returns_404(self, client):
        assert client.delete("/api/packing-templates/9999").status_code == 404


# ---------------------------------------------------------------------------
# POST /api/packing-templates/from-preset  (bulk create with categories/items)
# ---------------------------------------------------------------------------

class TestFromPreset:
    def _payload(self, **kwargs):
        return {
            "name": "My Camping Copy",
            "icon": "🏕️",
            "filter_trip_type": "camping",
            "filter_destination": "any",
            "filter_length": "any",
            "source_id": "camping",
            "categories": SIMPLE_PRESET_CATEGORIES,
            **kwargs,
        }

    def test_creates_template_with_categories(self, client):
        r = client.post("/api/packing-templates/from-preset", json=self._payload())
        assert r.status_code == 201
        data = r.json()
        assert data["source_id"] == "camping"
        assert len(data["categories"]) == 2
        assert data["categories"][0]["name"] == "Shelter"

    def test_items_preserve_owner_type(self, client):
        r = client.post("/api/packing-templates/from-preset", json=self._payload())
        shelter = r.json()["categories"][0]
        item_map = {i["name"]: i["owner_type"] for i in shelter["items"]}
        assert item_map["Tent"] == "shared"
        assert item_map["Sleeping bag"] == "all_travelers"
        assert item_map["Sports bra"] == "women"
        assert item_map["Grooming kit"] == "men"

    def test_filter_fields_stored(self, client):
        r = client.post("/api/packing-templates/from-preset", json=self._payload(
            filter_trip_type="business",
            filter_destination="international",
            filter_length="short",
        ))
        d = r.json()
        assert d["filter_trip_type"] == "business"
        assert d["filter_destination"] == "international"
        assert d["filter_length"] == "short"

    def test_empty_categories_list(self, client):
        r = client.post("/api/packing-templates/from-preset", json={
            "name": "Empty Template",
            "categories": [],
        })
        assert r.status_code == 201
        assert r.json()["categories"] == []


# ---------------------------------------------------------------------------
# PUT /api/packing-templates/{id}/replace  (full replace)
# ---------------------------------------------------------------------------

class TestReplaceTemplate:
    def test_replace_clears_old_categories(self, client):
        original = client.post("/api/packing-templates/from-preset", json={
            "name": "Old",
            "source_id": "weekend",
            "categories": SIMPLE_PRESET_CATEGORIES,
        }).json()
        tid = original["id"]

        r = client.put(f"/api/packing-templates/{tid}/replace", json={
            "name": "New Name",
            "icon": "🏖️",
            "filter_trip_type": "beach",
            "filter_destination": "any",
            "filter_length": "any",
            "source_id": "beach",
            "categories": [
                {
                    "name": "Beach Gear",
                    "items": [
                        {"name": "Sunscreen",    "quantity": 1, "owner_type": "shared"},
                        {"name": "Sunglasses",   "quantity": 1, "owner_type": "all_travelers"},
                    ],
                }
            ],
        })
        assert r.status_code == 200
        data = r.json()
        assert data["name"] == "New Name"
        assert data["source_id"] == "beach"
        assert len(data["categories"]) == 1
        assert data["categories"][0]["name"] == "Beach Gear"
        # Original "Shelter" category should be gone
        cat_names = [c["name"] for c in data["categories"]]
        assert "Shelter" not in cat_names

    def test_replace_missing_returns_404(self, client):
        r = client.put("/api/packing-templates/9999/replace", json={
            "name": "x", "categories": [],
        })
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# Category / item sub-resources
# ---------------------------------------------------------------------------

class TestTemplateCategoryItems:
    def _make_template(self, client):
        return client.post("/api/packing-templates", json={"name": "Base"}).json()

    def test_add_category(self, client):
        t = self._make_template(client)
        r = client.post(f"/api/packing-templates/{t['id']}/categories", json={"name": "Clothing"})
        assert r.status_code == 201
        cat_names = [c["name"] for c in r.json()["categories"]]
        assert "Clothing" in cat_names

    def test_add_item_to_category(self, client):
        t = self._make_template(client)
        updated = client.post(f"/api/packing-templates/{t['id']}/categories", json={"name": "Food"}).json()
        cat_id = updated["categories"][0]["id"]

        r = client.post(f"/api/packing-templates/{t['id']}/categories/{cat_id}/items", json={
            "name": "Trail mix",
            "quantity": 2,
            "owner_type": "shared",
        })
        assert r.status_code == 201
        items = r.json()["categories"][0]["items"]
        assert items[0]["name"] == "Trail mix"
        assert items[0]["owner_type"] == "shared"
        assert items[0]["quantity"] == 2

    def test_delete_category(self, client):
        t = self._make_template(client)
        updated = client.post(f"/api/packing-templates/{t['id']}/categories", json={"name": "Temp"}).json()
        cat_id = updated["categories"][0]["id"]

        client.delete(f"/api/packing-templates/{t['id']}/categories/{cat_id}")
        r = client.get(f"/api/packing-templates/{t['id']}")
        assert all(c["name"] != "Temp" for c in r.json()["categories"])
