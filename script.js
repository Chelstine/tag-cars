document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('designForm');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const generateBtn = document.getElementById('generateBtn');
    const resultSection = document.getElementById('resultSection');
    const imageGrid = document.getElementById('imageGrid');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // UI Updates
        generateBtn.classList.add('hidden');
        loadingIndicator.classList.remove('hidden');
        resultSection.classList.add('hidden');
        imageGrid.innerHTML = '';

        // Collect Form Data
        const formData = {
            vehicle_type: document.getElementById('vehicle_type').value,
            vehicle_category: document.getElementById('vehicle_category').value,
            vehicle_view: document.getElementById('vehicle_view').value,
            coverage_type: document.getElementById('coverage_type').value,
            coverage_zones: document.getElementById('coverage_zones').value,
            industry: document.getElementById('industry').value,
            brand_name: document.getElementById('brand_name').value,
            main_text: document.getElementById('main_text').value,
            key_info: document.getElementById('key_info').value,
            style: document.getElementById('style').value,
            primary_colors: document.getElementById('primary_colors').value,
            logo_instruction: document.getElementById('logo_instruction').value,
            constraints: document.getElementById('constraints').value
        };

        try {
            // Send to Backend
            const response = await fetch('/api/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Erreur lors de la génération');
            }

            // Display Results
            if (data.images && data.images.length > 0) {
                data.images.forEach((imageUrl, index) => {
                    const card = document.createElement('div');
                    card.className = 'result-card';
                    card.innerHTML = `
                        <img src="${imageUrl}" alt="Design Proposal ${index + 1}">
                    `;
                    imageGrid.appendChild(card);
                });
                resultSection.classList.remove('hidden');

                // Scroll to results
                resultSection.scrollIntoView({ behavior: 'smooth' });
            } else {
                alert('Aucune image générée. Vérifiez la console.');
            }

        } catch (error) {
            console.error('Error:', error);
            alert(`Erreur: ${error.message}`);
        } finally {
            // Reset UI
            loadingIndicator.classList.add('hidden');
            generateBtn.classList.remove('hidden');
        }
    });
});
