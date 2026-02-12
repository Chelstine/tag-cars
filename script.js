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

        // Collect Form Data as FormData (to support file upload)
        const formData = new FormData();
        formData.append('vehicle_type', document.getElementById('vehicle_type').value);
        formData.append('vehicle_category', document.getElementById('vehicle_category').value);
        formData.append('vehicle_view', document.getElementById('vehicle_view').value);
        formData.append('coverage_type', document.getElementById('coverage_type').value);
        formData.append('coverage_zones', document.getElementById('coverage_zones').value);
        formData.append('industry', document.getElementById('industry').value);
        formData.append('brand_name', document.getElementById('brand_name').value);
        formData.append('main_text', document.getElementById('main_text').value);
        formData.append('key_info', document.getElementById('key_info').value);
        formData.append('style', document.getElementById('style').value);
        formData.append('primary_colors', document.getElementById('primary_colors').value);
        formData.append('constraints', document.getElementById('constraints').value);

        // Append logo file if selected
        const logoInput = document.getElementById('logo_file');
        if (logoInput.files.length > 0) {
            formData.append('logo_file', logoInput.files[0]);
        }

        try {
            // Send to Backend (FormData, no Content-Type header - browser sets it with boundary)
            const response = await fetch('/api/generate', {
                method: 'POST',
                body: formData
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

                resultSection.scrollIntoView({ behavior: 'smooth' });
            } else {
                alert('Aucune image générée. Vérifiez la console.');
            }

        } catch (error) {
            console.error('Error:', error);
            alert(`Erreur: ${error.message}`);
        } finally {
            loadingIndicator.classList.add('hidden');
            generateBtn.classList.remove('hidden');
        }
    });
});
