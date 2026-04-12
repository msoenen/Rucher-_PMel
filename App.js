const JSON_URL = "VOTRE_URL_APPS_SCRIPT?action=status";

async function loadData() {
  const el = document.getElementById("status");

  try {
    const res = await fetch(JSON_URL);
    const data = await res.json();
    el.textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    el.textContent = "Erreur de chargement";
    console.error(err);
  }
}

loadData();
