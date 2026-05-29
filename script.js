document.addEventListener('DOMContentLoaded', async () => {
    const grid = document.getElementById('grid-fixture');
    
    try {
        console.log("Intentando cargar matches.json...");
        const response = await fetch('./matches.json');
        
        if (!response.ok) throw new Error('No se pudo leer el archivo JSON');
        
        const matches = await response.json();
        
        // Renderizado simple para probar que funciona
        grid.innerHTML = matches.map(m => `
            <div style="background: #1c1c1e; margin: 10px; padding: 15px; border-radius: 8px;">
                <p>${m.homeTeam.name} vs ${m.awayTeam.name}</p>
            </div>
        `).join('');
        
        console.log("¡Éxito! Datos cargados.");
        
    } catch (error) {
        grid.innerHTML = `<p style="color: red;">Error: ${error.message}. Asegúrate de que matches.json está en la carpeta raíz.</p>`;
        console.error(error);
    }
});