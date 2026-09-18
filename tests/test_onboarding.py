def test_onboarding_completion_is_saved(client, app):
    settings = client.get("/api/settings").json()
    assert settings["onboarding_completed"] is False
    assert settings["appearance"] == "system"
    response = client.put("/api/settings", json={"onboarding_completed": True})
    assert response.status_code == 200
    assert response.json()["onboarding_completed"] is True
    assert app.state.store.settings()["onboarding_completed"] is True
    assert client.get("/welcome").status_code == 200
