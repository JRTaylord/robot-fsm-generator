mermaid.initialize({
  startOnLoad: true,
  theme: "default",
  securityLevel: "loose",
  flowchart: {
    useMaxWidth: false,
  },
});

let panZoomInstance = null;

// Initialize svg-pan-zoom after mermaid renders
window.addEventListener("load", () => {
  setTimeout(() => {
    const svg = document.querySelector("#diagram-container svg");
    console.log(svg);
    if (svg && typeof svgPanZoom !== "undefined") {
      panZoomInstance = svgPanZoom(svg, {
        zoomEnabled: true,
        controlIconsEnabled: true,
        fit: true,
        center: true,
        minZoom: 0.3,
        maxZoom: 10,
        zoomScaleSensitivity: 0.3,
        dblClickZoomEnabled: true,
        mouseWheelZoomEnabled: true,
        preventMouseEventsDefault: true,
        contain: false,
      });
    }
  }, 500);
});

function downloadSVG() {
  const svg = document.querySelector("#diagram-container svg");
  if (svg) {
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svg);
    const blob = new Blob([svgString], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "state-machine.svg";
    a.click();
    URL.revokeObjectURL(url);
  }
}

function downloadPNG() {
  const svg = document.querySelector("#diagram-container svg");
  if (svg) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const svgData = new XMLSerializer().serializeToString(svg);
    const img = new Image();

    img.onload = function () {
      canvas.width = img.width * 2;
      canvas.height = img.height * 2;
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(function (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "state-machine.png";
        a.click();
        URL.revokeObjectURL(url);
      });
    };

    img.src =
      "data:image/svg+xml;base64," +
      btoa(unescape(encodeURIComponent(svgData)));
  }
}
