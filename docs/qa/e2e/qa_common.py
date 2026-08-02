# -*- coding: utf-8 -*-
"""Helpers comune QA Swypik. Read-only pe cod; creeaza doar date de test *@swypik.test."""
import os, subprocess, time

BASE = "http://127.0.0.1:3005"
QA = os.path.dirname(os.path.abspath(__file__))
EVID = os.path.join(QA, "..", "evidence")
PASSWORD = "TestParola123!"

def sql(query):
    """SELECT-only prin docker exec (read-only enforcement in caller discipline)."""
    r = subprocess.run(
        ["wsl", "-d", "swypik", "-e", "docker", "exec", "swypik-prod-postgres-1",
         "psql", "-U", "swypik", "-d", "swypik_prod", "-t", "-A", "-F", "|", "-c", query],
        capture_output=True, text=True, timeout=30)
    return (r.stdout or "").strip(), (r.stderr or "").strip()

def shot(page, persona, name):
    d = os.path.join(EVID, persona)
    os.makedirs(d, exist_ok=True)
    path = os.path.join(d, name + ".png")
    page.screenshot(path=path)
    return path

def signup(page, email, first, last, username, phone="+40712345678"):
    """Wizard signup 4 pasi: (1) email+parola, (2) nume, (3) username, (4) telefon/final."""
    page.goto(BASE + "/auth/signup", wait_until="networkidle", timeout=30000)
    page.fill('input[type="email"]', email)
    page.fill('input[type="password"]', PASSWORD)
    page.get_by_role("button", name="Continuă").click()
    page.wait_for_timeout(2000)
    page.fill('input[autocomplete="given-name"]', first)
    page.fill('input[autocomplete="family-name"]', last)
    page.get_by_role("button", name="Continuă").click()
    page.wait_for_timeout(2000)
    # pas 3: username (daca exista)
    for _ in range(2):
        inputs = page.locator("input").all()
        filled = False
        for i in inputs:
            t = (i.get_attribute("type") or "text")
            ac = i.get_attribute("autocomplete") or ""
            if t == "tel" or ac == "tel":
                i.fill(phone); filled = True
            elif t == "text" and "name" not in ac:
                i.fill(username); filled = True
        btn = page.get_by_role("button", name="Continuă")
        if btn.count() == 0:
            btn = page.locator("button[type=submit]").first
        try:
            btn.first.click()
        except Exception:
            page.keyboard.press("Enter")
        page.wait_for_timeout(2500)
        if "/auth" not in page.url:
            break
    page.wait_for_timeout(2000)
    return "/auth" not in page.url

def login(page, email, password=PASSWORD):
    page.goto(BASE + "/auth/login", wait_until="networkidle", timeout=30000)
    page.fill('input[type="email"]', email)
    page.keyboard.press("Enter")
    page.wait_for_timeout(1200)
    pw = page.locator('input[autocomplete="current-password"]').first
    pw.wait_for(timeout=10000)
    pw.fill(password)
    page.keyboard.press("Enter")
    page.wait_for_timeout(3000)
    return "auth" not in page.url

class Journal:
    def __init__(self, persona):
        self.persona = persona
        self.rows = []
    def log(self, step, status, note="", shot_name=""):
        self.rows.append((step, status, note, shot_name))
        print(f"[{status}] {self.persona} :: {step} — {note}")
    def dump(self):
        import json
        p = os.path.join(EVID, self.persona, "_journal.json")
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w", encoding="utf-8") as f:
            json.dump([{"step": s, "status": st, "note": n, "shot": sh} for s, st, n, sh in self.rows],
                      f, indent=2, ensure_ascii=False)
