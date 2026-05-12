"""
Tests for custom project template CRUD with filter fields (Features 12–13).

Covers:
- Creating a custom project template with source_id and trip-context filter fields
- Partial updates to filter fields without clobbering unrelated fields
- Default filter values when fields are omitted
- Delete removes the template
"""


# ---------------------------------------------------------------------------
# POST /api/projects/templates
# ---------------------------------------------------------------------------

class TestCreateProjectTemplate:
    def test_create_stores_filter_metadata(self, client):
        r = client.post("/api/projects/templates", json={
            "name": "Camping Planner Copy",
            "icon": "🏕️",
            "description": "Copied from built-in Camping Trip template",
            "color": "green",
            "source_id": "trip_camping",
            "filter_trip_type": "camping",
            "filter_destination": "domestic",
            "filter_length": "weeklong",
        })
        assert r.status_code == 201
        d = r.json()
        assert d["source_id"] == "trip_camping"
        assert d["filter_trip_type"] == "camping"
        assert d["filter_destination"] == "domestic"
        assert d["filter_length"] == "weeklong"

    def test_filter_fields_default_to_any(self, client):
        r = client.post("/api/projects/templates", json={"name": "Plain Template"})
        assert r.status_code == 201
        d = r.json()
        assert d["filter_trip_type"] == "any"
        assert d["filter_destination"] == "any"
        assert d["filter_length"] == "any"
        assert d["source_id"] is None

    def test_create_appears_in_list(self, client):
        client.post("/api/projects/templates", json={"name": "ListTest"})
        r = client.get("/api/projects/templates")
        assert r.status_code == 200
        names = [t["name"] for t in r.json()["items"]]
        assert "ListTest" in names

    def test_source_id_none_when_not_copied(self, client):
        r = client.post("/api/projects/templates", json={"name": "From Scratch"})
        assert r.json()["source_id"] is None


# ---------------------------------------------------------------------------
# PATCH /api/projects/templates/{id}
# ---------------------------------------------------------------------------

class TestUpdateProjectTemplate:
    def _make(self, client, **kwargs):
        return client.post("/api/projects/templates", json={"name": "Base", **kwargs}).json()

    def test_update_filter_trip_type(self, client):
        t = self._make(client, filter_trip_type="general")
        r = client.patch(f"/api/projects/templates/{t['id']}", json={"filter_trip_type": "camping"})
        assert r.status_code == 200
        assert r.json()["filter_trip_type"] == "camping"

    def test_update_destination_filter(self, client):
        t = self._make(client)
        r = client.patch(f"/api/projects/templates/{t['id']}", json={"filter_destination": "international"})
        assert r.json()["filter_destination"] == "international"

    def test_update_length_filter(self, client):
        t = self._make(client)
        r = client.patch(f"/api/projects/templates/{t['id']}", json={"filter_length": "extended"})
        assert r.json()["filter_length"] == "extended"

    def test_partial_update_does_not_clobber_other_fields(self, client):
        t = self._make(client, filter_trip_type="beach", filter_length="weeklong", source_id="trip_beach")
        client.patch(f"/api/projects/templates/{t['id']}", json={"filter_destination": "domestic"})
        r = client.get(f"/api/projects/templates/{t['id']}")
        d = r.json()
        # Patching one field must not reset the others
        assert d["filter_trip_type"] == "beach"
        assert d["filter_length"] == "weeklong"
        assert d["source_id"] == "trip_beach"
        assert d["filter_destination"] == "domestic"

    def test_source_id_preserved_through_name_edit(self, client):
        t = self._make(client, source_id="trip_business")
        client.patch(f"/api/projects/templates/{t['id']}", json={"name": "Business v2"})
        r = client.get(f"/api/projects/templates/{t['id']}")
        assert r.json()["source_id"] == "trip_business"

    def test_update_missing_returns_404(self, client):
        assert client.patch("/api/projects/templates/9999", json={"name": "x"}).status_code == 404


# ---------------------------------------------------------------------------
# DELETE /api/projects/templates/{id}
# ---------------------------------------------------------------------------

class TestDeleteProjectTemplate:
    def test_delete_returns_204(self, client):
        t = client.post("/api/projects/templates", json={"name": "ToDelete"}).json()
        assert client.delete(f"/api/projects/templates/{t['id']}").status_code == 204

    def test_deleted_template_not_in_list(self, client):
        t = client.post("/api/projects/templates", json={"name": "Gone"}).json()
        client.delete(f"/api/projects/templates/{t['id']}")
        names = [x["name"] for x in client.get("/api/projects/templates").json()["items"]]
        assert "Gone" not in names


# ---------------------------------------------------------------------------
# GET /api/projects/templates/{id}
# ---------------------------------------------------------------------------

class TestGetProjectTemplate:
    def test_get_by_id(self, client):
        t = client.post("/api/projects/templates", json={
            "name": "Fetch Me",
            "source_id": "trip_1month",
        }).json()
        r = client.get(f"/api/projects/templates/{t['id']}")
        assert r.status_code == 200
        d = r.json()
        assert d["name"] == "Fetch Me"
        assert d["source_id"] == "trip_1month"

    def test_get_missing_returns_404(self, client):
        assert client.get("/api/projects/templates/9999").status_code == 404
