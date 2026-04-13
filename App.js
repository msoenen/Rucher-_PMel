// Remplacez par votre URL Apps Script JSON
//const JSON_URL =  "https://script.google.com/macros/s/AKfycbwrduUomAgwEfmSvemSDp48cRHVhxGiSb56PORgfXSOpPh2Sl65MFra0HytSo4sZwjg/exec?action=status";
//const CHART_URL_BASE = "https://script.google.com/macros/s/AKfycbwrduUomAgwEfmSvemSDp48cRHVhxGiSb56PORgfXSOpPh2Sl65MFra0HytSo4sZwjg/exec";

function loadStatus(data) {
  console.log("Données reçues :", data);

  const output = document.getElementById("output");

  if (!data) {
    output.textContent = "Aucune donnée reçue";
    return;
  }

  if (data.error) {
    output.textContent = "Erreur API : " + data.error;
    return;
  }

  output.textContent = JSON.stringify(data, null, 2);
}

(function () {
  const script = document.createElement("script");
  script.src = "https://script.google.com/macros/s/AKfycbwrduUomAgwEfmSvemSDp48cRHVhxGiSb56PORgfXSOpPh2Sl65MFra0HytSo4sZwjg/exec?action=status";
  script.onerror = function () {
    document.getElementById("output").textContent =
      "Erreur de chargement du script Apps Script";
  };
  document.body.appendChild(script);
})();
