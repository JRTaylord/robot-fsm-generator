mermaid.initialize({
    startOnLoad: true,
    theme: 'default',
    securityLevel: 'loose',
    flowchart: {
        useMaxWidth: false
    }
});

let currentZoom = 1;
const container = document.getElementById('diagram-container');
const zoomIndicator = document.getElementById('zoom-indicator');

function showZoomIndicator() {
    zoomIndicator.textContent = Math.round(currentZoom * 100) + '%';
    zoomIndicator.style.display = 'block';
    setTimeout(() => {
        zoomIndicator.style.display = 'none';
    }, 1000);
}

function zoomIn() {
    currentZoom = Math.min(3, currentZoom + 0.1);
    applyZoom();
}

function zoomOut() {
    currentZoom = Math.max(0.3, currentZoom - 0.1);
    applyZoom();
}

function resetZoom() {
    currentZoom = 1;
    applyZoom();
}

function fitToScreen() {
    const svg = container.querySelector('svg');
    if (svg) {
        const containerWidth = container.clientWidth;
        const svgWidth = svg.getBBox().width;
        currentZoom = (containerWidth - 60) / svgWidth;
        applyZoom();
    }
}

function applyZoom() {
    container.style.transform = `scale(${currentZoom})`;
    container.style.transformOrigin = 'top left';
    showZoomIndicator();
}

function downloadSVG() {
    const svg = container.querySelector('svg');
    if (svg) {
        const serializer = new XMLSerializer();
        const svgString = serializer.serializeToString(svg);
        const blob = new Blob([svgString], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'state-machine.svg';
        a.click();
        URL.revokeObjectURL(url);
    }
}

function downloadPNG() {
    const svg = container.querySelector('svg');
    if (svg) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const svgData = new XMLSerializer().serializeToString(svg);
        const img = new Image();

        img.onload = function() {
            canvas.width = img.width * 2;
            canvas.height = img.height * 2;
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            canvas.toBlob(function(blob) {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'state-machine.png';
                a.click();
                URL.revokeObjectURL(url);
            });
        };

        img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
    }
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
        if (e.key === '=') {
            e.preventDefault();
            zoomIn();
        } else if (e.key === '-') {
            e.preventDefault();
            zoomOut();
        } else if (e.key === '0') {
            e.preventDefault();
            resetZoom();
        }
    }
});

// Auto-fit on load
window.addEventListener('load', () => {
    setTimeout(fitToScreen, 500);
});
